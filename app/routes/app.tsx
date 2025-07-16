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
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    if (!shop) {
      throw new Response("Missing shop parameter", { status: 400 });
    }
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
      throw new Response("Invalid shop domain", { status: 400 });
    }
    let {admin, session} = await authenticate.admin(request);
    return json({
      shop: session.shop,
      sessionId: session.id,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    throw error;
  }
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
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
    <AppProvider apiKey={apiKey}>
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