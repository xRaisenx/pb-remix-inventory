/**
 * SHOPIFY BOILERPLATE FILE - DO NOT MODIFY DIRECTLY
 * 
 * ⚠️  WARNING: This file contains the core app layout from the official boilerplate.
 * 
 * Future developers MUST NOT modify this file to avoid breaking functionality.
 * Instead, all custom layout logic should be placed in separate files.
 * 
 * For customizations:
 * - Create custom layouts in app/components/layouts/
 * - Create custom navigation in app/components/navigation/
 * - Import and use the base layout from this file
 * 
 * Last synced with: shopify-app-template-remix (latest)
 */

import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    polarisTranslations: require("@shopify/polaris/locales/en.json"),
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
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
        <Link to="/app/additional">
          Additional page
        </Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify embedded apps must maintain the same domain
export const headers: HeadersFunction = (headersArgs) => {
  return {
    "X-Shopify-API-Request-Failure-Reauthorize": "1",
    "X-Shopify-API-Request-Failure-Reauthorize-Url": "/auth",
  };
};

export const ErrorBoundary = boundary.error(({ error }) => {
  console.error(error);
  return (
    <div>
      <h1>Something went wrong</h1>
      <pre>{error.message}</pre>
    </div>
  );
});