// app/root.tsx

import type { LinksFunction, MetaFunction } from "@remix-run/node"; // Added LinksFunction
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError, // Import useRouteError
  isRouteErrorResponse, // Import for typed error handling
} from "@remix-run/react";
import { AppProvider, Page, Banner, Text, EmptyState, BlockStack, Button } from "@shopify/polaris"; // Import Polaris components for ErrorBoundary
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Import Polaris CSS with ?url

export const meta: MetaFunction = () => {
  return [
    { charset: "utf-8" },
    { title: "Planet Beauty AI Inventory" }, // Updated title
    { viewport: "width=device-width,initial-scale=1" },
  ];
};

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
]; // Updated to use imported CSS URL

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={enTranslations}>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
        {process.env.NODE_ENV === "development" && <LiveReload />}
      </body>
    </html>
  );
}

// Global ErrorBoundary
export function ErrorBoundary() {
  const error = useRouteError();
  console.error('ErrorBoundary caught:', error);

  let errorTitle = "Application Error";
  let errorMessage = "An unexpected error occurred. Please try again later.";

  if (isRouteErrorResponse(error)) {
    errorTitle = `${error.status} ${error.statusText}`;
    errorMessage = error.data?.message || error.data || error.statusText;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // It's important for the ErrorBoundary to render the full HTML structure
  // so that Polaris styles are applied correctly.
  return (
    <html lang="en">
      <head>
        <title>{errorTitle}</title> {/* Set a title for the error page */}
        <Meta /> {/* Include meta tags, viewport, etc. */}
        <Links /> {/* Include CSS links */}
      </head>
      <body>
        <AppProvider i18n={enTranslations}> {/* AppProvider is crucial here */}
          <Page>
            <EmptyState
              heading={errorTitle}
              image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-error.png"
            >
              <BlockStack gap="200">
                <Text as="p" tone="critical">{errorMessage}</Text>
                <Button url="/" variant="primary">Go to Home</Button>
              </BlockStack>
            </EmptyState>
          </Page>
        </AppProvider>
        <Scripts /> {/* Scripts might be needed for some recovery or logging */}
        {process.env.NODE_ENV === "development" && <LiveReload />}
      </body>
    </html>
  );
}
