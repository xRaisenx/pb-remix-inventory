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
  // Add enhanced CSP meta tag for embedded apps
  { 
    "http-equiv": "Content-Security-Policy", 
    content: "frame-ancestors https://*.shopify.com https://admin.shopify.com https://*.myshopify.com https://accounts.shopify.com 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.shopify.com https://*.shopify.com; connect-src 'self' https://*.shopify.com https://monorail-edge.shopifysvc.com https://api.shopify.com; img-src 'self' data: https://*.shopify.com https://cdn.shopify.com" 
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
        <meta httpEquiv="X-Frame-Options" content="ALLOWALL" />
        {title ? <title>{title}</title> : null}
        <Meta />
        <Links />
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
                if (event.reason && event.reason.message) {
                  const msg = event.reason.message;
                  if (msg.includes('SendBeacon failed') || 
                      msg.includes('beacon') || 
                      msg.includes('analytics') ||
                      msg.includes('metrics')) {
                    console.warn('[EMBEDDED] Analytics/beacon error suppressed:', msg);
                    event.preventDefault();
                  }
                }
              });
              
              // Prevent frame-related errors from breaking the app
              window.addEventListener('error', function(event) {
                const msg = event.message || '';
                if (msg.includes('frame-ancestors') || 
                    msg.includes('X-Frame-Options') || 
                    msg.includes('refused to connect') ||
                    msg.includes('refused to frame') ||
                    msg.includes('accounts.shopify.com')) {
                  console.warn('[EMBEDDED] Frame error suppressed:', msg);
                  event.preventDefault();
                }
              });
              
              // Handle CSP violations gracefully
              document.addEventListener('securitypolicyviolation', function(event) {
                if (event.blockedURI && 
                    (event.blockedURI.includes('shopify.com') || 
                     event.blockedURI.includes('accounts.shopify.com'))) {
                  console.warn('[EMBEDDED] CSP violation suppressed for:', event.blockedURI);
                  event.preventDefault();
                }
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
