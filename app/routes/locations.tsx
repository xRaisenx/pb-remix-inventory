import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, List, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query {
      locations(first: 10) {
        edges {
          node {
            id
            name
            address {
              city
              country
            }
          }
        }
      }
    }`
  );

  const data = await response.json();
  return json(data.data.locations.edges);
};

export default function LocationsPage() {
  const locations = useLoaderData<typeof loader>();

  return (
    <Page>
      <Text variant="headingLg" as="h1">
        Store Locations
      </Text>
      <Card>
        <List type="bullet">
          {locations.map((location: any) => (
            <List.Item key={location.node.id}>
              {location.node.name} - {location.node.address.city},{" "}
              {location.node.address.country}
            </List.Item>
          ))}
        </List>
      </Card>
    </Page>
  );
}
