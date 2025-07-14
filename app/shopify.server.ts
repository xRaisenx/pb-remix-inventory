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
  private sessionCountCache = { count: 0, lastUpdated: 0 };
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
  
  constructor(prismaClient: typeof prisma) {
    super(prismaClient);
    console.log('Enhanced Prisma session storage initialized');
    
    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // Cleanup every 10 minutes
  }

  async storeSession(session: any): Promise<boolean> {
    try {
      console.log(`[SESSION] Storing session: ${session.id}`);
      console.log(`[SESSION] Session shop: ${session.shop}`);
      console.log(`[SESSION] Session state: ${session.state}`);
      
      // Cache the session for faster access
      this.cache.set(session.id, {
        session,
        timestamp: Date.now()
      });
      
      const result = await super.storeSession(session);
      console.log(`[SESSION] Session stored successfully: ${result}`);
      
      // Update session count cache
      if (result) {
        this.sessionCountCache.count++;
        this.sessionCountCache.lastUpdated = Date.now();
      }
      
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
      const cached = this.cache.get(id);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        console.log(`[SESSION] Session loaded from cache: ${id}`);
        return cached.session;
      }
      
      const startTime = Date.now();
      const session = await super.loadSession(id);
      const loadTime = Date.now() - startTime;
      
      if (loadTime > 1000) {
        console.log(`[SESSION PERF] Slow session load: ${id} took ${loadTime}ms`);
      }
      
      if (session) {
        // Update cache
        this.cache.set(id, {
          session,
          timestamp: Date.now()
        });
        console.log(`[SESSION] Session loaded from database: ${id}`);
      } else {
        console.log(`[SESSION] Session not found: ${id}`);
      }
      
      return session;
    } catch (error) {
      console.error(`[SESSION] Session load error for ${id}:`, error);
      this.errorCount++;
      
      if (this.errorCount > 10) {
        console.error("[SESSION] Too many session errors - clearing cache");
        this.clearCache();
        this.errorCount = 0;
      }
      
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      console.log(`[SESSION] Deleting session: ${id}`);
      
      // Remove from cache
      this.cache.delete(id);
      
      const result = await super.deleteSession(id);
      console.log(`[SESSION] Session deleted: ${result}`);
      
      // Update session count cache
      if (result) {
        this.sessionCountCache.count = Math.max(0, this.sessionCountCache.count - 1);
        this.sessionCountCache.lastUpdated = Date.now();
      }
      
      return result;
    } catch (error) {
      console.error(`[SESSION] Session deletion error for ${id}:`, error);
      throw error;
    }
  }
  
  // Optimize session count queries with caching
  async getSessionCount(): Promise<number> {
    try {
      // Return cached count if recent
      if (this.sessionCountCache.lastUpdated && 
          (Date.now() - this.sessionCountCache.lastUpdated) < this.CACHE_TTL) {
        return this.sessionCountCache.count;
      }
      
      // Use efficient count query with timeout
      const startTime = Date.now();
      const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Session"` as any[];
      const queryTime = Date.now() - startTime;
      
      if (queryTime > 5000) {
        console.log(`[SESSION PERF] Slow session count query: ${queryTime}ms`);
      }
      
      const sessionCount = parseInt(count[0]?.count || '0');
      
      // Update cache
      this.sessionCountCache = {
        count: sessionCount,
        lastUpdated: Date.now()
      };
      
      return sessionCount;
    } catch (error) {
      console.error('[SESSION] Session count error:', error);
      // Return cached value if available, otherwise 0
      return this.sessionCountCache.count || 0;
    }
  }
  
  // Clean up old cache entries
  private cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[SESSION] Cache cleanup: removed ${cleaned} expired entries`);
    }
  }
  
  // Clear cache periodically to prevent memory leaks
  clearCache() {
    this.cache.clear();
    this.sessionCountCache = { count: 0, lastUpdated: 0 };
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
