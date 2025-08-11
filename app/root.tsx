import { cssBundleHref } from "@remix-run/css-bundle";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData
} from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import enTranslations from "@shopify/polaris/locales/en.json";
import appStyles from "./styles/app.css?url";
import { DatabaseErrorBoundary } from "~/components/ErrorBoundary";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" },
  ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const isEmbedded = (process.env.EMBEDDED_APP || 'true').toLowerCase() === 'true';
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || "*.myshopify.com";
  const frameAncestors = isEmbedded
    ? `https://${shopParam} https://admin.shopify.com`
    : `'none'`;

  return json(
    {
      polarisTranslations: enTranslations,
    },
    {
      headers: {
        "Content-Security-Policy": `frame-ancestors ${frameAncestors};`,
      },
    }
  );
};

export default function App() {
  const { polarisTranslations } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <PolarisAppProvider i18n={polarisTranslations}>
          <Outlet />
        </PolarisAppProvider>
        <ScrollRestoration />
        <LiveReload />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error</title>
        <Meta />
        <Links />
      </head>
      <body>
        <PolarisAppProvider i18n={enTranslations}>
          <DatabaseErrorBoundary />
        </PolarisAppProvider>
        <Scripts />
      </body>
    </html>
  );
}
