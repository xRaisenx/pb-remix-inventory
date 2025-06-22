import "@shopify/shopify-app-remix/adapters/node";

// --- BEGIN DIAGNOSTIC LOGGING ---
console.log("[DIAGNOSTIC] SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY, "| TYPE:", typeof process.env.SHOPIFY_API_KEY);
console.log("[DIAGNOSTIC] SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET", "| TYPE:", typeof process.env.SHOPIFY_API_SECRET); // Avoid logging secret directly
console.log("[DIAGNOSTIC] SCOPES:", process.env.SCOPES, "| TYPE:", typeof process.env.SCOPES);
console.log("[DIAGNOSTIC] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL, "| TYPE:", typeof process.env.SHOPIFY_APP_URL);
console.log("[DIAGNOSTIC] SHOP_CUSTOM_DOMAIN:", process.env.SHOP_CUSTOM_DOMAIN, "| TYPE:", typeof process.env.SHOP_CUSTOM_DOMAIN);
// --- END DIAGNOSTIC LOGGING ---

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
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });
      // The accessToken is managed by the Session model.
      // This hook should only ensure the Shop record exists.
      await prisma.shop.upsert({
        where: { shop: session.shop },
        update: {}, // Nothing to update here
        create: { shop: session.shop },
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
