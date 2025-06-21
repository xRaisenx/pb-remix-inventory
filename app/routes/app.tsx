import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  if (!host) {
    throw new Response("Missing host parameter for App Bridge", { status: 400 });
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    host: host,
  });
};

export default function App() {
  const { apiKey, host } = useLoaderData<typeof loader>();

  // If apiKey is not available, App Bridge will not work.
  // It's a critical configuration error.
  if (!apiKey) {
    // Render a simple error message or a more styled error page.
    // This helps in diagnosing setup issues.
    return (
        <PolarisAppProvider i18n={enTranslations}>
            <div style={{ padding: "20px", textAlign: "center", fontFamily: "sans-serif" }}>
                <h1>Configuration Error</h1>
                <p>Shopify API Key is missing. The application cannot start.</p>
                <p>Please ensure SHOPIFY_API_KEY is set in your environment variables.</p>
            </div>
        </PolarisAppProvider>
    );
  }

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <AppBridgeProvider config={{ apiKey: apiKey!, host: host, forceRedirect: true }}>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </AppBridgeProvider>
    </PolarisAppProvider>
  );
}