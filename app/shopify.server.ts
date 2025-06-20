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
  const { admin } = await authenticate.admin(request); // Uses the exported `authenticate`
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
      // Assuming these fields are part of your AppProductType definition
      // Provide default or placeholder values as appropriate
      salesVelocity: 0,
      stockoutDays: 0,
      status: 'Healthy', // Or derive based on inventory or other logic
      trending: false,
    };
  }
  return null;
}