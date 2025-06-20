// app/routes/app._index.tsx

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  Card,
  Text,
  Button,
  ResourceList,
  ResourceItem,
  Avatar,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server"; // Relies on your NEW shopify.server.ts
import prisma from "~/db.server";
import type { Product as AppProductType } from "~/types"; // For TrendingProducts component
import MetricsGrid from "../components/Metrics"; // Assuming this component exists
import AlertsDisplay, { type AlertItem } from "../components/Alerts"; // Assuming this component exists
import TrendingProducts from "../components/TrendingProducts"; // Assuming this component exists

// Define the structure for a Shopify product variant, used in ShopifyProduct
type ShopifyProductVariant = {
  id: string; // Prisma Variant ID
  title: string; // Variant title (e.g., "Small", "Red")
  inventoryQuantity: number | null;
};

// Define the structure for a Shopify product, used in the main products list
interface ShopifyProduct {
  id: string; // Prisma Product ID (used for internal linking and keys)
  title: string;
  vendor: string;
  productType: string;
  shopifyId: string; // Shopify Product GID (or Prisma ID if GID is null)
  variants: ShopifyProductVariant[]; // Variants for this product
}

// Define the overall data structure returned by the loader
interface OverviewLoaderData {
  metrics: {
    totalProducts: number;
    lowStockItemsCount: number;
    totalInventoryUnits: number;
  };
  alertsSummary: AlertItem[];
  trendingProductsData: AppProductType[];
  products: ShopifyProduct[];
  error?: string;
}

// Loader function to fetch data for the overview page
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      // It's good practice to throw a Response for not found, Remix handles it
      throw new Response("Shop not found in database.", { status: 404 });
    }

    // --- Metrics ---
    const totalProducts = await prisma.product.count({
      where: { shopId: shop.id },
    });
    const lowStockThreshold = shop.lowStockThreshold ?? 10; // Use shop-specific threshold or default
    const lowStockItemsCount = await prisma.inventory.count({
      where: {
        quantity: { lt: lowStockThreshold },
        warehouse: { shopId: shop.id },
      },
    });
    const totalInventoryAgg = await prisma.inventory.aggregate({
      _sum: { quantity: true },
      where: { warehouse: { shopId: shop.id } },
    });
    const totalInventoryUnits = totalInventoryAgg._sum.quantity ?? 0;

    // --- Alerts Summary (Top 3 Low Stock Items) ---
    const lowStockDetails = await prisma.inventory.findMany({
      where: {
        quantity: { lt: lowStockThreshold },
        warehouse: { shopId: shop.id },
      },
      take: 3,
      include: {
        product: { select: { id: true, title: true } }, // product.id is Prisma's Product UUID
        warehouse: { select: { name: true } },
      },
      orderBy: { quantity: 'asc' },
    });
    const alertsSummary: AlertItem[] = lowStockDetails.map((item) => ({
      id: `lowstock-${item.id}`, // item.id is Inventory record's UUID
      title: `Low Stock: ${item.product.title}`,
      description: `${item.quantity} units left in ${item.warehouse.name}. Threshold: ${lowStockThreshold}.`,
      tone: item.quantity < lowStockThreshold / 2 ? 'critical' : 'warning',
      action: { content: "View Inventory", url: "/app/inventory" },
    }));

    // --- Trending Products Data ---
    // Placeholder: Fetches 3 most recent products and mocks them as "trending"
    // The 'as any' on select and the ts-ignore comment suggest potential issues
    // with Prisma's generated types for 'vendor' or other fields.
    // This workaround is kept as it might be necessary for the code to run in your specific environment.
    // @ts-ignore: This comment was in your original code, indicating 'vendor' might not be in generated types as expected.
    const recentProductsFromDb = await prisma.product.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true, // Prisma Product ID
        title: true,
        vendor: true, // Attempting to select vendor
        shopifyId: true, // Shopify Product GID
        variants: {
          select: {
            id: true, // Prisma Variant ID
            sku: true,
            price: true, // Prisma Decimal type, often string or number
            inventoryQuantity: true,
            inventoryItem: { select: { id: true } }, // Shopify InventoryItem GID
          },
        },
      } as any, // This 'as any' bypasses TypeScript errors for the select query, possibly due to 'vendor'.
    });

    // Type for variants within the trending products mapping
    type TrendingProductVariantInput = {
      id: string; // Prisma Variant ID
      sku?: string | null;
      price?: number | string | null;
      inventoryQuantity?: number | null;
      inventoryItem?: { id: string } | null; // Shopify InventoryItem GID
    };

    // Mapping recent products to the AppProductType structure for the TrendingProducts component
    // Using `(recentProductsFromDb as any[])` and `p: any` due to the `select: ... as any` above.
    const trendingProductsData: AppProductType[] = (recentProductsFromDb as any[]).map(
      (p: any) => { // `p` is typed as `any` because `recentProductsFromDb` is effectively `any[]`
        const totalInventory = (p.variants ?? []).reduce(
          (sum: number, variant: any) => sum + (variant.inventoryQuantity ?? 0),
          0,
        );
        let status: AppProductType['status'] = 'Healthy';
        if (totalInventory < lowStockThreshold) {
          status = totalInventory < lowStockThreshold / 2 ? 'Critical' : 'Low';
        }

        return {
          id: p.shopifyId ?? p.id, // Use Shopify GID for AppProductType ID if available, else Prisma ID
          title: p.title ?? 'Unknown Product',
          vendor: p.vendor ?? 'Unknown Vendor',
          variants: (p.variants ?? []).map((variant: TrendingProductVariantInput) => ({
            id: variant.id, // Prisma Variant ID
            inventoryQuantity: variant.inventoryQuantity ?? 0,
            sku: variant.sku ?? "N/A",
            price: String(variant.price ?? "0.00"), // Ensure price is a string
            inventoryItem: { // Shopify InventoryItem GID
              id: variant.inventoryItem?.id ?? `gid://shopify/InventoryItem/mock-${variant.id}`,
            },
          })),
          salesVelocity: Math.floor(Math.random() * 10) + 1, // Mocked data
          stockoutDays: totalInventory > 0 && status !== 'Healthy' ? Math.floor(Math.random() * 5) + 1 : 0, // Mocked data
          status: status,
          trending: true, // Marked as trending
        };
      },
    );

    // --- Products for Main List ---
    // Fetches a small list of products for the ResourceList display.
    // Assuming DbProduct defines the fields selected from Prisma.
    interface DbProduct {
      id: string; // Prisma Product ID
      title: string;
      shopifyId?: string | null; // Shopify Product GID
      vendor?: string | null;
      productType?: string | null;
    }

    const productsFromDb = await prisma.product.findMany({
      where: { shopId: shop.id },
      take: 5, // Limiting to 5 products for the overview list
      orderBy: { title: 'asc' }, // Optional: order them
      select: {
        id: true,
        title: true,
        shopifyId: true,
        vendor: true, // Select if 'vendor' exists in your Prisma Product model
        productType: true, // Select if 'productType' exists
      },
    });

    // Map database results to the ShopifyProduct[] structure for the ResourceList
    const products: ShopifyProduct[] = productsFromDb.map((p: DbProduct) => ({
      id: p.id, // Prisma Product ID
      title: p.title,
      vendor: p.vendor ?? "Unknown Vendor",
      productType: p.productType ?? "Unknown Type",
      shopifyId: p.shopifyId ?? p.id, // Fallback to Prisma ID if Shopify GID is missing
      variants: [], // Variants are not populated for this simple list, can be expanded if needed
    }));

    return json<OverviewLoaderData>({
      metrics: {
        totalProducts,
        lowStockItemsCount,
        totalInventoryUnits,
      },
      alertsSummary,
      trendingProductsData,
      products,
    });
  } catch (error) {
    console.error("Error loading overview data:", error);
    // Return a default state in case of error
    return json<OverviewLoaderData>(
      {
        metrics: {
          totalProducts: 0,
          lowStockItemsCount: 0,
          totalInventoryUnits: 0,
        },
        alertsSummary: [
          {
            id: 'error-loading',
            title: 'Failed to load dashboard data',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
            tone: 'critical',
          }
        ],
        trendingProductsData: [],
        products: [],
        error: error instanceof Error ? error.message : "Failed to load data",
      },
      { status: error instanceof Response ? error.status : 500 }, // Set appropriate status if error is a Response
    );
  }
};

// React component for the Overview page
export default function OverviewPage() {
  const {
    metrics,
    alertsSummary,
    trendingProductsData,
    products,
    // error, // You can use this to display a general error message if needed
  } = useLoaderData<OverviewLoaderData>();

  // Optional: Display a banner if there was an error loading data
  // const errorBanner = error ? (
  //   <Layout.Section>
  //     <Banner title="Error" tone="critical">
  //       <p>{error}</p>
  //     </Banner>
  //   </Layout.Section>
  // ) : null;

  return (
    <Page title="Overview Dashboard">
      <Layout>
        {/* {errorBanner} */}
        <Layout.Section>
          <MetricsGrid
            totalProducts={metrics.totalProducts}
            lowStockItemsCount={metrics.lowStockItemsCount}
            totalInventoryUnits={metrics.totalInventoryUnits}
          />
        </Layout.Section>

        {alertsSummary.length > 0 && (
          <Layout.Section>
            <AlertsDisplay alerts={alertsSummary} />
          </Layout.Section>
        )}

        {trendingProductsData.length > 0 && (
          <Layout.Section>
            <TrendingProducts products={trendingProductsData} />
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Product List
              </Text>
              {products.length > 0 ? (
                <ResourceList
                  items={products}
                  renderItem={(product: ShopifyProduct) => {
                    return (
                      <ResourceItem
                        id={product.id} // Using Prisma product ID as key
                        url={`/app/products/${product.id}`} // Link to a product detail page (using Prisma ID)
                        media={<Avatar customer={false} name={product.title} initials={product.title.charAt(0)} />}
                        accessibilityLabel={`View details for ${product.title}`}
                        persistActions
                      >
                        <Text variant="bodyMd" fontWeight="semibold" as="h3">
                          {product.title}
                        </Text>
                        <div>Vendor: {product.vendor}</div>
                        <div>Type: {product.productType}</div>
                      </ResourceItem>
                    );
                  }}
                />
              ) : (
                <Text as="p" variant="bodyMd" tone="subdued">
                  No products found.
                </Text>
              )}
               <Button url="/app/products">View all products</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}