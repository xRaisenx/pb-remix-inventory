import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { AppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppLayout } from "~/components/AppLayout"; // Corrected import path
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Frame>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </Frame>
    </AppProvider>
  );
}