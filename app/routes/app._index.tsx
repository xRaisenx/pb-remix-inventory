import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, BlockStack, Grid, Card, Banner, Button, Text, Spinner } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { syncProductsAndInventory } from "~/services/shopify.sync.server"; // Import the sync function
import { Metrics } from "~/components/Metrics";
import { TrendingProducts } from "~/components/TrendingProducts";
import { ProductAlerts } from "~/components/ProductAlerts";
import { DashboardVisualizations } from "~/components/DashboardVisualizations";
import { AIAssistant } from "~/components/AIAssistant";
import { QuickActions } from "~/components/QuickActions";
import type { DashboardAlertProduct, DashboardTrendingProduct } from "~/types"; // Ensure these types are correctly defined in ~/types

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  // If sync is not complete, we don't need to load all the metrics yet.
  if (!shopRecord.initialSyncCompleted) {
    return json({ initialSyncCompleted: false, storeName: shopDomain.replace(".myshopify.com", "") });
  }

  // ... (existing loader logic for metrics)
  const { id: shopId } = shopRecord;
  const storeName = shopDomain.replace(".myshopify.com", ""); // Extracts "your-store"

  const totalProducts = await prisma.product.count({ where: { shopId } });
  const lowStockItemsCount = await prisma.product.count({
    where: { shopId, status: { in: ["Low", "Critical"] } }, // Assuming status is a string field
  });

  // Explicitly type the variants for reduce
  const variants: Array<{ inventoryQuantity: number | null }> = await prisma.variant.findMany({
    where: { product: { shopId } }, // Ensure relation is correct
    select: { inventoryQuantity: true },
  });
  const totalInventoryUnits = variants.reduce((sum: number, v: { inventoryQuantity: number | null }) => sum + (v.inventoryQuantity || 0), 0);

  // Cast to DashboardTrendingProduct[] as per user's provided code
  const trendingProducts = await prisma.product.findMany({
    where: { shopId, trending: true },
    take: 3,
    select: {
      id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true,
      variants: { select: { sku: true, price: true }, take: 1 }, // Assuming price is Decimal, will be stringified by JSON
    },
  }) as DashboardTrendingProduct[];

  // Cast to DashboardAlertProduct[] as per user's provided code for lowStockProductsForAlerts
  const lowStockProductsForAlerts = await prisma.product.findMany({
    where: { shopId, status: { in: ['Low', 'Critical'] } },
    select: { id: true, title: true, status: true, variants: { select: { inventoryQuantity: true } } },
    take: 3,
  }).then(products => products.map(p => ({
    ...p,
    // Explicitly type for reduce
    inventory: p.variants.reduce((sum: number, v: { inventoryQuantity: number | null }) => sum + (v.inventoryQuantity || 0), 0)
  }))) as DashboardAlertProduct[];

  // Cast to DashboardAlertProduct[] as per user's provided code for highSalesTrendProducts
  const highSalesTrendProducts = await prisma.product.findMany({
    where: { shopId, trending: true }, // Or another condition for "high sales trend"
    select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true }, // Ensure these fields exist
    take: 3,
    orderBy: { salesVelocityFloat: 'desc' } // Example: order by sales velocity
  }) as DashboardAlertProduct[];


  return json({
    initialSyncCompleted: true,
    totalProducts,
    lowStockItemsCount,
    totalInventoryUnits,
    trendingProducts,
    lowStockProductsForAlerts,
    highSalesTrendProducts,
    storeName, // Pass storeName to the component
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") === "start_initial_sync") {
    try {
      // This can be a long process. For production apps, consider a background job queue.
      // For this implementation, we run it directly and handle the loading state on the frontend.
      await syncProductsAndInventory(session.shop, session);

      // Mark sync as complete
      await prisma.shop.update({
        where: { shop: session.shop },
        data: { initialSyncCompleted: true },
      });

      return redirect("/app"); // Redirect to reload the page and show the dashboard
    } catch (error) {
      console.error("Initial sync failed:", error);
      return json({ error: "The initial data sync failed. Please try again or contact support." }, { status: 500 });
    }
  }
  return json({ error: "Invalid action" }, { status: 400 });
}


export default function DashboardIndex() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isSyncing = fetcher.state === 'submitting';

  if (!loaderData.initialSyncCompleted) {
    return (
      <Page title="Welcome! Let's get you set up.">
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Initial Data Sync Required</Text>
            <Text as="p">
              To get started, we need to perform an initial sync of your products and inventory from Shopify.
              This may take a few minutes depending on the size of your store.
            </Text>
            {isSyncing ? (
              <BlockStack gap="200" inlineAlign="center">
                <Spinner accessibilityLabel="Syncing data" />
                <Text as="p" tone="subdued">Sync in progress... Please don't close this page.</Text>
              </BlockStack>
            ) : (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="start_initial_sync" />
                <Button submit variant="primary" size="large" disabled={isSyncing}>
                  Start Initial Sync
                </Button>
              </fetcher.Form>
            )}
            {fetcher.data?.error && !isSyncing && (
              <Banner tone="critical">{fetcher.data.error}</Banner>
            )}
          </BlockStack>
        </Card>
      </Page>
    );
  }

  // The existing dashboard JSX
  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        <Metrics
          totalProducts={loaderData.totalProducts}
          lowStockItemsCount={loaderData.lowStockItemsCount}
          totalInventoryUnits={loaderData.totalInventoryUnits}
        />
        <DashboardVisualizations /> {/* Assuming this component exists and works */}
        <ProductAlerts
          lowStockProducts={loaderData.lowStockProductsForAlerts}
          highSalesTrendProducts={loaderData.highSalesTrendProducts}
        />
        <TrendingProducts products={loaderData.trendingProducts} />
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 6, xl: 6 }}>
            <QuickActions />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 6, xl: 6 }}>
            <AIAssistant shopName={loaderData.storeName} />
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}