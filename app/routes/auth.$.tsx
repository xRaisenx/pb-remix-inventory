import type { LoaderFunctionArgs } from "@remix-run/node";
import { useRouteError } from "@remix-run/react";
import { logAndLogin } from "~/shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Let Shopify's helper return the redirect Response directly
  return await logAndLogin(request);
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