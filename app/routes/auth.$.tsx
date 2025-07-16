import type { LoaderFunctionArgs } from "@remix-run/node";
import { useRouteError } from "@remix-run/react";
import { login } from "~/shopify.server";
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
    
    await login(request);
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