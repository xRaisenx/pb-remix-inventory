// app/root.tsx

import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { AppProvider, Page, Text, EmptyState, BlockStack, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "~/styles/app.css?url"; // Global styles from main
import aiAssistantCardStyles from "./styles/ai_assistant_cards.css?url"; // Custom card styles from feature branch

export const meta: MetaFunction = () => {
  return [
    { charset: "utf-8" },
    { title: "Planet Beauty AI Inventory" },
    { viewport: "width=device-width,initial-scale=1" },
  ];
};

// MERGE FIX: Included stylesheets from both branches.
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: aiAssistantCardStyles },
];

export default function App() {
  // Using the theme from the feature branch
  const AppTheme = {
    colorScheme: "light" as const,
    logo: {
      width: 124,
      accessibilityLabel: 'Planet Beauty',
    },
    colors: {
      primary: '#d81b60',
    }
  };

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={enTranslations} theme={AppTheme}>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
        {process.env.NODE_ENV === "development" && <LiveReload />}
      </body>
    </html>
  );
}

// Global ErrorBoundary (kept as is, it's well-structured)
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

  return (
    <html lang="en">
      <head>
        <title>{errorTitle}</title>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={enTranslations}>
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
        <Scripts />
        {process.env.NODE_ENV === "development" && <LiveReload />}
      </body>
    </html>
  );
}