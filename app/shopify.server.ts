import "@shopify/shopify-app-remix/adapters/node";
// --- END DIAGNOSTIC LOGGING ---

import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/db.server";

// --- BEGIN DIAGNOSTIC LOGGING ---
console.log("[DIAGNOSTIC] SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY, "| TYPE:", typeof process.env.SHOPIFY_API_KEY);
console.log("[DIAGNOSTIC] SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET", "| TYPE:", typeof process.env.SHOPIFY_API_SECRET);
console.log("[DIAGNOSTIC] SCOPES:", process.env.SCOPES, "| TYPE:", typeof process.env.SCOPES);
console.log("[DIAGNOSTIC] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL, "| TYPE:", typeof process.env.SHOPIFY_APP_URL);
console.log("[DIAGNOSTIC] SHOP_CUSTOM_DOMAIN:", process.env.SHOP_CUSTOM_DOMAIN, "| TYPE:", typeof process.env.SHOP_CUSTOM_DOMAIN);

// Enhanced session storage with error handling
class EnhancedPrismaSessionStorage extends PrismaSessionStorage {
  private errorCount = 0;
  
  constructor(prismaClient: typeof prisma) {
    super(prismaClient);
    console.log('Enhanced Prisma session storage initialized');
  }

  async storeSession(session: any): Promise<boolean> {
    try {
      return await super.storeSession(session);
    } catch (error) {
      console.error("Session storage error:", error);
      throw new Error("Failed to store session. Please ensure database is properly configured.");
    }
  }

  async loadSession(id: string): Promise<any> {
    try {
      return await super.loadSession(id);
    } catch (error) {
      console.error("Session loading error:", error);
      return undefined; // Return undefined instead of throwing to allow for retry
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      return await super.deleteSession(id);
    } catch (error) {
      console.error("Session deletion error:", error);
      return false;
    }
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2024-07",
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new EnhancedPrismaSessionStorage(prisma),
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
    PRODUCTS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/products/create",
    },
    PRODUCTS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/products/update", 
    },
    PRODUCTS_DELETE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/products/delete",
    },
    INVENTORY_LEVELS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/inventory/update",
    },
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders/create",
    },
    ORDERS_PAID: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders/paid",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      try {
        console.log("Registering webhooks for shop:", session.shop);
        await shopify.registerWebhooks({ session });
        
        console.log("Upserting shop record for:", session.shop);
        await prisma.shop.upsert({
          where: { shop: session.shop },
          update: { updatedAt: new Date() },
          create: { 
            shop: session.shop,
            createdAt: new Date(),
            updatedAt: new Date()
          },
        });
        
        console.log("Shop setup completed for:", session.shop);
      } catch (error) {
        console.error("Error in afterAuth hook:", error);
        // Don't throw to prevent auth loop, but log the error
      }
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
export const apiVersion = "2024-07";
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
