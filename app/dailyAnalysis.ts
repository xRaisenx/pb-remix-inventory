// app/dailyAnalysis.ts

import prisma from "./db.server";
import { shopifyApi, ApiVersion, GraphqlQueryError, Session } from '@shopify/shopify-api'; // Added Session import

// Define interfaces for better type safety with Shopify's GraphQL API responses
interface ShopifyProductNode {
  id: string; // Shopify Product GID e.g. "gid://shopify/Product/12345"
  title: string;
  vendor: string | null; // Vendor can be null from Shopify
}

interface ShopifyProductsEdge {
  node: ShopifyProductNode;
}

interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ShopifyProductsData {
  products: {
    edges: ShopifyProductsEdge[];
    pageInfo: ShopifyPageInfo;
  };
}

// Generic GraphQL response structure
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string }; [key: string]: any }>;
}

// Result structure for sync operations
interface SyncResult {
  success: boolean;
  count?: number; // Number of items processed/synced
  error?: string; // Error message if success is false
  message?: string; // General message, e.g., for overall summary
}

/**
 * Synchronizes products from a specific Shopify store to the local database.
 * It fetches products using the Shopify Admin API with pagination and then
 * upserts (updates or creates) them into the local Prisma database.
 *
 * @param shopDomain The domain of the Shopify store (e.g., "my-shop.myshopify.com").
 * @param accessToken The Shopify Admin API access token for the store.
 * @param localShopId The local database ID (UUID) for this shop, used to associate products.
 * @returns A promise that resolves to a SyncResult object indicating success or failure and count of synced products.
 */
export async function syncShopifyProductsForShop(
  shopDomain: string,
  accessToken: string,
  localShopId: string
): Promise<SyncResult> {
  try {
    // Initialize the Shopify API client specifically for the given shop and access token.
    // This setup is crucial for making authenticated calls to Shopify's Admin API.
    // Using a stable API version is recommended for background jobs.
    const shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY!,
      apiSecretKey: process.env.SHOPIFY_API_SECRET!,
      scopes: ['read_products'], // Ensure these scopes are granted by the shop during OAuth
      apiVersion: ApiVersion.October23, // Using a specific, stable API version
      isEmbeddedApp: false, // Background tasks are not embedded
      hostName: new URL(process.env.SHOPIFY_APP_URL!).hostname,
    });

    // Construct a Session object as required by shopify.clients.Graphql
    const sessionForGraphQL: Session = new Session({
      id: `sync_session_offline_${shopDomain}`, // Or a more robust unique ID
      shop: shopDomain,
      state: "active_placeholder_state", // Needs a string state
      isOnline: false,
      accessToken: accessToken, // This is the shop's offline token
      // scope: "read_products", // Optional: specify scopes if needed for validation, though client uses what token has
      // expires: undefined, // Offline tokens typically don't expire in the same way
      // userId: undefined, // Not typically used for offline admin access
    });

    const adminApiClient = new shopify.clients.Graphql({
      session: sessionForGraphQL,
    });

    let allShopifyProducts: ShopifyProductNode[] = [];
    let hasNextPage = true;
    let endCursor: string | null = null;
    const productQueryLimit = 50; // Number of products to fetch per API call (max 250, 50 is safer)

    console.log(`[SYNC][${shopDomain}] Starting product fetch. Query limit: ${productQueryLimit} products/page.`);

    // Loop to fetch all active products using Shopify's pagination (cursor-based)
    while (hasNextPage) {
      const query = `#graphql
        query shopifyProductsSync($limit: Int!, $cursor: String) {
          products(first: $limit, after: $cursor, query:"status:active") {
            edges {
              node {
                id
                title
                vendor
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`;

      const variables: { limit: number; cursor: string | null } = { limit: productQueryLimit, cursor: endCursor };

      try {
        // Perform the GraphQL query to Shopify
        const response = await adminApiClient.query<GraphQLResponse<ShopifyProductsData>>({
          data: { query, variables }, // `data` property for query and variables
        });

        const resultBody = response.body;

        // Check for GraphQL execution errors in the response
        if (resultBody?.errors && resultBody.errors.length > 0) {
          const errorMessages = resultBody.errors.map(e => e.message).join(', ');
          console.error(`[SYNC ERROR][${shopDomain}] GraphQL errors during product fetch: ${errorMessages}`, JSON.stringify(resultBody.errors, null, 2));
          throw new Error(`GraphQL errors encountered: ${errorMessages}`);
        }

        const productsData = resultBody?.data?.products;
        // Ensure the expected data structure is present
        if (!productsData || !productsData.edges || !productsData.pageInfo) {
          console.warn(`[SYNC WARN][${shopDomain}] Invalid or empty products data structure in GraphQL response with cursor ${endCursor ?? 'initial'}. Response:`, JSON.stringify(resultBody, null, 2));
          hasNextPage = false; // Stop pagination to prevent potential infinite loops
          continue;
        }

        const fetchedProducts: ShopifyProductNode[] = productsData.edges.map(e => e.node);
        allShopifyProducts = allShopifyProducts.concat(fetchedProducts);

        hasNextPage = productsData.pageInfo.hasNextPage;
        endCursor = productsData.pageInfo.endCursor;

        console.log(`[SYNC][${shopDomain}] Fetched ${fetchedProducts.length} products. Total so far: ${allShopifyProducts.length}. HasNextPage: ${hasNextPage}. Next Cursor: ${endCursor ?? 'N/A'}`);

        if (!hasNextPage) {
          console.log(`[SYNC][${shopDomain}] Product fetch completed. Total products fetched: ${allShopifyProducts.length}.`);
        }

      } catch (error: unknown) {
        let errorMessage = "Unknown error during product fetch pagination.";
        if (error instanceof GraphqlQueryError) { // Specifically catch Shopify API client errors
            errorMessage = `Shopify API Client Error: ${JSON.stringify(error.response, null, 2)}`;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        console.error(`[SYNC ERROR][${shopDomain}] Failed to fetch products (cursor: ${endCursor ?? 'initial'}): ${errorMessage}`, error);
        return { success: false, error: `Product fetch failed for shop ${shopDomain}: ${errorMessage}` };
      }
    }

    // Upsert fetched products into the local Prisma database
    let upsertedCount = 0;
    if (allShopifyProducts.length > 0) {
        console.log(`[SYNC][${shopDomain}] Starting database upsert for ${allShopifyProducts.length} products.`);
        for (const sp of allShopifyProducts) {
          if (!sp.id || !sp.title) { // Basic validation for essential fields
            console.warn(`[SYNC WARN][${shopDomain}] Skipping product due to missing Shopify ID or title:`, sp);
            continue;
          }

          // Prisma's `upsert` updates a record if it exists (based on `where`), or creates it otherwise.
          // The `vendor` field in Prisma's Product model is non-nullable, so provide a default.
          await prisma.product.upsert({
            where: { shopifyId: sp.id }, // Unique identifier for existing product check
            create: {
              shopifyId: sp.id,
              title: sp.title,
              shopId: localShopId, // Associate with the local shop record
              vendor: sp.vendor ?? 'Unknown Vendor', // Default if vendor is null from Shopify
            },
            update: {
              title: sp.title,
              vendor: sp.vendor ?? 'Unknown Vendor',
            },
          });
          upsertedCount++;
        }
        console.log(`[SYNC][${shopDomain}] Database upsert process completed. ${upsertedCount} products synced/updated.`);
    } else {
        console.log(`[SYNC][${shopDomain}] No products fetched from Shopify to upsert.`);
    }

    return { success: true, count: upsertedCount };

  } catch (error: unknown) {
    let errorMessage = "An unexpected error occurred in syncShopifyProductsForShop.";
     if (error instanceof Error) {
        errorMessage = error.message;
    }
    console.error(`[SYNC ERROR][${shopDomain}] Top-level failure in product synchronization: ${errorMessage}`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Orchestrates the daily product synchronization process for all active shops.
 * It retrieves all shops with an access token and then calls `syncShopifyProductsForShop` for each one.
 * Summarizes the results of the sync operations.
 * @returns A promise that resolves to an overall SyncResult object, summarizing attempts, successes, and total products synced.
 */
export async function performDailyProductSync(): Promise<SyncResult> {
  console.log("[CRON SYNC] Starting daily product synchronization routine for all shops...");
  const shops = await prisma.shop.findMany({
    where: { accessToken: { not: undefined } }, // Only process shops that have an active access token
  });

  if (shops.length === 0) {
    console.log("[CRON SYNC] No active shops found to sync products for.");
    return { success: true, message: "No shops to sync.", count: 0 };
  }

  console.log(`[CRON SYNC] Found ${shops.length} shops to process for product synchronization.`);
  let totalSyncedProducts = 0;
  let shopsAttempted = 0;
  let shopsSucceeded = 0;

  for (const shop of shops) {
    if (!shop.accessToken) {
      // This check is theoretically redundant due to the `where` clause in `findMany`,
      // but serves as a safeguard.
      console.warn(`[CRON SYNC][${shop.shop}] Shop has no access token, skipping product sync.`);
      continue;
    }
    shopsAttempted++;
    console.log(`[CRON SYNC][${shop.shop}] Attempting to sync products...`);
    const result = await syncShopifyProductsForShop(shop.shop, shop.accessToken, shop.id);

    if (result.success && result.count !== undefined) {
      totalSyncedProducts += result.count;
      shopsSucceeded++;
      console.log(`[CRON SYNC][${shop.shop}] Successfully synced ${result.count} products.`);
    } else {
      console.error(`[CRON SYNC][${shop.shop}] Failed to sync products. Error: ${result.error || 'Unknown error'}`);
    }
  }

  const summaryMessage = `Daily product sync finished. Shops Processed: ${shopsAttempted}, Shops Succeeded: ${shopsSucceeded}. Total products synced/updated across all shops: ${totalSyncedProducts}.`;
  console.log(`[CRON SYNC] ${summaryMessage}`);
  return { success: true, message: summaryMessage, count: totalSyncedProducts };
}
