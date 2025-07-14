// app/services/shopify.sync.server.ts
import shopify from '~/shopify.server'; // Your Shopify app instance
import prisma from '~/db.server';       // Your Prisma client instance
import type { Session } from "@shopify/shopify-api"; // Shopify API Session type
import { updateAllProductMetricsForShop } from './product.service'; // Service to update metrics post-sync

// --- Local Type Definitions for GraphQL Payloads ---
// These help in typing the expected response from Shopify's GraphQL API.
interface ShopifyLocationNode { id: string; name: string; }
interface ShopifyInventoryQuantity {
  name: string;
  quantity: number;
}
interface ShopifyInventoryLevelNode {
  quantities: ShopifyInventoryQuantity[];
  location: { id: string; };
}
interface ShopifyInventoryItemNode {
  id: string;
  inventoryLevels?: { edges: { node: ShopifyInventoryLevelNode }[] } | null; // Can be null if no levels
}
interface ShopifyVariantNode {
  id: string; // Shopify Variant GID
  title?: string | null; // Variant title (e.g., "Small", "Red")
  sku?: string | null;
  price: string; // Price is usually a string from GraphQL, convert to Decimal/Float as needed
  inventoryQuantity?: number | null; // Overall quantity, often less reliable than inventoryLevels
  inventoryItem?: ShopifyInventoryItemNode | null; // Link to InventoryItem
}
interface ShopifyProductNode {
  id: string; // Shopify Product GID
  title: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  variants: { edges: { node: ShopifyVariantNode }[] };
}
interface PageInfo { hasNextPage: boolean; endCursor: string | null; }
// Generic GraphQL response structure
interface GraphQLResponse<T> { data: T; errors?: Array<{ message: string; [key: string]: any }>; }
// --- End Type Definitions ---

// Helper to get Prisma Shop ID
async function getShopId(shopDomain: string): Promise<string> {
  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shopRecord) throw new Error(`Shop ${shopDomain} not found in local database.`);
  return shopRecord.id;
}

// Fetches Shopify locations and upserts them into local DB, returns a map of GID -> Prisma ID
async function getOrSyncLocations(client: any, shopId: string, shopDomain: string): Promise<Map<string, string>> {
  const locationsMap = new Map<string, string>();
  let hasNextPage = true;
  let cursor: string | null = null;
  console.log(`[Sync][${shopDomain}] Fetching locations...`);

  while (hasNextPage) {
    const response = await client.query({ // Corrected client usage
      data: {
        query: `#graphql
          query GetLocations($cursor: String) {
            locations(first: 50, after: $cursor) { # Max 250, using 50 for safety
              edges { node { id name } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
        variables: { cursor },
      },
    });

    const resultBody = response.body as GraphQLResponse<{ locations: { edges: { node: ShopifyLocationNode }[], pageInfo: PageInfo } }>;
    if (resultBody.errors) {
      console.error(`[Sync][${shopDomain}] Error fetching locations from Shopify:`, resultBody.errors);
      throw new Error("Failed to fetch locations from Shopify.");
    }
    if (!resultBody.data || !resultBody.data.locations) {
        console.warn(`[Sync][${shopDomain}] No location data returned from Shopify in this batch.`);
        hasNextPage = false;
        continue;
    }


    const shopifyLocations = resultBody.data.locations.edges.map(edge => edge.node);
    for (const loc of shopifyLocations) {
      try {
        const warehouse = await prisma.warehouse.upsert({
          where: { shopifyLocationGid: loc.id }, // Assumes shopifyLocationGid is unique
          update: { name: loc.name },
          create: { 
            id: loc.id, // Use location ID as warehouse ID
            name: loc.name, 
            shopifyLocationGid: loc.id, 
            shopId: shopId, 
            location: loc.name,
            createdAt: new Date(),
            updatedAt: new Date()
          }, // Ensure shopId is linked
        });
        locationsMap.set(loc.id, warehouse.id); // Map Shopify GID to Prisma Warehouse ID
      } catch (e: any) {
        console.error(`[Sync][${shopDomain}] Error upserting location ${loc.name} (ID: ${loc.id}): ${e.message}`);
      }
    }
    hasNextPage = resultBody.data.locations.pageInfo.hasNextPage;
    cursor = resultBody.data.locations.pageInfo.endCursor;
    console.log(`[Sync][${shopDomain}] Fetched ${shopifyLocations.length} locations. HasNextPage: ${hasNextPage}`);
  }
  console.log(`[Sync][${shopDomain}] Finished fetching/syncing ${locationsMap.size} locations.`);
  return locationsMap;
}

// Main sync function
export async function syncProductsAndInventory(shopDomain: string, session: Session) {
  // Corrected GraphQL client initialization
  const client = new (shopify as any).clients.Graphql({ session });
  const shopId = await getShopId(shopDomain); // Get Prisma shop ID
  const locationsMap = await getOrSyncLocations(client, shopId, shopDomain); // Get Shopify GID -> Prisma Warehouse ID map

  let hasNextPageProducts = true;
  let productCursor: string | null = null;
  let totalProductsSynced = 0;
  const PRODUCT_BATCH_SIZE = 10; // Max 250, Shopify recommends smaller batches for complex queries
  const VARIANT_BATCH_SIZE = 20; // Max 250
  const LOCATION_LEVEL_BATCH_SIZE = 10; // Max 250 for inventoryLevels

  console.log(`[Sync][${shopDomain}] Starting product and inventory sync. Batch size: ${PRODUCT_BATCH_SIZE} products.`);

  while (hasNextPageProducts) {
    console.log(`[Sync][${shopDomain}] Fetching product batch. Cursor: ${productCursor}`);
    const response = await client.query({ // Corrected client usage
      data: {
        query: `#graphql
          query GetProducts($cursor: String, $variantCount: Int!, $locationLevelCount: Int!, $productBatchSize: Int!) {
            products(first: $productBatchSize, after: $cursor) {
              edges {
                node {
                  id title vendor productType tags
                  variants(first: $variantCount) { # Fetch variants for each product
                    edges {
                      node {
                        id title sku price inventoryQuantity
                        inventoryItem {
                          id
                          inventoryLevels(first: $locationLevelCount) { # Fetch inventory levels for each variant's item
                            edges { node { quantities(names: ["available"]) { name quantity } location { id } } }
                          }
                        }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }`,
        variables: { cursor: productCursor, variantCount: VARIANT_BATCH_SIZE, locationLevelCount: LOCATION_LEVEL_BATCH_SIZE, productBatchSize: PRODUCT_BATCH_SIZE },
      },
    });

    const resultBody = response.body as GraphQLResponse<{ products: { edges: { node: ShopifyProductNode }[], pageInfo: PageInfo } }>;
    if (resultBody.errors) {
      console.error(`[Sync][${shopDomain}] Error fetching products from Shopify:`, resultBody.errors);
      throw new Error("Failed to fetch products from Shopify.");
    }
     if (!resultBody.data || !resultBody.data.products || resultBody.data.products.edges.length === 0) {
        console.log(`[Sync][${shopDomain}] No more products returned from Shopify or empty batch.`);
        hasNextPageProducts = false;
        continue;
    }

    const shopifyProducts = resultBody.data.products.edges.map(edge => edge.node);
    console.log(`[Sync][${shopDomain}] Processing ${shopifyProducts.length} products in this batch.`);

    for (const sp of shopifyProducts) {
      try {
        const productRecord = await prisma.product.upsert({
          where: { shopifyId: sp.id }, // Assumes shopifyId is unique on Product model
          update: { title: sp.title, vendor: sp.vendor || 'Unknown', productType: sp.productType, tags: sp.tags },
          create: {
            id: sp.id, // Use product ID as the primary key
            shopifyId: sp.id, title: sp.title, vendor: sp.vendor || 'Unknown',
            productType: sp.productType, tags: sp.tags, shopId: shopId,
            status: 'Unknown', trending: false, // Default status/trending
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        totalProductsSynced++;

        for (const variantEdge of sp.variants.edges) {
          const v = variantEdge.node;
          await prisma.variant.upsert({
            where: { shopifyId: v.id }, // Assumes shopifyId is unique on Variant model
            update: { title: v.title, sku: v.sku, price: parseFloat(v.price) || 0, inventoryQuantity: v.inventoryQuantity, inventoryItemId: v.inventoryItem?.id },
            create: {
              id: v.id, // Use variant ID as the primary key
              shopifyId: v.id, productId: productRecord.id, title: v.title, sku: v.sku,
              price: parseFloat(v.price) || 0, inventoryQuantity: v.inventoryQuantity, inventoryItemId: v.inventoryItem?.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          if (v.inventoryItem?.inventoryLevels?.edges) {
            for (const levelEdge of v.inventoryItem.inventoryLevels.edges) {
              const invLevel = levelEdge.node;
              const prismaWarehouseId = locationsMap.get(invLevel.location.id); // Get Prisma Warehouse ID
              if (prismaWarehouseId) {
                // Find the 'available' quantity from quantities array
                const availableObj = invLevel.quantities.find(q => q.name === 'available');
                const availableQty = availableObj ? availableObj.quantity : 0;
                await prisma.inventory.upsert({
                  where: { productId_warehouseId: { productId: productRecord.id, warehouseId: prismaWarehouseId } },
                  update: { availableQuantity: availableQty },
                  create: { 
                    id: `${productRecord.id}-${prismaWarehouseId}`, // Composite ID
                    productId: productRecord.id, 
                    warehouseId: prismaWarehouseId, 
                    quantity: availableQty, // Use quantity instead of availableQuantity
                    availableQuantity: availableQty,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                });
              } else {
                console.warn(`[Sync][${shopDomain}] Shopify Location GID ${invLevel.location.id} not found in local warehouse map for product ${sp.title}, variant ${v.sku}. Inventory for this location not synced.`);
              }
            }
          }
        }
      } catch (e: any) {
        console.error(`[Sync][${shopDomain}] Error processing product ${sp.title} (ID: ${sp.id}): ${e.message}`);
        // Decide if you want to skip this product and continue, or stop the sync.
      }
    }
    hasNextPageProducts = resultBody.data.products.pageInfo.hasNextPage;
    productCursor = resultBody.data.products.pageInfo.endCursor;
    console.log(`[Sync][${shopDomain}] Product batch processed. Total synced so far: ${totalProductsSynced}. HasNextPage: ${hasNextPageProducts}`);
  }
  console.log(`[Sync][${shopDomain}] Product and inventory data sync completed. Total products processed: ${totalProductsSynced}.`);
  console.log(`[Sync][${shopDomain}] Starting calculation of product metrics...`);
  try {
    const metricsResult = await updateAllProductMetricsForShop(shopId);
    console.log(`[Sync][${shopDomain}] Product metrics calculation finished. ${metricsResult.message}`);
  } catch (e: any) {
    console.error(`[Sync][${shopDomain}] Error during product metrics update: ${e.message}`);
  }
  console.log(`[Sync][${shopDomain}] Full sync process finished.`);
}
