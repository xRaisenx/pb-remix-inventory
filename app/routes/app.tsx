// app/routes/app.tsx

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider, Page, BlockStack, Frame } from '@shopify/polaris'; // Import Frame
import enTranslations from '@shopify/polaris/locales/en.json';
import { authenticate } from "~/shopify.server";
import AppLayout from '../components/AppLayout'; // Ensure this component exists
import React from "react"; // Removed useState as it's no longer needed here
// import React, { useState } from "react"; // Original line if useState was used for other things

/**
 * This loader protects all routes under `/app` and provides session data.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticate.admin will throw a redirect if the user is not authenticated.
  // If successful, it returns an object with `admin`, `session`, etc.
  const { session } = await authenticate.admin(request);

  // **CRITICAL FIX**: Return the session object in the JSON response.
  return json({ session });
};

/**
 * This is the main layout for the authenticated part of the app.
 */

export default function App() {
  // useLoaderData now correctly receives the session object from the loader.
  const { session } = useLoaderData<typeof loader>();

  // Custom toast, related state, and functions have been removed.

  return (
    <AppProvider i18n={enTranslations}>
      {/* Frame component is necessary for Polaris Toasts and other frame-dependent features like ContextualSaveBar */}
      {/* If using the built-in Polaris Toast, AppBridgeProvider might also be needed here or in root.tsx */}
      <Frame>
        <AppLayout>
          {/* Page component provides standard padding and structure */}
          <Page>
            {/* BlockStack for vertical spacing */}
            <BlockStack gap="400"> {/* Added gap for spacing between sections */}
              <Outlet /> {/* session prop is available via useLoaderData in nested routes if needed */}
            </BlockStack>
          </Page>
        </AppLayout>
      </Frame>
      {/* Custom toast rendering removed */}
    </AppProvider>
  );
}