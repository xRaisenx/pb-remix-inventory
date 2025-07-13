import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
// Provider as AppBridgeProvider from "@shopify/app-bridge-react" is no longer needed
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("[LOADER] /app starting authentication...");
    console.log("[LOADER] /app request URL:", request.url);
    console.log("[LOADER] /app request headers:", Object.fromEntries(request.headers.entries()));
    
    // Check if we have a valid session before calling authenticate.admin
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    
    console.log("[LOADER] /app shop param:", shop);
    console.log("[LOADER] /app host param:", host);
    
    if (!shop) {
      console.error("[LOADER ERROR] No shop parameter found");
      throw new Response("Missing shop parameter", { status: 400 });
    }
    
    // Try to authenticate with detailed error handling
    let session;
    try {
      session = await authenticate.admin(request);
      console.log("[LOADER] /app authentication successful");
      console.log("[LOADER] /app session:", session);
    } catch (authError) {
      console.error("[LOADER ERROR] Authentication failed:", authError);
      
      // If authentication fails, redirect to login
      let loginUrl = `/auth/login?shop=${encodeURIComponent(shop)}`;
      if (host) {
        loginUrl += `&host=${encodeURIComponent(host)}`;
      }
      console.log("[LOADER] Redirecting to login:", loginUrl);
      throw redirect(loginUrl);
    }
    
    if (!host) {
      console.error("[LOADER ERROR] Missing host parameter for App Bridge");
      console.error("[LOADER ERROR] This will cause 'admin.shopify.com refused to connect' error");
      
      // Try to construct host from shop parameter or session
      const fallbackHost = shop ? 
        `${shop.replace('.myshopify.com', '')}.myshopify.com` : 
        `${(session as any).shop.replace('.myshopify.com', '')}.myshopify.com`;
      
      console.log("[LOADER] Using fallback host:", fallbackHost);
      
      // Redirect with the constructed host
      const redirectUrl = `/app?shop=${encodeURIComponent((session as any).shop)}&host=${encodeURIComponent(fallbackHost)}`;
      console.log("[LOADER] Redirecting to:", redirectUrl);
      throw redirect(redirectUrl);
    }
    
    console.log("[LOADER] /app returning data with host:", host);
    return json({
      apiKey: process.env.SHOPIFY_API_KEY,
      host: host,
    });
  } catch (error) {
    console.error("[LOADER ERROR] /app loader failed:", error);
    
    // If it's a redirect, let it pass through
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      throw error;
    }
    
    // For other errors, show a user-friendly message
    throw new Response("Failed to load app. Please try again.", { status: 500 });
  }
};

export default function App() {
  const { apiKey, host } = useLoaderData<typeof loader>();

  // The AppBridgeProvider wrapper is removed.
  // The necessary App Bridge config (apiKey, host) is passed to PolarisAppProvider.
  // isEmbeddedApp={true} is generally a default behavior or handled internally by App Bridge
  // when it receives the host and apiKey.
  if (!apiKey || !host) {
    return (
      <PolarisAppProvider i18n={enTranslations}>
        <div style={{ padding: '2rem', color: 'red', textAlign: 'center' }}>
          <h2>Configuration Error</h2>
          <p>Missing Shopify API Key or Host. Please check your environment variables and app setup.</p>
        </div>
      </PolarisAppProvider>
    );
  }

  // Wrap the app in Polaris AppProvider with apiKey and host for embedded context
  return (
    <PolarisAppProvider i18n={enTranslations}>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </PolarisAppProvider>
  );
}