import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { Card, Text } from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export default function InventoryPage() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Card>
      <Text as="h2" variant="headingMd">Inventory</Text>
      <Text as="p">Shop: {shop}</Text>
      <Text as="p">Inventory page content goes here.</Text>
    </Card>
  );
}