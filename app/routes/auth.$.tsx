import type { LoaderFunctionArgs } from "@remix-run/node";
import { useRouteError } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("[AUTH SPLAT] Starting authentication for new embedded auth strategy");
    console.log("[AUTH SPLAT] Request URL:", request.url);
    
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    
    console.log("[AUTH SPLAT] Shop param:", shop);
    console.log("[AUTH SPLAT] Host param:", host);
    
    // This will handle the OAuth flow for the new embedded auth strategy
    await authenticate.admin(request);
    
    console.log("[AUTH SPLAT] Authentication successful - this should not be reached");
    return null;
  } catch (error) {
    console.error("[AUTH SPLAT ERROR] Authentication failed:", error);
    // Re-throw the error/response as authenticate.admin handles redirects
    throw error;
  }
};

// Error boundary for embedded app authentication
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[AUTH SPLAT] Error boundary triggered:", error);
  return boundary.error(error);
}

// Headers boundary for embedded app iframe compatibility  
export const headers = (headersArgs: any) => {
  return boundary.headers(headersArgs);
};