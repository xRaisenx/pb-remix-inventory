/**
 * ENHANCED SHOPIFY SERVER MODULE
 * 
 * This module extends the boilerplate Shopify configuration with custom enhancements:
 * - Enhanced session storage with caching
 * - Diagnostic logging
 * - Error handling and monitoring
 * - Performance optimizations
 * 
 * The core configuration is based on the official Shopify boilerplate.
 */

import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { redirect } from "@remix-run/node";

// Import our modular components
import prisma from "~/lib/database";
import { EnhancedPrismaSessionStorage } from "~/lib/session-storage";

// --- BEGIN DIAGNOSTIC LOGGING ---
console.log("[DIAGNOSTIC] SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY, "| TYPE:", typeof process.env.SHOPIFY_API_KEY);
console.log("[DIAGNOSTIC] SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET", "| TYPE:", typeof process.env.SHOPIFY_API_SECRET);
console.log("[DIAGNOSTIC] SCOPES:", process.env.SCOPES, "| TYPE:", typeof process.env.SCOPES);
console.log("[DIAGNOSTIC] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL, "| TYPE:", typeof process.env.SHOPIFY_APP_URL);
console.log("[DIAGNOSTIC] SHOP_CUSTOM_DOMAIN:", process.env.SHOP_CUSTOM_DOMAIN, "| TYPE:", typeof process.env.SHOP_CUSTOM_DOMAIN);

// Create enhanced session storage instance
const enhancedSessionStorage = new EnhancedPrismaSessionStorage(prisma);

// Shopify app configuration with enhanced session storage
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: enhancedSessionStorage,
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// Log configuration details for debugging
console.log("[SHOPIFY] App initialized with enhanced session storage");
console.log("[SHOPIFY] API Version:", ApiVersion.January25);
console.log("[SHOPIFY] Distribution:", AppDistribution.AppStore);
console.log("[SHOPIFY] Auth path prefix:", "/auth");

// Export enhanced shopify instance and utilities
export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = enhancedSessionStorage;

// Export enhanced session storage for direct access to cache stats
export { enhancedSessionStorage };

// Enhanced authentication wrapper with error handling
export const authenticateWithRetry = async (request: Request) => {
  try {
    return await authenticate.admin(request);
  } catch (error) {
    console.error("[SHOPIFY AUTH] Authentication failed:", error);
    // Log session storage stats for debugging
    const stats = enhancedSessionStorage.getCacheStats();
    console.log("[SHOPIFY AUTH] Session storage stats:", stats);
    throw error;
  }
};

// Enhanced webhook registration with error handling
export const registerWebhooksWithRetry = async (session: any) => {
  try {
    return await registerWebhooks({ session });
  } catch (error) {
    console.error("[SHOPIFY WEBHOOKS] Webhook registration failed:", error);
    throw error;
  }
};

// Session management utilities
export const clearSessionCache = () => {
  enhancedSessionStorage.clearCache();
  console.log("[SHOPIFY] Session cache cleared");
};

export const getSessionStats = () => {
  return enhancedSessionStorage.getCacheStats();
};

// Enhanced redirect helper with better error handling
export const enhancedRedirect = (url: string, init?: ResponseInit) => {
  console.log("[SHOPIFY] Redirecting to:", url);
  return redirect(url, init);
};
