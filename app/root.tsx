import { cssBundleHref } from "@remix-run/css-bundle";
import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris"; // Renamed to avoid conflict
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Ensure ?url suffix
import enTranslations from "@shopify/polaris/locales/en.json";
import appStyles from "~/styles/app.css?url"; // Ensure ?url suffix

export const meta: MetaFunction = () => [{ title: "Planet Beauty AI Inventory" }];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles }, // This was kept as per the user's corrected code
  ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
];

export default function App() {
  return (
    <HtmlDocument>
      {/* AppProvider from App Bridge is typically used in app.tsx, not root.tsx */}
      {/* PolarisAppProvider is correctly used here for Polaris components styling */}
      <PolarisAppProvider i18n={enTranslations}>
        <Outlet />
      </PolarisAppProvider>
    </HtmlDocument>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "Unknown error";
  if (isRouteErrorResponse(error)) {
    errorMessage = error.data?.message || error.statusText;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Ensure ErrorBoundary also has PolarisAppProvider if Polaris components are used.
  return (
    <HtmlDocument title="Error">
      <PolarisAppProvider i18n={enTranslations}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h1>Oops!</h1>
          <p>Sorry, an unexpected error has occurred.</p>
          <p>
            <i>{errorMessage}</i>
          </p>
        </div>
      </PolarisAppProvider>
    </HtmlDocument>
  );
}

function HtmlDocument({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {title ? <title>{title}</title> : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <LiveReload />
        <Scripts />
      </body>
    </html>
  );
}
