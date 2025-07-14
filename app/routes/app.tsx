import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[LOADER] /app starting authentication...");
  console.log("[LOADER] /app request URL:", request.url);
  
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  
  console.log("[LOADER] /app shop param:", shop);
  console.log("[LOADER] /app host param:", host);
  
  try {
    const { session } = await authenticate.admin(request);
    console.log("[LOADER] /app authentication successful");
    console.log("[LOADER] /app session shop:", session.shop);
    
    return json({
      shop: session.shop,
      host: host || "",
      apiKey: process.env.SHOPIFY_API_KEY,
    });
  } catch (error) {
    console.error("[LOADER ERROR] /app authentication failed:", error);
    throw error;
  }
};

export default function App() {
  const { apiKey, shop, host } = useLoaderData<typeof loader>();

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </PolarisAppProvider>
  );
}