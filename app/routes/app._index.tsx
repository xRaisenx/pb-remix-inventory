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
import type { DashboardAlertProduct, DashboardTrendingProduct } from "~/types"; // Ensure these types are correctly defined in ~/types

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop; // e.g., "your-store.myshopify.com"
  const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

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
    totalProducts,
    lowStockItemsCount,
    totalInventoryUnits,
    trendingProducts,
    lowStockProductsForAlerts,
    highSalesTrendProducts,
    storeName, // Pass storeName to the component
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
        <DashboardVisualizations /> {/* Assuming this component exists and works */}
        <ProductAlerts
          lowStockProducts={data.lowStockProductsForAlerts}
          highSalesTrendProducts={data.highSalesTrendProducts}
        />
        <TrendingProducts products={data.trendingProducts} />
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 6, xl: 6 }}>
            <QuickActions />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 6, xl: 6 }}>
            <AIAssistant shopName={data.storeName} />
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}