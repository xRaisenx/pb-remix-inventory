import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/uninstalled",
    },
    SCOPES_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/scopes_update",
    }
    // Add other webhooks here as needed
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });
      // Upsert shop record
      await prisma.shop.upsert({
        where: { shop: session.shop },
        update: { accessToken: session.accessToken },
        create: { shop: session.shop, accessToken: session.accessToken },
      });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  isEmbeddedApp: true,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

// Example of a function that uses the admin API
// Replace this with your actual data fetching logic
export async function getProductCount(admin: any) {
  const response = await admin.graphql(
    `#graphql
    query {
      products(first: 10) {
        count
      }
    }`
  );
  const responseJson = await response.json();
  return responseJson.data?.products?.count || 0;
}

// Note: The custom getProductById function mentioned in the problem description
// "has been improved to use a centralized service for metric calculations."
// This implies it might be in a different file (e.g., product.service.ts)
// or its logic is now part of a broader service.
// For now, I'm keeping this file focused on the shopifyApp setup.
// If a specific `getProductById` is needed here, please provide its new signature/logic.