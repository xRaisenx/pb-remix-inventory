import prisma from "./db.server";
import shopify from "./shopify.server";
import { Session } from '@shopify/shopify-api';

// ... (GraphQL response interfaces remain the same)

export async function syncShopifyProductsForShop(shopDomain: string, session: Session) {
  const client = new shopify.api.clients.Graphql({ session });
  const shopId = (await prisma.shop.findUnique({ where: { shop: shopDomain } }))?.id;
  if (!shopId) throw new Error(`Shop ${shopDomain} not found in DB.`);

  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response: any = await client.query({
      data: {
        query: `#graphql
          query shopifyProductsSync($limit: Int!, $cursor: String) {
            products(first: $limit, after: $cursor, query:"status:active") {
              edges { node { id title vendor } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
        variables: { limit: 50, cursor: cursor },
      },
    });

    const productsData = response.body.data.products;
    allProducts.push(...productsData.edges.map((e: any) => e.node));
    hasNextPage = productsData.pageInfo.hasNextPage;
    cursor = productsData.pageInfo.endCursor;
  }

  let upsertedCount = 0;
  for (const sp of allProducts) {
    await prisma.product.upsert({
      where: { shopifyId: sp.id },
      create: {
        shopifyId: sp.id,
        title: sp.title,
        vendor: sp.vendor ?? 'Unknown Vendor',
        shopId: shopId,
      },
      update: {
        title: sp.title,
        vendor: sp.vendor ?? 'Unknown Vendor',
      },
    });
    upsertedCount++;
  }
  return { success: true, count: upsertedCount };
}

export async function performDailyProductSync(shopDomain: string, session: Session) {
  console.log(`[CRON SYNC] Starting daily product sync for ${shopDomain}...`);
  const result = await syncShopifyProductsForShop(shopDomain, session);
  if (result.success) {
    console.log(`[CRON SYNC][${shopDomain}] Successfully synced ${result.count} products.`);
  } else {
    console.error(`[CRON SYNC][${shopDomain}] Failed to sync products.`);
  }
  return result;
}
