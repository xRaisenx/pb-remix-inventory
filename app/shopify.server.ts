import "@shopify/shopify-app-remix/adapters/vercel";

import {
  AppDistribution,
  DeliveryMethod,
  LATEST_API_VERSION,
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
  private readonly CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache TTL (reduced from 5)
  private readonly MAX_RETRIES = 2; // Reduced from 3
  
  constructor(prismaClient: typeof prisma) {
    super(prismaClient);
    console.log('Enhanced Prisma session storage initialized');
    
    // Start cache cleanup interval - less frequent
    setInterval(() => this.cleanupCache(), 15 * 60 * 1000); // Cleanup every 15 minutes
  }

  async storeSession(session: any): Promise<boolean> {
    try {
      console.log(`[SESSION] Storing session: ${session.id}`);
      
      // Cache the session for faster access
      this.cache.set(session.id, {
        session,
        timestamp: Date.now()
      });
      
      const result = await super.storeSession(session);
      console.log(`[SESSION] Session stored successfully: ${result}`);
      
      // Update session count cache
      this.sessionCountCache = { count: -1, lastUpdated: 0 }; // Invalidate cache
      this.errorCount = 0; // Reset error count on success
      
      return result;
    } catch (error) {
      this.errorCount++;
      console.error(`[SESSION ERROR] Failed to store session (attempt ${this.errorCount}):`, error);
      
      // If database fails, at least keep it in cache temporarily
      this.cache.set(session.id, {
        session,
        timestamp: Date.now()
      });
      
      // Don't throw on session storage errors to prevent auth loops
      return false;
    }
  }

  async loadSession(id: string): Promise<any> {
    try {
      // Check cache first
      const cached = this.cache.get(id);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        console.log(`[SESSION] Loading session from cache: ${id}`);
        return cached.session;
      }

      console.log(`[SESSION] Loading session from database: ${id}`);
      const session = await super.loadSession(id);
      
      if (session) {
        // Update cache
        this.cache.set(id, {
          session,
          timestamp: Date.now()
        });
      }
      
      console.log(`[SESSION] Session loaded: ${session ? 'found' : 'not found'}`);
      return session;
    } catch (error) {
      console.error(`[SESSION ERROR] Failed to load session ${id}:`, error);
      
      // Try to return from cache as fallback
      const cached = this.cache.get(id);
      if (cached) {
        console.log(`[SESSION] Returning cached session as fallback: ${id}`);
        return cached.session;
      }
      
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      console.log(`[SESSION] Deleting session: ${id}`);
      
      // Remove from cache first
      this.cache.delete(id);
      
      const result = await super.deleteSession(id);
      console.log(`[SESSION] Session deleted: ${result}`);
      
      // Update session count cache
      this.sessionCountCache = { count: -1, lastUpdated: 0 }; // Invalidate cache
      
      return result;
    } catch (error) {
      console.error(`[SESSION ERROR] Failed to delete session ${id}:`, error);
      
      // Remove from cache even if database fails
      this.cache.delete(id);
      
      // Don't throw on session deletion errors
      return false;
    }
  }

  async getSessionCount(): Promise<number> {
    const now = Date.now();
    
    // Return cached count if still valid
    if (this.sessionCountCache.count >= 0 && 
        (now - this.sessionCountCache.lastUpdated) < this.CACHE_TTL) {
      return this.sessionCountCache.count;
    }

    // Try to get count with retries and timeout
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`[DB INFO] Attempting to count sessions (attempt ${attempt}/${this.MAX_RETRIES})`);
        
        // Use a timeout for the query
        const countPromise = prisma.session.count();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 8000) // 8 second timeout
        );
        
        const count = await Promise.race([countPromise, timeoutPromise]) as number;
        
        // Update cache
        this.sessionCountCache = { count, lastUpdated: now };
        console.log(`[DB INFO] Session count: ${count}`);
        return count;
      } catch (error) {
        console.log(`[DB ERROR] Query Session.count failed (attempt ${attempt}/${this.MAX_RETRIES}):`, error);
        
        if (attempt < this.MAX_RETRIES) {
          console.log(`[DB RETRY] Retrying query in ${attempt * 500}ms...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
      }
    }

    // Fallback: return cache count or estimate from cache size
    const fallbackCount = this.sessionCountCache.count >= 0 ? 
      this.sessionCountCache.count : this.cache.size;
    
    console.log(`[DB FALLBACK] Using fallback session count: ${fallbackCount}`);
    return fallbackCount;
  }

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
      console.log(`[CACHE] Cleaned up ${cleaned} expired entries`);
    }
  }

  clearCache() {
    this.cache.clear();
    this.sessionCountCache = { count: -1, lastUpdated: 0 };
    console.log('[CACHE] Cache cleared');
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
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
      
      // No redirect needed with new embedded auth strategy
      console.log("Auth completed successfully for shop:", session.shop);
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
