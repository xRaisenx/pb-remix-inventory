// app/services/shopify.sync.server.ts
import shopify from '~/shopify.server';
import prisma from '~/db.server';
import { Session } from "@shopify/shopify-api"; // Import Session
// Updated API version import path
import type { Product as ShopifyProduct, ProductVariant as ShopifyVariant, InventoryLevel as ShopifyInventoryLevel, Location as ShopifyLocation } from '@shopify/graphql-admin-api/2024-10'; // Using 2024-10
import { updateAllProductMetricsForShop } from './product.service'; // Adjust path if needed

// Define interfaces for GraphQL responses if not already fully covered by imported types
interface ShopifyLocationNode {
  id: string;
  name: string;
}

interface ShopifyLocationsEdge {
  node: ShopifyLocationNode;
}

interface ShopifyLocationsPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ShopifyLocationsData {
  locations: {
    edges: ShopifyLocationsEdge[];
    pageInfo: ShopifyLocationsPageInfo;
  };
}

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; extensions?: { code?: string }; [key: string]: any }>;
}


// Helper function to get shop ID
async function getShopId(shopDomain: string): Promise<string> {
  const shopRecord = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { id: true } // Only select the id
  });
  if (!shopRecord) {
    throw new Error(`Shop with domain ${shopDomain} not found in the database.`);
  }
  return shopRecord.id;
}

interface TransformedProduct {
  shopifyId: string;
  title: string;
  vendor: string;
  productType?: string;
  // Fields to be added based on issue spec, default for now
  salesVelocityFloat: number | null;
  stockoutDays: number | null;
  status: string | null;
  trending: boolean;
  category?: string | null; // Added category
  tags?: string[]; // Added tags
  lastRestockedDate?: Date | null; // Added lastRestockedDate
}

interface TransformedVariant {
  shopifyId: string;
  title?: string; // Added variant title
  sku?: string;
  price: number;
  inventoryQuantity: number; // Total across all locations for this variant
  inventoryItemId?: string; // Shopify's inventory_item_id
}

interface TransformedInventory {
  quantity: number;
  locationShopifyGid: string; // Shopify Location GID
}

// Function to fetch all locations and ensure they exist in Prisma, returning a map
// Using 'any' for GraphQL client type for now, can be refined
async function getOrSyncLocations(client: any, shopId: string): Promise<Map<string, string>> {
  const locationsMap = new Map<string, string>(); // ShopifyLocationGid -> Prisma Warehouse ID
  let hasNextPage = true;
  let cursor: string | null = null;
  const locations: ShopifyLocationNode[] = [];

  while (hasNextPage) {
    const response = await client( // Changed from admin.graphql
      `#graphql
      query GetLocations($cursor: String) {
        locations(first: 250, after: $cursor) { # Shopify limits to 250 by default
          edges {
            node {
              id
              name
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { variables: { cursor } }
    );
    const resultBody = await response.json() as GraphQLResponse<ShopifyLocationsData>;

    if (resultBody.errors) {
      console.error("Error fetching locations:", resultBody.errors);
      throw new Error("Failed to fetch locations from Shopify.");
    }
    if (!resultBody.data || !resultBody.data.locations) {
        console.warn("No location data returned from Shopify or unexpected structure.");
        break;
    }

    locations.push(...resultBody.data.locations.edges.map((edge: ShopifyLocationsEdge) => edge.node));
    hasNextPage = resultBody.data.locations.pageInfo.hasNextPage;
    cursor = resultBody.data.locations.pageInfo.endCursor;
  }

  for (const loc of locations) {
    // Upsert Warehouse based on shopifyLocationGid, linking to the shop
    const warehouse = await prisma.warehouse.upsert({
      where: { shopifyLocationGid: loc.id },
      update: { name: loc.name, shopId: shopId }, // Ensure shopId is updated if location is re-linked
      create: {
        name: loc.name,
        shopifyLocationGid: loc.id,
        shopId: shopId,
        location: loc.name, // Or more detailed address if available and needed
      },
    });
    locationsMap.set(loc.id, warehouse.id);
  }
  return locationsMap;
}

export async function syncProductsAndInventory(shopDomain: string, session: Session) { // Added session parameter
  // Create a new GraphQL client from the session
  const client = new shopify.api.clients.Graphql({ session });

  const shopId = await getShopId(shopDomain);
  const locationsMap = await getOrSyncLocations(client, shopId); // Pass client instead of admin

  let hasNextPage = true;
  let cursor = null;

  console.log(`Starting product sync for shop: ${shopDomain} (ID: ${shopId})`);

  while (hasNextPage) {
    const response = await client( // Changed from admin.graphql
      `#graphql
      query GetProducts($cursor: String) {
        products(first: 10, after: $cursor) {
          edges {
            node {
              id
              title
              vendor
              productType
              tags
              variants(first: 20) {
                edges {
                  node {
                    id
                    title # Added variant title
                    sku
                    price
                    inventoryQuantity # This is total quantity, might need per-location
                    inventoryItem {
                       id
                       inventoryLevels(first: 10) { # Get levels for multiple locations
                        edges {
                            node {
                                available
                                location {
                                    id # This is the Shopify Location GID
                                }
                            }
                        }
                       }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { variables: { cursor } }
    );

    const resultBody = await response.json(); // Keep this as any for now due to complex nested structure of product query
    if (resultBody.errors) {
        console.error("Error fetching products:", resultBody.errors);
        throw new Error("Failed to fetch products from Shopify.");
    }
    if (!resultBody.data || !resultBody.data.products || !resultBody.data.products.edges) {
        console.warn("No product data returned from Shopify or unexpected structure.");
        hasNextPage = false; // Stop if no data
        continue;
    }

    const products = resultBody.data.products.edges.map((edge: { node: ShopifyProduct }) => edge.node);

    for (const shopifyProduct of products) { // Type is now inferred from the map
      const productData: TransformedProduct = {
        shopifyId: shopifyProduct.id,
        title: shopifyProduct.title,
        vendor: shopifyProduct.vendor || 'Unknown Vendor',
        productType: shopifyProduct.productType || undefined,
        tags: shopifyProduct.tags || [], // Include tags
        // Initialize new fields with defaults or null
        salesVelocityFloat: null, // Will be calculated later
        stockoutDays: null,     // Will be calculated later
        status: 'Unknown', // Default status, will be calculated later
        trending: false,   // Default trending, will be calculated later
        category: shopifyProduct.productType || null, // Use productType as category for now
        lastRestockedDate: null, // Not available in this query, needs separate logic or query
      };

      // Upsert Product
      const productRecord = await prisma.product.upsert({
        where: { shopifyId: productData.shopifyId },
        update: {
            ...productData,
            shopId,
            // Do NOT update salesVelocityFloat, stockoutDays, status, trending here
            // These are calculated metrics, not directly from Shopify product data
            salesVelocityFloat: undefined, // Prevent update
            stockoutDays: undefined,     // Prevent update
            status: undefined,           // Prevent update
            trending: undefined,         // Prevent update
        },
        create: { ...productData, shopId },
      });

      if (shopifyProduct.variants && shopifyProduct.variants.edges) {
        for (const variantEdge of shopifyProduct.variants.edges) { // variantEdge is implicitly any here
          const shopifyVariant = variantEdge.node as ShopifyVariant; // Assert type for shopifyVariant
          const variantData: TransformedVariant = {
            shopifyId: shopifyVariant.id,
            title: shopifyVariant.title || undefined, // Include variant title
            sku: shopifyVariant.sku || undefined,
            price: parseFloat(shopifyVariant.price) || 0,
            inventoryQuantity: shopifyVariant.inventoryQuantity || 0, // This is total quantity across locations
            inventoryItemId: shopifyVariant.inventoryItem?.id,
          };

          // Upsert Variant
          const variantRecord = await prisma.variant.upsert({
            where: { shopifyId: variantData.shopifyId },
            update: { ...variantData, productId: productRecord.id },
            create: { ...variantData, productId: productRecord.id },
          });

          // Sync inventory levels for this variant
          if (shopifyVariant.inventoryItem?.inventoryLevels?.edges) {
            for (const levelEdge of shopifyVariant.inventoryItem.inventoryLevels.edges) { // levelEdge is implicitly any
              const invLevel = levelEdge.node as ShopifyInventoryLevel & { location: { id: string }}; // Assert type for invLevel
              const warehouseId = locationsMap.get(invLevel.location.id);
              if (warehouseId) {
                // Upsert Inventory record for this Product + Warehouse combination
                await prisma.inventory.upsert({
                  where: { productId_warehouseId: { productId: productRecord.id, warehouseId } },
                  update: { quantity: invLevel.available || 0 },
                  create: {
                    productId: productRecord.id,
                    warehouseId: warehouseId,
                    quantity: invLevel.available || 0,
                  },
                });
              } else {
                console.warn(`Warehouse not found in map for Shopify Location GID: ${invLevel.location.id}. Skipping inventory sync for this location.`);
              }
            }
          }
        }
      }
    }
    hasNextPage = resultBody.data.products.pageInfo.hasNextPage;
    cursor = resultBody.data.products.pageInfo.endCursor;
    if (hasNextPage) {
      console.log(`Fetching next page of products for ${shopDomain}...`);
    }
  }
  console.log(`Product and inventory data sync completed for shop: ${shopDomain}`);

  // Now, update calculated metrics for all products in this shop
  try {
    console.log(`Starting update of calculated product metrics for shop ID: ${shopId}...`);
    const metricsUpdateResult = await updateAllProductMetricsForShop(shopId);
    console.log(metricsUpdateResult.message);
  } catch (error) {
    console.error(`Failed to update calculated product metrics for shop ID ${shopId}:`, error);
  }

  console.log(`Full sync process finished for shop: ${shopDomain}`);
}

// Example of how you might call this (e.g., from a Remix action or a cron job)
// This is illustrative; actual invocation will depend on where it's used.
/*
export async function triggerSync(shopDomain: string) {
  try {
    await syncProductsAndInventory(shopDomain);
    return { success: true, message: 'Sync completed.' };
  } catch (error: any) {
    console.error('Sync failed:', error);
    return { success: false, message: 'Sync failed: ' + error.message };
  }
}
*/
