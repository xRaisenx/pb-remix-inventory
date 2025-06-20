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
      products(first: 10) {
        edges {
          node {
            id
            title
            descriptionHtml
          }
        }
      }
    }`
  );

  const data = await response.json();
  return json(data.data.products.edges);
};

export default function ProductsPage() {
  const products = useLoaderData<typeof loader>();

  return (
    <Page>
      <Text variant="headingLg" as="h1">
        Products
      </Text>
      <Card>
        <List>
          {products.map((product: any) => (
            <List.Item key={product.node.id}>
              <Text variant="headingMd" as="h2">
                {product.node.title}
              </Text>
              <div
                dangerouslySetInnerHTML={{ __html: product.node.descriptionHtml }}
              />
            </List.Item>
          ))}
        </List>
      </Card>
    </Page>
  );
}
