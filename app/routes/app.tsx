import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-remix/server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "~/shopify.server";

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
    
    // For embedded apps, authenticate using the Shopify app remix method
    // This will handle embedded auth flow automatically
    await authenticate.admin(request);
    
    console.log("[LOADER] /app authentication successful");
    
    return json({
      polarisTranslations: require("@shopify/polaris/locales/en.json"),
      apiKey: process.env.SHOPIFY_API_KEY || "",
    });
    
  } catch (error) {
    console.error("[LOADER ERROR] /app._index loader failed:", error);
    
    // If it's a Response (redirect), let it pass through
    // This is normal for embedded auth flow
    if (error instanceof Response) {
      console.log("[LOADER] Received auth redirect response");
      throw error;
    }
    
    // For other errors, return a meaningful error response
    console.error("[LOADER ERROR] Unexpected error in app loader:", error);
    throw new Response("App initialization failed", { status: 500 });
  }
};

export default function App() {
  const { apiKey, polarisTranslations } = useLoaderData<typeof loader>();

  return (
    <AppProvider
      isEmbeddedApp
      apiKey={apiKey}
      i18n={polarisTranslations}
    >
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/products">
          Products
        </Link>
        <Link to="/app/inventory">
          Inventory
        </Link>
        <Link to="/app/settings">
          Settings
        </Link>
        <Link to="/app/reports">
          Reports
        </Link>
        <Link to="/app/alerts">
          Alerts
        </Link>
        <Link to="/app/warehouses">
          Warehouses
        </Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify embedded apps must maintain the same domain
export const headers = () => ({
  "X-Shopify-API-Request-Failure-Reauthorize": "1",
  "X-Shopify-API-Request-Failure-Reauthorize-Url": "/auth",
});

export const ErrorBoundary = boundary.error(({ error }) => {
  console.error("[APP ERROR BOUNDARY]", error);
  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>Something went wrong</h1>
      <p>Please try refreshing the page or contact support if the problem persists.</p>
      <pre style={{ 
        background: "#f5f5f5", 
        padding: "10px", 
        borderRadius: "4px",
        fontSize: "12px",
        textAlign: "left",
        overflow: "auto"
      }}>
        {error?.message || "Unknown error"}
      </pre>
    </div>
  );
});