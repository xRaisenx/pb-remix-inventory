import shopify from '~/shopify.server';
import prisma from '~/db.server';
import type { Product as ShopifyProduct, ProductVariant as ShopifyVariant, InventoryLevel as ShopifyInventoryLevel, Location as ShopifyLocation } from '@shopify/graphql-admin-api/2024-04'; // Updated API version
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
}

interface TransformedVariant {
  shopifyId: string;
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
// Using 'any' for admin client type for now, can be refined with specific Shopify client types if available globally
async function getOrSyncLocations(admin: any, shopId: string): Promise<Map<string, string>> {
  const locationsMap = new Map<string, string>(); // ShopifyLocationGid -> Prisma Warehouse ID
  let hasNextPage = true;
  let cursor: string | null = null;
  const locations: ShopifyLocationNode[] = [];

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query GetLocations($cursor: String) {
        locations(first: 10, after: $cursor) {
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
    const warehouse = await prisma.warehouse.upsert({
      where: { shopifyLocationGid: loc.id },
      update: { name: loc.name },
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

export async function syncProductsAndInventory(shopDomain: string) {
  const { admin, session } = await shopify.authenticate.admin(shopDomain);
  if (!admin || !session) {
    throw new Error('Failed to authenticate with Shopify');
  }
  const shopId = await getShopId(shopDomain); // New call
  const locationsMap = await getOrSyncLocations(admin, shopId);

  let hasNextPage = true;
  let cursor = null;

  console.log(`Starting product sync for shop: ${shopDomain} (ID: ${shopId})`);

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query GetProducts($cursor: String) {
        products(first: 10, after: $cursor) {
          edges {
            node {
              id
              title
              vendor
              productType
              variants(first: 20) {
                edges {
                  node {
                    id
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
        // Initialize new fields with defaults or null
        salesVelocityFloat: null,
        stockoutDays: null,
        status: 'Healthy', // Default status
        trending: false,   // Default trending
      };

      const productRecord = await prisma.product.upsert({
        where: { shopifyId: productData.shopifyId },
        update: { ...productData, shopId },
        create: { ...productData, shopId },
      });

      if (shopifyProduct.variants && shopifyProduct.variants.edges) {
        for (const variantEdge of shopifyProduct.variants.edges) { // variantEdge is implicitly any here
          const shopifyVariant = variantEdge.node as ShopifyVariant; // Assert type for shopifyVariant
          const variantData: TransformedVariant = {
            shopifyId: shopifyVariant.id,
            sku: shopifyVariant.sku || undefined,
            price: parseFloat(shopifyVariant.price) || 0,
            inventoryQuantity: shopifyVariant.inventoryQuantity || 0,
            inventoryItemId: shopifyVariant.inventoryItem?.id,
          };

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
                console.warn(`Warehouse not found in map for Shopify Location GID: ${invLevel.location.id}`);
              }
            }
          }
        }
      }
    }
    hasNextPage = result.data.products.pageInfo.hasNextPage;
    cursor = result.data.products.pageInfo.endCursor;
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
