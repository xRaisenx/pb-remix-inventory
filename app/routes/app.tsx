import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "../components/AppLayout";
import { logAndAuthenticateAdmin } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("[LOADER] /app starting authentication...");
    console.log("[LOADER] /app request URL:", request.url);
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");

    // Embedded preview override: query param -> cookie -> env
    const embeddedParam = url.searchParams.get("embedded");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieMatch = /(?:^|; )embedded_override=([^;]+)/.exec(cookieHeader);
    const embeddedCookie = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;
    const embeddedEnv = (process.env.EMBEDDED_APP || 'true').toLowerCase() === 'true';
    let isEmbedded = embeddedEnv;
    let setCookieHeader: string | undefined;

    if (embeddedParam === '1' || embeddedParam === 'true') {
      isEmbedded = true;
      setCookieHeader = `embedded_override=1; Path=/; HttpOnly; SameSite=Lax`;
    } else if (embeddedParam === '0' || embeddedParam === 'false') {
      isEmbedded = false;
      setCookieHeader = `embedded_override=0; Path=/; HttpOnly; SameSite=Lax`;
    } else if (embeddedCookie === '1' || embeddedCookie === '0') {
      isEmbedded = embeddedCookie === '1';
    }

    console.log("[LOADER] /app shop param:", shop);
    console.log("[LOADER] /app host param:", host);
    if (!shop) {
      console.error("[LOADER ERROR] No shop parameter found");
      throw redirect(`/auth/login`);
    }
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      console.error("[LOADER ERROR] Invalid shop domain format:", shop);
      throw new Response("Invalid shop domain", { status: 400 });
    }
    try {
      const { session } = await logAndAuthenticateAdmin(request);
      let validHost = host;
      if (!validHost && session?.shop) {
        const shopDomain = session.shop.replace('.myshopify.com', '');
        validHost = Buffer.from(`admin.shopify.com/store/${shopDomain}`).toString('base64');
        console.log("[LOADER] Generated host parameter:", validHost);
      }
      if (!validHost) {
        console.error("[LOADER ERROR] Unable to determine valid host parameter");
        throw new Response("Missing host parameter for embedded app", { status: 400 });
      }
      return json(
        {
          shop: session.shop,
          host: validHost,
          sessionId: session.id,
          apiKey: process.env.SHOPIFY_API_KEY,
          isEmbedded,
        },
        setCookieHeader ? { headers: { 'Set-Cookie': setCookieHeader } } : undefined
      );
    } catch (error: any) {
      console.error("[LOADER ERROR] Authentication failed:", error);
      if (error instanceof Response) {
        if (error.status === 302 && error.headers.get('location')?.includes('admin.shopify.com')) {
          console.log("[LOADER] Authentication redirect to Shopify - app may need reinstallation");
          throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
        }
        throw error;
      }
      if (shop) {
        console.log("[LOADER] Redirecting to login due to authentication error");
        throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("[LOADER ERROR] /app loader failed:", error);
    throw error;
  }
};

export default function App() {
  const data = useLoaderData() as {
    apiKey: string;
    host: string;
    shop: string;
    sessionId: string;
    isEmbedded: boolean;
  };
  const { apiKey, isEmbedded } = data;

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
    isEmbedded ? (
      <AppProvider apiKey={apiKey} isEmbeddedApp={true}>
        <PolarisAppProvider i18n={enTranslations}>
          <div className="pb-embedded-bg" style={{ minHeight: '100vh' }}>
            <AppLayout>
              <Outlet />
            </AppLayout>
          </div>
        </PolarisAppProvider>
      </AppProvider>
    ) : (
      <PolarisAppProvider i18n={enTranslations}>
        <div className="pb-embedded-bg" style={{ minHeight: '100vh' }}>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </div>
      </PolarisAppProvider>
    )
  );
}
