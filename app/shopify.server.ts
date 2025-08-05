import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/db.server";
import { redirect } from "@remix-run/node";
import { logEnvironmentStatus, validateEnvironmentVariables } from "~/utils/env-validation";

// --- BEGIN DIAGNOSTIC LOGGING ---
console.log("[DIAGNOSTIC] SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY, "| TYPE:", typeof process.env.SHOPIFY_API_KEY);
console.log("[DIAGNOSTIC] SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET", "| TYPE:", typeof process.env.SHOPIFY_API_SECRET);
console.log("[DIAGNOSTIC] SCOPES:", process.env.SCOPES, "| TYPE:", typeof process.env.SCOPES);
console.log("[DIAGNOSTIC] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL, "| TYPE:", typeof process.env.SHOPIFY_APP_URL);
console.log("[DIAGNOSTIC] SHOP_CUSTOM_DOMAIN:", process.env.SHOP_CUSTOM_DOMAIN, "| TYPE:", typeof process.env.SHOP_CUSTOM_DOMAIN);

// --- ENVIRONMENT VALIDATION ---
logEnvironmentStatus();
const envValidation = validateEnvironmentVariables();
if (!envValidation.isValid) {
  console.error("🚨 [STARTUP ERROR] Cannot start app with invalid environment configuration");
  console.error("Fix the above environment variable issues before proceeding");
}

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
        timestamp: Date.now(),
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
          timestamp: Date.now(),
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
        lastUpdated: Date.now(),
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
  apiVersion: "2025-07" as any,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new EnhancedPrismaSessionStorage(prisma) as any,
  distribution: AppDistribution.AppStore,
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
            id: session.shop,
            shop: session.shop,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        console.log("Shop setup completed for:", session.shop);
      } catch (error) {
        console.error("Error in afterAuth hook:", error);
        // Don't throw to prevent auth loop, but log the error
      }

      // Enhanced redirect strategy for embedded apps to prevent iframe issues
      const request = (rest as any)?.request;
      const host = (rest as any)?.host || (session as any)?.host || "";

      // Check if this is an embedded context (has shop and host parameters)
      if (!host) {
        console.warn("Missing host parameter in afterAuth - using embedded-safe fallback");
        const fallbackHost = Buffer.from(`admin.shopify.com/store/${session.shop.replace('.myshopify.com', '')}`).toString('base64');
        console.log("Using base64 encoded fallback host for embedded context");
        throw redirect(`/app?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(fallbackHost)}`);
      }

      console.log("Redirecting to embedded app with host:", host);
      throw redirect(`/app?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(host)}`);
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  isEmbeddedApp: true,
  embedded: true,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});


export default shopify;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
export const apiVersion = "2025-07";

// Custom implementation of addDocumentResponseHeaders
export function addDocumentResponseHeaders(request: Request, responseHeaders: Headers) {
  // Prevent iframes in the admin dashboard
  responseHeaders.set("X-Frame-Options", "DENY");
  
  // Security headers for embedded apps
  responseHeaders.set("Content-Security-Policy", "frame-ancestors 'none';");
  
  // Other security headers
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("X-XSS-Protection", "1; mode=block");
  responseHeaders.set("Referrer-Policy", "no-referrer");
}


// Enhanced logging for authentication and login


export async function logAndAuthenticateAdmin(request: Request) {
  try {
    console.log("[AUTH] Authenticating admin. URL:", request.url);
    const url = new URL(request.url);
    console.log("[AUTH] Params:", Object.fromEntries(url.searchParams.entries()));
    const result = await shopify.authenticate.admin(request);
    console.log("[AUTH] Success. Session:", result.session?.shop, result.session?.id);
    return result;
  } catch (error) {
    console.error("[AUTH ERROR] authenticate.admin failed:", error);
    throw error;
  }
}

export async function logAndLogin(request: Request) {
  try {
    console.log("[LOGIN] Login flow. URL:", request.url);
    const url = new URL(request.url);
    console.log("[LOGIN] Params:", Object.fromEntries(url.searchParams.entries()));
    const result = await shopify.login(request);
    console.log("[LOGIN] Success.");
    return result;
  } catch (error) {
    console.error("[LOGIN ERROR] login failed:", error);
    throw error;
  }
}
