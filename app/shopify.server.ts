import "@shopify/shopify-app-remix/adapters/node";
// --- END DIAGNOSTIC LOGGING ---

import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/db.server";
import { redirect } from "@remix-run/node";

// --- BEGIN DIAGNOSTIC LOGGING ---
console.log("[DIAGNOSTIC] SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY, "| TYPE:", typeof process.env.SHOPIFY_API_KEY);
console.log("[DIAGNOSTIC] SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET", "| TYPE:", typeof process.env.SHOPIFY_API_SECRET);
console.log("[DIAGNOSTIC] SCOPES:", process.env.SCOPES, "| TYPE:", typeof process.env.SCOPES);
console.log("[DIAGNOSTIC] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL, "| TYPE:", typeof process.env.SHOPIFY_APP_URL);
console.log("[DIAGNOSTIC] SHOP_CUSTOM_DOMAIN:", process.env.SHOP_CUSTOM_DOMAIN, "| TYPE:", typeof process.env.SHOP_CUSTOM_DOMAIN);

// Enhanced session storage with error handling and performance optimization
class EnhancedPrismaSessionStorage extends PrismaSessionStorage<any> {
  private errorCount = 0;
  private cache = new Map<string, any>();
  
  constructor(prismaClient: typeof prisma) {
    super(prismaClient);
    console.log('Enhanced Prisma session storage initialized');
  }

  async storeSession(session: any): Promise<boolean> {
    try {
      console.log(`[SESSION] Storing session: ${session.id}`);
      console.log(`[SESSION] Session shop: ${session.shop}`);
      console.log(`[SESSION] Session state: ${session.state}`);
      
      // Cache the session for faster access
      this.cache.set(session.id, session);
      
      const result = await super.storeSession(session);
      console.log(`[SESSION] Session stored successfully: ${result}`);
      return result;
    } catch (error) {
      console.error(`[SESSION] Session storage error for ${session.id}:`, error);
      throw new Error("Failed to store session. Please ensure database is properly configured.");
    }
  }

  async loadSession(id: string): Promise<any> {
    try {
      console.log(`[SESSION] Attempting to load session: ${id}`);
      
      // Check cache first
      if (this.cache.has(id)) {
        console.log(`[SESSION] Cache hit for session ${id}`);
        return this.cache.get(id);
      }
      
      console.log(`[SESSION] Cache miss for session ${id}, querying database...`);
      
      // Load from database with timeout
      const session = await Promise.race([
        super.loadSession(id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session load timeout')), 10000)
        )
      ]);
      
      if (session) {
        this.cache.set(id, session);
        console.log(`[SESSION] Loaded session ${id} from database successfully`);
        console.log(`[SESSION] Session data:`, {
          id: (session as any).id,
          shop: (session as any).shop,
          state: (session as any).state,
          isOnline: (session as any).isOnline,
          expires: (session as any).expires
        });
      } else {
        console.log(`[SESSION] No session found in database for ${id}`);
      }
      
      return session;
    } catch (error) {
      console.error(`[SESSION] Error loading session ${id}:`, error);
      // Clear cache entry if it exists
      this.cache.delete(id);
      return undefined; // Return undefined instead of throwing to allow for retry
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      // Clear cache
      this.cache.delete(id);
      return await super.deleteSession(id);
    } catch (error) {
      console.error("Session deletion error:", error);
      return false;
    }
  }
  
  // Clear cache periodically to prevent memory leaks
  clearCache() {
    this.cache.clear();
    console.log("[SESSION] Cache cleared");
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2024-07" as any,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new EnhancedPrismaSessionStorage(prisma) as any,
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
    afterAuth: async ({ session, ...rest }) => {
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
      
      // Get host from the request context for embedded app redirect
      // The host parameter is crucial for App Bridge to work properly
      const host = (rest as any)?.host || (session as any)?.host || "";
      
      if (!host) {
        console.error("Missing host parameter in afterAuth - this will cause embedded app issues");
        // Fallback: try to construct host from shop domain
        const fallbackHost = `${session.shop.replace('.myshopify.com', '')}.myshopify.com`;
        console.log("Using fallback host:", fallbackHost);
        throw redirect(`/app?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(fallbackHost)}`);
      }
      
      console.log("Redirecting to embedded app with host:", host);
      // IMPORTANT: Use relative URL to stay within the embedded context
      throw redirect(`/app?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(host)}`);
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
