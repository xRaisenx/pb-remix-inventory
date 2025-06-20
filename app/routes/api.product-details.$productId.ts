// app/routes/api.product-details.$productId.ts
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
// Assuming a more detailed Product type might be needed, or use a specific type for this response.
// For now, we'll type the expected parts of the response.

interface ShopifyVariantNode {
  id: string; // Variant GID
  title: string; // e.g., "Small / Red"
  sku: string | null;
  price: string;
  inventoryQuantity: number | null;
  inventoryItem: {
    id: string; // InventoryItem GID - THIS IS CRUCIAL
  };
}

interface ShopifyProductDetails {
  id: string; // Product GID
  title: string;
  variants: {
    edges: Array<{ node: ShopifyVariantNode }>;
  };
}

// Add proper typing for FetchResponseBody
interface FetchResponseBody<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productId = params.productId; // This will be the Shopify Product GID

  if (!productId || !productId.startsWith("gid://shopify/Product/")) {
    return json({ error: "Invalid Product ID format." }, { status: 400 });
  }

  try {
    const response = await admin.graphql(
      `#graphql
      query GetProductWithVariantInventoryItems($id: ID!) {
        product(id: $id) {
          id
          title
          variants(first: 50) { # Adjust variant count as needed
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity # Current quantity, useful for display
                inventoryItem {
                  id # This is the inventory_item_id needed for updates
                }
              }
            }
          }
        }
      }`,
      { variables: { id: productId } }
    );

    const result: FetchResponseBody<{ product: ShopifyProductDetails }> = await response.json();
    if (result.errors) {
      console.error("GraphQL errors fetching product details:", result.errors);
      return json({ error: "Failed to fetch product details from Shopify.", details: result.errors }, { status: 500 });
    }
    if (!result.data?.product) {
      return json({ error: "Product not found in Shopify." }, { status: 404 });
    }

    return json({ product: result.data.product as ShopifyProductDetails });

  } catch (error) {
    console.error("Error fetching product details for modal:", error);
    return json({ error: "An unexpected error occurred." }, { status: 500 });
  }
};
