import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Banner, Card, DataTable, Page, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import type { ShopifyProduct } from "~/types"; // Import updated type

interface LoaderData {
  products: ShopifyProduct[];
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    // Use the GraphQL API as 'rest' is not available
    const query = `
      {
        products(first: 20) {
          edges {
            node {
              id
              title
              variants(first: 20) {
                edges {
                  node {
                    id
                    inventoryQuantity
                    inventoryManagement
                  }
                }
              }
            }
          }
        }
      }
    `;
    const response = await admin.graphql(query);
    const data = await response.json();
    const products: ShopifyProduct[] = data.data.products.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      variants: edge.node.variants.edges.map((vEdge: any) => ({
        id: vEdge.node.id,
        inventoryQuantity: vEdge.node.inventoryQuantity,
        inventory_management: vEdge.node.inventoryManagement,
      })),
    }));
    return json<LoaderData>({ products });
  } catch (error) {
    console.error("Error fetching products:", error);
    return json<LoaderData>({ products: [], error: "Failed to fetch products" }, { status: 500 });
  }
};

export default function AppProductsPage() {
  const { products, error } = useLoaderData<LoaderData>();

  if (error) {
    return (
      <Page title="Products">
        <Banner title="Error loading products" tone="critical">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  const rows = products.map((product: ShopifyProduct) => {
    // Sum inventory from all variants tracked by Shopify
    let totalInventory = 0;
    if (product.variants && product.variants.length > 0) {
      totalInventory = product.variants.reduce((sum, variant) => {
        if (variant.inventory_management === "shopify") {
          return sum + (variant.inventoryQuantity ?? 0);
        }
        return sum;
      }, 0);
    }

    return [
      product.title,
      totalInventory,
    ];
  });

  return (
    <Page title="Products">
      <Card>
        <DataTable
          columnContentTypes={["text", "numeric"]}
          headings={["Product Title", "Total Inventory"]}
          rows={rows}
          footerContent={`Showing ${products.length} products`}
        />
      </Card>
      {products.length === 0 && !error && (
        <Card>
          <div style={{padding: '20px'}}>
            <Text as="p" tone="subdued">No products found.</Text>
          </div>
        </Card>
      )}
    </Page>
  );
}
