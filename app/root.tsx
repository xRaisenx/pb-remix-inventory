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
import { AppProvider, Page, EmptyState, BlockStack, Text, Button } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import enTranslations from "@shopify/polaris/locales/en.json";
import appStyles from "~/styles/app.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
];

function Document({ children, title }: { children: React.ReactNode; title?: string }) {
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

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let title = "Error";
  let message = "An unknown error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = typeof error.data === 'string' ? error.data : 'An unexpected error occurred.';
  } else if (error instanceof Error) {
    title = error.name;
    message = error.message;
  }

  return (
    <Document title={title}>
      <AppProvider i18n={enTranslations}>
        <Page>
          <EmptyState
            heading={title}
            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-error.png"
          >
            <BlockStack gap="200">
              <Text as="p" tone="critical">{message}</Text>
              <Button url="/" variant="primary">Go to Home</Button>
            </BlockStack>
          </EmptyState>
        </Page>
      </AppProvider>
    </Document>
  );
}
