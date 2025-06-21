import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, BlockStack, Grid } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { Metrics } from "~/components/Metrics";
import { TrendingProducts } from "~/components/TrendingProducts";
import { ProductAlerts } from "~/components/ProductAlerts";
import { DashboardVisualizations } from "~/components/DashboardVisualizations";
import { AIAssistant } from "~/components/AIAssistant";
import { QuickActions } from "~/components/QuickActions";
import type { DashboardAlertProduct, DashboardTrendingProduct } from "~/types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const { id: shopId } = shopRecord;

  const totalProducts = await prisma.product.count({ where: { shopId } });
  const lowStockItemsCount = await prisma.product.count({
    where: { shopId, status: { in: ["Low", "Critical"] } },
  });

  const variants = await prisma.variant.findMany({
    where: { product: { shopId } },
    select: { inventoryQuantity: true },
  });
  const totalInventoryUnits = variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);

  const trendingProducts = await prisma.product.findMany({
    where: { shopId, trending: true },
    take: 3,
    select: {
      id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true,
      variants: { select: { sku: true, price: true }, take: 1 },
    },
  }) as DashboardTrendingProduct[];

  const lowStockProductsForAlerts = await prisma.product.findMany({
    where: { shopId, status: { in: ['Low', 'Critical'] } },
    select: { id: true, title: true, status: true, variants: { select: { inventoryQuantity: true } } },
    take: 3,
  }) as DashboardAlertProduct[];

  const highSalesTrendProducts = await prisma.product.findMany({
    where: { shopId, trending: true },
    select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
    take: 3,
  }) as DashboardAlertProduct[];

  return json({
    totalProducts,
    lowStockItemsCount,
    totalInventoryUnits,
    trendingProducts,
    lowStockProductsForAlerts,
    highSalesTrendProducts,
  });
}

export default function DashboardIndex() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        <Metrics
          totalProducts={data.totalProducts}
          lowStockItemsCount={data.lowStockItemsCount}
          totalInventoryUnits={data.totalInventoryUnits}
        />
        <DashboardVisualizations />
        <ProductAlerts
          lowStockProducts={data.lowStockProductsForAlerts}
          highSalesTrendProducts={data.highSalesTrendProducts}
        />
        <TrendingProducts products={data.trendingProducts} />
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
            <QuickActions />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 8, xl: 8 }}>
            <AIAssistant />
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}