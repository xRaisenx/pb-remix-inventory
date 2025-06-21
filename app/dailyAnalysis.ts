import prisma from "./db.server";
import shopify from "./shopify.server";
import { Session } from '@shopify/shopify-api';

// ... (GraphQL response interfaces remain the same)

export async function syncShopifyProductsForShop(shopDomain: string, session: Session) {
  const client = new shopify.api.clients.Graphql({ session });
  const shopId = (await prisma.shop.findUnique({ where: { shop: shopDomain } }))?.id;
  if (!shopId) throw new Error(`Shop ${shopDomain} not found in DB.`);

  let totalUpsertedCount = 0;
  let hasNextPage = true;
  let cursor = null;
  const BATCH_SIZE = 50; // Shopify fetch batch size

  console.log(`[CRON SYNC][${shopDomain}] Starting Shopify product data sync. Batch size: ${BATCH_SIZE}`);

  while (hasNextPage) {
    let productsInBatch = [];
    try {
      const response: any = await client.query({
        data: {
          query: `#graphql
            query shopifyProductsSync($limit: Int!, $cursor: String) {
              products(first: $limit, after: $cursor, query:"status:active") {
                edges { node { id title vendor } } # Add other fields if needed by AI or local schema
                pageInfo { hasNextPage endCursor }
              }
            }`,
          variables: { limit: BATCH_SIZE, cursor: cursor },
        },
      });

      const productsData = response.body.data.products;
      if (!productsData || !productsData.edges) {
        console.warn(`[CRON SYNC][${shopDomain}] No product data in this batch or unexpected structure. Cursor: ${cursor}`);
        hasNextPage = false;
        continue;
      }

      productsInBatch = productsData.edges.map((e: any) => e.node);
      hasNextPage = productsData.pageInfo.hasNextPage;
      cursor = productsData.pageInfo.endCursor;

    } catch (e: any) {
      console.error(`[CRON SYNC][${shopDomain}] Error fetching products batch from Shopify:`, e.message);
      // Optional: Implement retry logic here or break
      hasNextPage = false; // Stop on Shopify API error for this batch
      break;
    }

    if (productsInBatch.length === 0 && hasNextPage) {
      // This case should ideally not happen if hasNextPage is true, but as a safeguard.
      console.warn(`[CRON SYNC][${shopDomain}] Shopify indicated more pages but returned empty batch. Cursor: ${cursor}. Ending sync.`);
      hasNextPage = false;
      break;
    }
    if (productsInBatch.length === 0 && !hasNextPage) {
        break; // End of products
    }

    console.log(`[CRON SYNC][${shopDomain}] Processing batch of ${productsInBatch.length} products. Shopify cursor: ${cursor}`);

    for (const sp of productsInBatch) {
      try {
        await prisma.product.upsert({
          where: { shopifyId: sp.id },
          create: {
            shopifyId: sp.id,
            title: sp.title,
            vendor: sp.vendor ?? 'Unknown Vendor',
            shopId: shopId,
            // Ensure all required fields for Product model are present or have defaults
            // e.g. productType, status might need defaults if not fetched
          },
          update: {
            title: sp.title,
            vendor: sp.vendor ?? 'Unknown Vendor',
          },
        });
        totalUpsertedCount++;
      } catch (e: any) {
          console.error(`[CRON SYNC][${shopDomain}] Error upserting product ${sp.id} (Title: ${sp.title}) into DB:`, e.message);
      }
    }

    // Optional: Small delay between batches if Shopify rate limits are a concern,
    // or if DB load is high.
    // if (hasNextPage) await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.log(`[CRON SYNC][${shopDomain}] Finished Shopify product data sync. Total upserted/updated: ${totalUpsertedCount}.`);
  return { success: true, count: totalUpsertedCount };
}

export async function performDailyProductSync(shopDomain: string, session: Session) {
  // Note: The `syncProductsAndInventory` from `shopify.sync.server.ts` is more comprehensive.
  // This `syncShopifyProductsForShop` is simpler and was what was originally in `dailyAnalysis.ts`.
  // Depending on requirements (e.g., if AI needs variant details, inventory levels per location),
  // it might be better to call the more comprehensive sync from `shopify.sync.server.ts` here instead,
  // or enhance this one.
  // For now, I'm keeping the logic as refactored from the original `dailyAnalysis.ts`.
  console.log(`[CRON SYNC] Starting daily product data refresh for ${shopDomain}...`);
  const result = await syncShopifyProductsForShop(shopDomain, session); // This is the batched version
  if (result.success) {
    console.log(`[CRON SYNC][${shopDomain}] Successfully synced ${result.count} products.`);
  } else {
    console.error(`[CRON SYNC][${shopDomain}] Failed to sync products.`);
  }
  return result;
}
