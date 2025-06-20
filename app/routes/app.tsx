// app/routes/app.tsx

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider, Page, BlockStack, Frame } from '@shopify/polaris'; // Import Frame
import enTranslations from '@shopify/polaris/locales/en.json';
import { authenticate } from "~/shopify.server";
import AppLayout from '../components/AppLayout'; // Ensure this component exists
import React, { useState } from "react";

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

// Custom Toast component (as useToast might not be available)
function Toast({ content, onDismiss }: { content: string; onDismiss: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#333', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999 }}>
      {content}
    </div>
  );
}

export default function App() {
  // useLoaderData now correctly receives the session object from the loader.
  const { session } = useLoaderData<typeof loader>();

  // Add state for toast (if using custom toast)
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState('');

  // Function to show toast (if using custom toast)
  // This function would need to be passed down via Context if used in nested routes
  // For now, it's just defined here.
  // const showToast = (message: string) => {
  //   setToastContent(message);
  //   setToastActive(true);
  // };


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
              <Outlet />
            </BlockStack>
          </Page>
        </AppLayout>
      </Frame>
      {/* Render custom toast if active */}
      {toastActive && <Toast content={toastContent} onDismiss={() => setToastActive(false)} />}
    </AppProvider>
  );
}