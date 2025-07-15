import type { LoaderFunctionArgs } from "@remix-run/node";
import { useRouteError } from "@remix-run/react";
import { authenticate, login } from "~/shopify.server";
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
    
    if (!shop) {
      console.error("[AUTH SPLAT ERROR] No shop parameter found");
      throw new Response("Missing shop parameter", { status: 400 });
    }
    
    // This will handle the OAuth flow for the new embedded auth strategy
    try {
      await authenticate.admin(request);
      console.log("[AUTH SPLAT] Authentication successful");
      
      // If we reach here, authentication was successful
      // Redirect back to the app with proper parameters
      const redirectParams = new URLSearchParams();
      redirectParams.set('shop', shop);
      if (host) redirectParams.set('host', host);
      
      const appUrl = `/app?${redirectParams.toString()}`;
      console.log("[AUTH SPLAT] Redirecting to app:", appUrl);
      return new Response(null, {
        status: 302,
        headers: { Location: appUrl }
      });
    } catch (authError) {
      console.error("[AUTH SPLAT ERROR] Authentication failed:", authError);
      
      // If authentication fails, initiate the OAuth flow
      if (authError instanceof Response && authError.status === 302) {
        console.log("[AUTH SPLAT] Received redirect - initiating OAuth flow");
        // Use the login function which handles embedded OAuth properly
        throw login(request, shop, host);
      }
      
      // For other errors, re-throw
      throw authError;
    }
  } catch (error) {
    console.error("[AUTH SPLAT ERROR] Unexpected error:", error);
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