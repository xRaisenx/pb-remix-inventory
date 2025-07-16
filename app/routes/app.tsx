import { Outlet } from "@remix-run/react";
import { Page } from "@shopify/polaris";

export default function AppLayout() {
  return (
    <Page>
      <Outlet />
    </Page>
  );
}