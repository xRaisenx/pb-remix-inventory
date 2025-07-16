import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("[LOADER] /app starting authentication...");
    console.log("[LOADER] /app request URL:", request.url);
    
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    
    console.log("[LOADER] /app shop param:", shop);
    console.log("[LOADER] /app host param:", host);
    
    if (!shop) {
      console.error("[LOADER ERROR] No shop parameter found");
      throw new Response("Missing shop parameter", { status: 400 });
    }

    // Validate shop domain format
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      console.error("[LOADER ERROR] Invalid shop domain format:", shop);
      throw new Response("Invalid shop domain", { status: 400 });
    }
    
    let { session } = await authenticate.admin(request);
    
    // Ensure we have a proper host parameter for App Bridge
    let validHost = host;
    if (!validHost && session?.shop) {
      // Generate a proper host parameter from the shop domain
      const shopDomain = session.shop.replace('.myshopify.com', '');
      validHost = btoa(`admin.shopify.com/store/${shopDomain}`);
      console.log("[LOADER] Generated host parameter:", validHost);
    }
    
    if (!validHost) {
      console.error("[LOADER ERROR] Unable to determine valid host parameter");
      throw new Response("Missing host parameter for embedded app", { status: 400 });
    }

    return json({
      shop: session.shop,
      host: validHost,
      sessionId: session.id,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw Response objects (redirects, etc.)
    }
    
    console.error("[LOADER ERROR] /app loader failed:", error);
    throw error;
  }
};

export default function App() {
  const { apiKey, host, shop } = useLoaderData<typeof loader>();

  // Configuration validation
  if (!apiKey || !host) {
    return (
      <PolarisAppProvider i18n={enTranslations}>
        <div style={{ padding: '2rem', color: 'red', textAlign: 'center' }}>
          <h2>Configuration Error</h2>
          <p>Missing Shopify API Key or Host. Please check your environment variables and app setup.</p>
          <p>API Key: {apiKey ? 'Present' : 'Missing'}</p>
          <p>Host: {host ? 'Present' : 'Missing'}</p>
        </div>
      </PolarisAppProvider>
    );
  }

  return (
    <AppProvider
      apiKey={apiKey}
      isEmbeddedApp
    >
      <PolarisAppProvider i18n={enTranslations}>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Error boundary for embedded app
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[APP] Error boundary triggered:", error);
  return boundary.error(error);
}

// Headers boundary for embedded app iframe compatibility
export const headers = (headersArgs: any) => {
  return boundary.headers(headersArgs);
};