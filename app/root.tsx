import { cssBundleHref } from "@remix-run/css-bundle";
import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import { useEffect } from "react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import enTranslations from "@shopify/polaris/locales/en.json";
import appStyles from "~/styles/app.css?url";
import { DatabaseErrorBoundary } from "~/components/ErrorBoundary";

export const meta: MetaFunction = () => [
  { title: "Planet Beauty AI Inventory" },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
  // CSP for embedded Shopify apps - allows embedding in Shopify Admin
  { 
    "http-equiv": "Content-Security-Policy", 
    content: "frame-ancestors https://*.shopify.com https://admin.shopify.com https://*.myshopify.com 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.shopify.com; connect-src 'self' https://*.shopify.com https://monorail-edge.shopifysvc.com wss://ping.shopify.com" 
  },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" },
  ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
];

export default function App() {
  // Enhanced client-side initialization for embedded apps
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Warmup Neon connection
      fetch("/api/warmup").catch(() => {});
      
      // Initialize App Bridge error handling for embedded context
      const handleEmbeddedAppErrors = () => {
        // Prevent SendBeacon errors from propagating
        window.addEventListener('unhandledrejection', (event) => {
          if (event.reason?.message?.includes('SendBeacon failed')) {
            console.warn('[APP] SendBeacon failed - suppressed for embedded app');
            event.preventDefault();
          }
        });
        
        // Handle App Bridge errors gracefully
        window.addEventListener('error', (event) => {
          if (event.message?.includes('frame-ancestors') || 
              event.message?.includes('X-Frame-Options')) {
            console.warn('[APP] Frame embedding error - suppressed');
            event.preventDefault();
          }
        });
      };
      
      handleEmbeddedAppErrors();
      
      // Enhanced App Bridge detection and initialization
      if (window.top !== window.self) {
        console.log('[EMBEDDED] App is running in embedded context');
        // Add App Bridge ready handler
        window.addEventListener('message', function(event) {
          if (event.origin === 'https://admin.shopify.com' || event.origin.includes('.shopify.com')) {
            console.log('[EMBEDDED] Received message from Shopify Admin:', event.data);
          }
        });
      } else {
        console.log('[EMBEDDED] App is running in non-embedded context');
      }
    }
  }, []);

  return (
    <HtmlDocument>
      <PolarisAppProvider i18n={enTranslations}>
        <Outlet />
      </PolarisAppProvider>
    </HtmlDocument>
  );
}

export function ErrorBoundary() {
  return (
    <HtmlDocument title="Error">
      <DatabaseErrorBoundary />
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
        {/* Enhanced meta tags for embedded Shopify apps */}
        <meta name="referrer" content="no-referrer" />
        {title ? <title>{title}</title> : null}
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: "localStorage.theme === 'dark' && document.documentElement.classList.add('dark')" }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <LiveReload />
        <Scripts />
        {/* Add script to handle embedded app context */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Enhanced error handling for embedded Shopify apps
              window.addEventListener('unhandledrejection', function(event) {
                if (event.reason && event.reason.message && event.reason.message.includes('SendBeacon failed')) {
                  console.warn('[EMBEDDED] SendBeacon failed - expected in some environments');
                  event.preventDefault();
                }
              });
              
              // Prevent frame-related errors from breaking the app
              window.addEventListener('error', function(event) {
                const msg = event.message || '';
                if (msg.includes('frame-ancestors') || msg.includes('X-Frame-Options') || msg.includes('refused to connect')) {
                  console.warn('[EMBEDDED] Frame error suppressed:', msg);
                  event.preventDefault();
                }
              });
              
              // Enhanced App Bridge detection and initialization
              if (window.top !== window.self) {
                console.log('[EMBEDDED] App is running in embedded context');
                // Add App Bridge ready handler
                window.addEventListener('message', function(event) {
                  if (event.origin === 'https://admin.shopify.com' || event.origin.includes('.shopify.com')) {
                    console.log('[EMBEDDED] Received message from Shopify Admin:', event.data);
                  }
                });
              } else {
                console.log('[EMBEDDED] App is running in non-embedded context');
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
