import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("[LOGIN] Starting OAuth login flow");
    
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    
    console.log("[LOGIN] Shop param:", shop);
    console.log("[LOGIN] Host param:", host);
    
    if (!shop) {
      console.error("[LOGIN ERROR] No shop parameter found");
      throw new Response("Missing shop parameter", { status: 400 });
    }
    
    // Validate shop domain format
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
      console.error("[LOGIN ERROR] Invalid shop domain format:", shop);
      throw new Response("Invalid shop domain", { status: 400 });
    }
    
    console.log("[LOGIN] Initiating OAuth flow for shop:", shop);
    
    // This will redirect to Shopify's OAuth authorization page
    // The login function handles the embedded OAuth flow properly
    return await login(request, shop, host);
  } catch (error) {
    console.error("[LOGIN ERROR] Login failed:", error);
    throw error;
  }
};