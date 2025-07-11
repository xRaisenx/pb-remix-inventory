import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
// Provider as AppBridgeProvider from "@shopify/app-bridge-react" is no longer needed
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { redirect } from "@remix-run/node";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const session = await authenticate.admin(request);
    const url = new URL(request.url);
    const host = url.searchParams.get("host");
    const shop = url.searchParams.get("shop");
    
    console.log("[LOADER] /app session:", session);
    console.log("[LOADER] /app host param:", host);
    console.log("[LOADER] /app shop param:", shop);
    console.log("[LOADER] /app full URL:", request.url);
    
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
    
    return json({
      apiKey: process.env.SHOPIFY_API_KEY,
      host: host,
    });
  } catch (error) {
    console.error("[LOADER ERROR] /app loader failed:", error);
    throw error;
  }
};

export default function App() {
  const { apiKey, host } = useLoaderData<typeof loader>();

  // The AppBridgeProvider wrapper is removed.
  // The necessary App Bridge config (apiKey, host) is passed to PolarisAppProvider.
  // forceRedirect is generally a default behavior or handled internally by App Bridge
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
    <PolarisAppProvider
      i18n={enTranslations}
      apiKey={apiKey}
      host={host}
      forceRedirect
    >
      <AppLayout>
        <Outlet />
      </AppLayout>
    </PolarisAppProvider>
  );
}