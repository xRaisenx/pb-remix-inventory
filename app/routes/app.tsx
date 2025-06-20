// app/routes/app.tsx

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider, Page, BlockStack } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { authenticate } from "~/shopify.server";
import AppLayout from '../components/AppLayout'; // Ensure this component exists at this path

/**
 * This loader protects all routes under `/app` and provides session data.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticate.admin will throw a redirect if the user is not authenticated.
  // If authentication is successful, it returns an object with `admin`, `session`, `billing`, etc.
  const { session, admin } = await authenticate.admin(request);

  // Return the session and admin context to be used by components under this layout.
  return json({
    session,
    // You can also pass the admin context if your components need it for GraphQL queries
    // admin
  });
};

/**
 * This is the main layout for the authenticated part of the app.
 */
export default function App() {
  // useLoaderData now correctly receives the object returned from the loader.
  // The `typeof loader` tells TypeScript to infer the return type automatically.
  const { session } = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={enTranslations}>
      {/* Pass session or other necessary data to your layout component if it needs it */}
      <AppLayout>
        <Page>
          <BlockStack>
            {/* The Outlet renders the specific child route (e.g., app._index, app.products) */}
            <Outlet />
          </BlockStack>
        </Page>
      </AppLayout>
    </AppProvider>
  );
}