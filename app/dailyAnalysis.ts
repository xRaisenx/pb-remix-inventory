import prisma from "./db.server";
import shopify from "./shopify.server";
import type { Session } from '@shopify/shopify-api';

export async function syncShopifyProductsForShop(shopDomain: string, session: Session) {
  // Corrected GraphQL client initialization
  const client = new (shopify as any).clients.Graphql({ session });
  const shopId = (await prisma.shop.findUnique({ where: { shop: shopDomain } }))?.id;
  if (!shopId) throw new Error(`Shop ${shopDomain} not found in DB.`);

  let totalUpsertedCount = 0;
  let hasNextPage = true;
  let cursor: string | null = null;
  const BATCH_SIZE = 50; // Shopify product query limit

  console.log(`[CRON SYNC][${shopDomain}] Starting Shopify product data sync. Batch size: ${BATCH_SIZE}`);

  while (hasNextPage) {
    let productsInBatch = [];
    try {
      const response: any = await client.query({ // Corrected client usage
        data: {
          query: `#graphql
            query shopifyProductsSync($limit: Int!, $cursor: String) {
              products(first: $limit, after: $cursor, query:"status:active") { # Added status:active as per user example
                edges { node { id title vendor } } # Simplified fields as per user example
                pageInfo { hasNextPage endCursor }
              }
            }`,
          variables: { limit: BATCH_SIZE, cursor: cursor },
        },
      });

      // It's good practice to check the response structure
      const productsData = response.body.data.products;
      if (!productsData || !productsData.edges) {
        console.warn(`[CRON SYNC][${shopDomain}] No product data in this batch or unexpected structure. Cursor: ${cursor}`);
        hasNextPage = false; // Stop if no data or bad structure
        continue;
      }

      productsInBatch = productsData.edges.map((e: any) => e.node);
      hasNextPage = productsData.pageInfo.hasNextPage;
      cursor = productsData.pageInfo.endCursor;

    } catch (e: any) {
      console.error(`[CRON SYNC][${shopDomain}] Error fetching products batch from Shopify:`, e.message);
      // Depending on the error, you might want to retry or break
      hasNextPage = false; // Stop on error for now
      break;
    }

    if (productsInBatch.length === 0) {
        // This can happen if hasNextPage was true but the next page is empty
        break;
    }

    console.log(`[CRON SYNC][${shopDomain}] Processing batch of ${productsInBatch.length} products. Shopify cursor: ${cursor}`);

    // Batch upsert into Prisma (if possible and makes sense for your DB load)
    // For simplicity, keeping individual upserts as in the original code
    for (const sp of productsInBatch) {
      try {
        await prisma.product.upsert({
          where: { shopifyId: sp.id },
          create: {
            id: sp.id, // Add required id field
            shopifyId: sp.id,
            title: sp.title,
            vendor: sp.vendor ?? 'Unknown Vendor', // Handle potential null vendor
            shopId: shopId,
            updatedAt: new Date(), // Add required updatedAt field
            // Initialize other fields as needed, e.g., status, trending
            // status: 'Unknown',
            // trending: false,
          },
          update: {
            title: sp.title,
            vendor: sp.vendor ?? 'Unknown Vendor',
            updatedAt: new Date(),
          },
        });
        totalUpsertedCount++;
      } catch (e: any) {
          // Log individual product upsert errors but continue with the batch
          console.error(`[CRON SYNC][${shopDomain}] Error upserting product ${sp.id} (Title: ${sp.title}) into DB:`, e.message);
      }
    }
  }
  console.log(`[CRON SYNC][${shopDomain}] Finished Shopify product data sync. Total upserted/updated: ${totalUpsertedCount}.`);
  return { success: true, count: totalUpsertedCount };
}


export async function performDailyProductSync(shopDomain: string, session: Session) {
  console.log(`[CRON SYNC] Starting daily product data refresh for ${shopDomain}...`);
  const result = await syncShopifyProductsForShop(shopDomain, session);
  if (result.success) {
    console.log(`[CRON SYNC][${shopDomain}] Successfully synced ${result.count} products.`);
  } else {
    // The syncShopifyProductsForShop in the example doesn't return { success: false }
    // but throws errors or returns { success: true }.
    // This part might need adjustment based on actual error handling in syncShopifyProductsForShop.
    console.error(`[CRON SYNC][${shopDomain}] Failed to sync products.`);
  }
  return result;
}
