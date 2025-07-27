import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate, login } from "~/shopify.server";
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
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
      console.error("[LOADER ERROR] Invalid shop domain format:", shop);
      throw new Response("Invalid shop domain", { status: 400 });
    }
    
    try {
      // Try to authenticate with enhanced error handling
      let { admin, session } = await authenticate.admin(request);
      
      // Ensure we have a proper host parameter for App Bridge
      let validHost = host;
      if (!validHost && session?.shop) {
        // Generate a proper host parameter from the shop domain
        const shopDomain = session.shop.replace('.myshopify.com', '');
        validHost = Buffer.from(`admin.shopify.com/store/${shopDomain}`).toString('base64');
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
    } catch (authError: any) {
      // Handle authentication errors properly
      console.error("[LOADER ERROR] Authentication failed:", authError);
      
      // If it's a redirect response (like 302), we should re-throw it
      if (authError instanceof Response) {
        // Check if it's a redirect to the Shopify app page
        if (authError.status === 302 && authError.headers.get('location')?.includes('admin.shopify.com')) {
          console.log("[LOADER] Authentication redirect to Shopify - app may need reinstallation");
          // This redirect typically means the app was uninstalled and needs to be reinstalled
          // We should redirect to the login page to restart the OAuth flow
          throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
        }
        
        console.log("[LOADER] Re-throwing redirect response");
        throw authError;
      }
      
      // For other authentication errors, redirect to login
      if (shop) {
        console.log("[LOADER] Redirecting to login due to authentication error");
        throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
      }
      
      // Fallback if we can't determine the shop
      throw authError;
    }
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
  if (!apiKey) {
    return (
      <PolarisAppProvider i18n={enTranslations}>
        <div style={{ padding: '2rem', color: 'red', textAlign: 'center' }}>
          <h2>Configuration Error</h2>
          <p>Missing Shopify API Key. Please check your environment variables and app setup.</p>
          <p>API Key: {apiKey ? 'Present' : 'Missing'}</p>
        </div>
      </PolarisAppProvider>
    );
  }

  return (
    <AppProvider
      apiKey={apiKey}
      isEmbeddedApp={true}
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
  console.error("[ROUTE ERROR] App route error boundary caught:", error);
  
  return (
    <PolarisAppProvider i18n={enTranslations}>
      <div style={{ padding: '2rem' }}>
        <h2>Application Error</h2>
        <p>There was an error loading the application. Please try refreshing the page.</p>
      </div>
    </PolarisAppProvider>
  );
}
