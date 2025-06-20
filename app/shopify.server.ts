// Base imports from the NEW file
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server"; // Assumes prisma client is initialized in db.server.ts

// Custom type import from your CUSTOM file (for getProductById)
import type { Product as AppProductType } from './types';

// Shopify App Configuration
// This merges settings from both files, prioritizing the NEW file's structure and newer practices.
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25, // Using the version from the NEW file
  scopes: process.env.SCOPES?.split(","), // Using the simpler scope definition from the NEW file
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth", // Standard path prefix
  sessionStorage: new PrismaSessionStorage(prisma), // Using PrismaSessionStorage with prisma instance from db.server.ts
  distribution: AppDistribution.AppStore, // From the NEW file
  future: {
    unstable_newEmbeddedAuthStrategy: true, // Enables embedded app auth strategy
    removeRest: true, // From the NEW file; prioritizes GraphQL over REST API for library helpers
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  // Note: `isEmbeddedApp: true` from your CUSTOM file is deprecated and handled by `unstable_newEmbeddedAuthStrategy`.
  // The `hooks.afterAuth` for webhook registration from your CUSTOM file is removed.
  // Webhooks are typically defined in `shopify.app.toml` or registered using the exported `registerWebhooks` function.
});

export default shopify;

// Exporting ApiVersion used in the configuration
export const apiVersion = ApiVersion.January25;

// Standard exports from the shopifyApp instance (from NEW file)
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate; // Used by your custom getProductById
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks; // For programmatic webhook registration if needed
export const sessionStorage = shopify.sessionStorage; // Exporting the configured session storage

// Your custom function `getProductById` from the CUSTOM file
export async function getProductById(request: Request, productId: string): Promise<AppProductType | null> {
  const { admin, session } = await authenticate.admin(request); // Uses the exported `authenticate`

  // Fetch shop settings
  const shopData = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { notificationSettings: true },
  });

  // Sensible defaults for thresholds, similar to product.service.ts
  const lowStockThresholdUnits = shopData?.notificationSettings?.lowStockThreshold ?? shopData?.lowStockThreshold ?? 10;
  const criticalStockThresholdUnits = shopData?.notificationSettings?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
  const criticalStockoutDays = shopData?.notificationSettings?.criticalStockoutDays ?? 3;
  const salesVelocityThresholdForTrending = shopData?.notificationSettings?.salesVelocityThreshold ?? 50;

  const response = await admin.graphql(
    `#graphql
    query GetProductById($id: ID!) {
      product(id: $id) {
        id
        title
        vendor
        productType
        variants(first: 10) {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              inventoryItem {
                id
                inventoryLevels(first: 1) {
                  edges {
                    node {
                      location {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: productId } }
  );

  const responseJson = await response.json();
  if (responseJson.data && responseJson.data.product) {
    const shopifyProduct = responseJson.data.product;

    // Fetch local product data to get salesVelocityFloat
    // The productId passed to this function is the Shopify GID e.g. "gid://shopify/Product/12345"
    const localProduct = await prisma.product.findUnique({
      where: { shopifyId: shopifyProduct.id }, // Assuming 'shopifyId' field stores the GID
    });

    const salesVelocityFloat = localProduct?.salesVelocityFloat ?? 0;

    // Calculate currentTotalInventory
    const currentTotalInventory = shopifyProduct.variants.edges.reduce(
      (sum: number, edge: any) => sum + (edge.node.inventoryQuantity || 0),
      0
    );

    // Calculate stockoutDays
    let stockoutDays: number | null = null;
    if (salesVelocityFloat > 0) {
      stockoutDays = currentTotalInventory / salesVelocityFloat;
    } else if (salesVelocityFloat === 0 && currentTotalInventory > 0) {
      stockoutDays = Infinity; // Has stock, but no sales
    } else {
      stockoutDays = 0; // No stock, or no sales velocity data
    }

    // Determine status
    let status: AppProductType['status'] = 'Unknown';
    if (stockoutDays !== null && stockoutDays !== Infinity) {
      if (currentTotalInventory <= criticalStockThresholdUnits || (stockoutDays <= criticalStockoutDays && salesVelocityFloat > 0)) {
        status = 'Critical';
      } else if (currentTotalInventory <= lowStockThresholdUnits || (stockoutDays <= (lowStockThresholdUnits / (salesVelocityFloat || 1)) && salesVelocityFloat > 0)) {
        status = 'Low';
      } else {
        status = 'Healthy';
      }
    } else if (stockoutDays === Infinity) {
      if (currentTotalInventory <= criticalStockThresholdUnits) {
        status = 'Critical';
      } else if (currentTotalInventory <= lowStockThresholdUnits) {
        status = 'Low';
      } else {
        status = 'Healthy';
      }
    } else {
      if (currentTotalInventory === 0) {
        status = 'Critical';
      } else {
        if (currentTotalInventory <= criticalStockThresholdUnits) {
          status = 'Critical';
        } else if (currentTotalInventory <= lowStockThresholdUnits) {
          status = 'Low';
        } else if (currentTotalInventory > lowStockThresholdUnits) {
          status = 'Healthy';
        }
      }
    }
    // Final override: if inventory is 0, it's critical
    if (currentTotalInventory === 0) {
        status = 'Critical';
    }


    // Determine trending
    const trending = salesVelocityFloat > salesVelocityThresholdForTrending;

    // Map the Shopify product data to your AppProductType
    return {
      id: shopifyProduct.id,
      title: shopifyProduct.title,
      vendor: shopifyProduct.vendor || 'Unknown Vendor',
      variants: shopifyProduct.variants.edges.map((edge: any) => ({
        id: edge.node.id,
        sku: edge.node.sku || 'N/A',
        price: edge.node.price ? parseFloat(edge.node.price).toFixed(2) : "0.00",
        inventoryQuantity: edge.node.inventoryQuantity || 0,
        inventoryItem: {
          id: edge.node.inventoryItem?.id || '',
          locationId: edge.node.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.location?.id || undefined,
        },
      })),
      salesVelocity: salesVelocityFloat, // Use calculated value
      stockoutDays: stockoutDays === Infinity ? null : (stockoutDays !== null ? parseFloat(stockoutDays.toFixed(2)) : null), // Use calculated value
      status: status, // Use calculated value
      trending: trending, // Use calculated value
    };
  }
  return null;
}