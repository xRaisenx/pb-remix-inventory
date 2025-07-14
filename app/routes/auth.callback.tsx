import { authenticate } from "~/shopify.server";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("[AUTH CALLBACK] Starting authentication...");
    console.log("[AUTH CALLBACK] Request URL:", request.url);
    
    const { session } = await authenticate.admin(request);
    console.log("[AUTH CALLBACK] Authentication successful for shop:", session.shop);
    
    // For embedded apps, redirect to the app with proper parameters
    const url = new URL(request.url);
    const host = url.searchParams.get('host') || url.searchParams.get('state');
    
    if (host) {
      console.log("[AUTH CALLBACK] Redirecting to app with host:", host);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/app?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(host)}`
        }
      });
    }
    
    // Fallback redirect
    console.log("[AUTH CALLBACK] No host parameter, using fallback redirect");
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/app?shop=${encodeURIComponent(session.shop)}`
      }
    });
  } catch (error) {
    console.error("[AUTH CALLBACK] Authentication failed:", error);
    throw error;
  }
}; 