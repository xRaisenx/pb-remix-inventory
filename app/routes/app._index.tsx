import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { syncProductsAndInventory } from "~/services/shopify.sync.server";
import { Page, Layout, Card, Text, Button, Spinner, Banner, Grid } from "@shopify/polaris";
import { Metrics } from "~/components/Metrics";
import { TrendingProducts } from "~/components/TrendingProducts";
import { ProductAlerts } from "~/components/ProductAlerts";
import { DashboardVisualizations } from "~/components/DashboardVisualizations";
import { AIAssistant } from "~/components/AIAssistant";
import { QuickActions } from "~/components/QuickActions";
import type { DashboardAlertProduct, DashboardTrendingProduct } from "~/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    console.log("[LOADER] /app._index session:", session);
    const shopDomain = session.shop;
    const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shopRecord) throw new Response("Shop not found", { status: 404 });

    if (!shopRecord.initialSyncCompleted) {
      return json({ initialSyncCompleted: false, storeName: shopDomain.replace(".myshopify.com", "") });
    }

    const { id: shopId } = shopRecord;
    const storeName = shopDomain.replace(".myshopify.com", "");

    const totalProducts = await prisma.product.count({ where: { shopId } });
    const lowStockItemsCount = await prisma.product.count({
      where: { shopId, status: { in: ["Low", "Critical"] } },
    });

    const variants: Array<{ inventoryQuantity: number | null }> = await prisma.variant.findMany({
      where: { product: { shopId } },
      select: { inventoryQuantity: true },
    });
    const totalInventoryUnits = variants.reduce((sum: number, v: { inventoryQuantity: number | null }) => sum + (v.inventoryQuantity || 0), 0);

    const trendingProducts = (await prisma.product.findMany({
      where: { shopId, trending: true },
      take: 3,
      select: {
        id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true,
        variants: { select: { sku: true, price: true }, take: 1 },
      },
    })).map((p: any) => ({...p, variants: p.variants.map((v: any) => ({...v, price: v.price?.toString() || "0"}))})) as DashboardTrendingProduct[];

    const lowStockProductsForAlerts = await prisma.product.findMany({
      where: { shopId, status: { in: ["Low", "Critical"] } },
      select: { id: true, title: true, status: true, variants: { select: { inventoryQuantity: true } } },
      take: 3,
    }).then((products: any[]) => products.map((p: any) => ({
      ...p,
      inventory: p.variants.reduce((sum: number, v: { inventoryQuantity: number | null }) => sum + (v.inventoryQuantity || 0), 0)
    }))) as DashboardAlertProduct[];

    const highSalesTrendProducts = await prisma.product.findMany({
      where: { shopId, trending: true },
      select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
      take: 3,
      orderBy: { salesVelocityFloat: 'desc' }
    }) as DashboardAlertProduct[];

    const loaderData = {
      initialSyncCompleted: true,
      totalProducts,
      lowStockItemsCount,
      totalInventoryUnits,
      trendingProducts,
      lowStockProductsForAlerts,
      highSalesTrendProducts,
      storeName,
    };
    console.log("[LOADER] /app._index loaderData:", loaderData);
    return json(loaderData);
  } catch (error) {
    console.error("[LOADER ERROR] /app._index loader failed:", error);
    throw error;
  }
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") === "start_initial_sync") {
    try {
      await syncProductsAndInventory(session.shop, session);
      await prisma.shop.update({
        where: { shop: session.shop },
        data: { initialSyncCompleted: true },
      });
      return redirect("/app");
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
      <Page
        title="Welcome to Planet Beauty Inventory AI"
        subtitle="Let's get your inventory management set up"
      >
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <Text variant="headingMd" as="h2">
                    Initial Data Sync Required
                  </Text>
                  <Text as="p">
                    To get started, we need to perform an initial sync of your products and inventory from Shopify.
                    This may take a few minutes depending on the size of your store.
                  </Text>
                  
                  {isSyncing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Spinner size="large" />
                      <Text as="p" variant="bodySm">
                        Sync in progress... Please don't close this page.
                      </Text>
                    </div>
                  ) : (
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="start_initial_sync" />
                      <Button 
                        submit
                        variant="primary"
                        loading={isSyncing}
                        size="large"
                      >
                        Start Initial Sync
                      </Button>
                    </fetcher.Form>
                  )}
                  
                  {fetcher.data?.error && !isSyncing && (
                    <Banner tone="critical">
                      {fetcher.data.error}
                    </Banner>
                  )}
                </div>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Add type guard for dashboard data
  const isDashboardData = (data: any): data is {
    initialSyncCompleted: boolean;
    totalProducts: number;
    lowStockItemsCount: number;
    totalInventoryUnits: number;
    trendingProducts: DashboardTrendingProduct[];
    lowStockProductsForAlerts: DashboardAlertProduct[];
    highSalesTrendProducts: DashboardAlertProduct[];
    storeName: string;
  } => data && data.initialSyncCompleted === true && typeof data.totalProducts === 'number';

  if (!isDashboardData(loaderData)) {
    return null;
  }

  return (
    <Page
      title="Dashboard"
      subtitle={`Welcome back, ${loaderData.storeName}`}
    >
      <Layout>
        <Layout.Section>
          <Metrics
            totalProducts={loaderData.totalProducts}
            lowStockItemsCount={loaderData.lowStockItemsCount}
            totalInventoryUnits={loaderData.totalInventoryUnits}
          />
        </Layout.Section>
        
        <Layout.Section>
          <DashboardVisualizations />
        </Layout.Section>
        
        <Layout.Section>
          <ProductAlerts
            lowStockProducts={loaderData.lowStockProductsForAlerts}
            highSalesTrendProducts={loaderData.highSalesTrendProducts}
          />
        </Layout.Section>
        
        <Layout.Section>
          <TrendingProducts products={loaderData.trendingProducts} />
        </Layout.Section>
        
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
              <QuickActions />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
              <AIAssistant shopId={loaderData.storeName} />
            </Grid.Cell>
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}