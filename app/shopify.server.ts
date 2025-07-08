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

// Enhanced session storage with error handling and monitoring
class EnhancedPrismaSessionStorage extends PrismaSessionStorage {
  private prismaClient: any;
  private sessionMetrics: {
    storageAttempts: number;
    storageErrors: number;
    loadAttempts: number;
    loadErrors: number;
    deletionAttempts: number;
    deletionErrors: number;
  };

  constructor(prisma: any) {
    // Validate prisma client
    if (!prisma) {
      throw new Error("Prisma client is required for session storage");
    }

    // Validate that the required session table exists
    if (!prisma.session) {
      console.warn("Session model not found in Prisma client. Session storage may not work correctly.");
    }

    super(prisma);
    
    this.prismaClient = prisma;
    this.sessionMetrics = {
      storageAttempts: 0,
      storageErrors: 0,
      loadAttempts: 0,
      loadErrors: 0,
      deletionAttempts: 0,
      deletionErrors: 0,
    };

    console.log("[SessionStorage] Enhanced Prisma Session Storage initialized successfully");
  }

  // Get session storage metrics for monitoring
  getMetrics() {
    return {
      ...this.sessionMetrics,
      errorRates: {
        storage: this.sessionMetrics.storageAttempts > 0 ? 
          (this.sessionMetrics.storageErrors / this.sessionMetrics.storageAttempts) * 100 : 0,
        load: this.sessionMetrics.loadAttempts > 0 ? 
          (this.sessionMetrics.loadErrors / this.sessionMetrics.loadAttempts) * 100 : 0,
        deletion: this.sessionMetrics.deletionAttempts > 0 ? 
          (this.sessionMetrics.deletionErrors / this.sessionMetrics.deletionAttempts) * 100 : 0,
      }
    };
  }

  async storeSession(session: any): Promise<boolean> {
    this.sessionMetrics.storageAttempts++;
    
    try {
      if (!session || !session.id) {
        throw new Error("Invalid session: missing session ID");
      }

      console.log(`[SessionStorage] Storing session for shop: ${session.shop}`);
      const result = await super.storeSession(session);
      
      if (result) {
        console.log(`[SessionStorage] Successfully stored session ${session.id}`);
      }
      
      return result;
    } catch (error) {
      this.sessionMetrics.storageErrors++;
      console.error("[SessionStorage] Session storage error:", {
        sessionId: session?.id,
        shop: session?.shop,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Check if it's a database connectivity issue
      if (error instanceof Error && (
        error.message.includes('connection') || 
        error.message.includes('timeout') ||
        error.message.includes('ECONNREFUSED')
      )) {
        throw new Error("Database connection failed. Please check your database configuration.");
      }
      
      throw new Error("Failed to store session. Please ensure database is properly configured.");
    }
  }

  async loadSession(id: string): Promise<any> {
    this.sessionMetrics.loadAttempts++;
    
    try {
      if (!id || typeof id !== 'string') {
        throw new Error("Invalid session ID provided");
      }

      console.log(`[SessionStorage] Loading session: ${id}`);
      const session = await super.loadSession(id);
      
      if (session) {
        console.log(`[SessionStorage] Successfully loaded session for shop: ${session.shop}`);
      } else {
        console.log(`[SessionStorage] No session found for ID: ${id}`);
      }
      
      return session;
    } catch (error) {
      this.sessionMetrics.loadErrors++;
      console.error("[SessionStorage] Session loading error:", {
        sessionId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return undefined instead of throwing to allow for retry and new auth flow
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    this.sessionMetrics.deletionAttempts++;
    
    try {
      if (!id || typeof id !== 'string') {
        throw new Error("Invalid session ID provided for deletion");
      }

      console.log(`[SessionStorage] Deleting session: ${id}`);
      const result = await super.deleteSession(id);
      
      if (result) {
        console.log(`[SessionStorage] Successfully deleted session: ${id}`);
      }
      
      return result;
    } catch (error) {
      this.sessionMetrics.deletionErrors++;
      console.error("[SessionStorage] Session deletion error:", {
        sessionId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return false instead of throwing to gracefully handle deletion failures
      return false;
    }
  }

  // Method to check database connectivity
  async healthCheck(): Promise<boolean> {
    try {
      await this.prismaClient.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error("[SessionStorage] Database health check failed:", error);
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
