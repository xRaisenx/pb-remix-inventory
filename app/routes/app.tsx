import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import { AppProvider as AppBridgeProvider } from "@shopify/app-bridge-react";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    host: session.host,
  });
};

export default function App() {
  const { apiKey, host } = useLoaderData<typeof loader>();

  if (!apiKey || !host) {
    return (
      <PolarisAppProvider i18n={enTranslations}>
        <Frame>
          <p>Error: Shopify App Bridge configuration is missing.</p>
        </Frame>
      </PolarisAppProvider>
    );
  }

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <AppBridgeProvider config={{ apiKey, host, forceRedirect: true }}>
        <Frame>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </Frame>
      </AppBridgeProvider>
    </PolarisAppProvider>
  );
}