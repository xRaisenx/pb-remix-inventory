import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { Page, Card, Text } from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export default function ReportsPage() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Page title="Reports">
      <Card>
        <Text as="h2" variant="headingMd">Reports</Text>
        <Text as="p">Shop: {shop}</Text>
        <Text as="p">Reports page content goes here.</Text>
      </Card>
    </Page>
  );
}