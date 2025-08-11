import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }
  // Always send to the canonical login route to avoid self-redirect loops
  return redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
};

// Error boundary for embedded app authentication
export function ErrorBoundary() {
  return boundary.error(new Error("Auth error"));
}

// Headers boundary for embedded app iframe compatibility
export const headers = (headersArgs: any) => boundary.headers(headersArgs);