// app/routes/app._index.tsx
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, BlockStack, Grid } from "@shopify/polaris"; // Or InlineGrid
import prisma from "~/db.server"; // Corrected path
import { authenticate } from "~/shopify.server"; // Corrected path
import { Metrics } from "~/components/Metrics"; // Corrected path
import { TrendingProducts } from "~/components/TrendingProducts"; // Corrected path
import { ProductAlerts } from "~/components/ProductAlerts";
// Import the new types
import type { DashboardAlertProduct, DashboardTrendingProduct, DashboardProductVariant } from "~/types";
import { DashboardVisualizations } from "~/components/DashboardVisualizations"; // Import the new component
import { AIAssistant } from "~/components/AIAssistant";
import { QuickActions } from "~/components/QuickActions"; // Import the new QuickActions component

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request); // admin method for backend auth
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) {
    // Consider throwing a Response for better error handling in Remix
    throw new Response("Shop not found in database.", { status: 404 });
  }
  const shopId = shopRecord.id;

  const totalProducts = await prisma.product.count({ where: { shopId } });

  // Simplified lowStockItemsCount as per subtask note
  const lowStockItemsCount = await prisma.product.count({
    where: {
      shopId,
      status: "Low" // This relies on the 'status' field being accurately updated
    }
  });

  const variants = await prisma.variant.findMany({
    where: { product: { shopId: shopId } },
    select: { inventoryQuantity: true }
  });
  const totalInventoryUnits = variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);

  const trendingProducts = await prisma.product.findMany({
    where: { shopId, trending: true },
    take: 3,
    select: {
      id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true,
      variants: { select: { sku: true, price: true }, take: 1 }
    }
  }) as DashboardTrendingProduct[]; // Assert type for clarity, Prisma select matches

  const lowStockProductsForAlerts = await prisma.product.findMany({
    where: { shopId, status: { in: ['Low', 'Critical'] } },
    select: { id: true, title: true, status: true },
    take: 3
  }) as DashboardAlertProduct[]; // Assert type

  // Using 'trending: true' which is now reliable for high sales alerts
  const highSalesTrendProducts = await prisma.product.findMany({
    where: { shopId, trending: true },
    select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true }, // Fields match DashboardAlertProduct
    take: 3
  }) as DashboardAlertProduct[]; // Assert type

  return json({
    totalProducts,
    lowStockItemsCount,
    totalInventoryUnits,
    trendingProducts, // Type is DashboardTrendingProduct[]
    lowStockProductsForAlerts, // Type is DashboardAlertProduct[]
    highSalesTrendProducts, // Type is DashboardAlertProduct[]
    shopDisplayName: session.shop
  });
}

export default function DashboardIndex() {
  const data = useLoaderData<typeof loader>();
  return (
    <Page title="Dashboard Overview">
      <BlockStack gap="600"> {/* Consider Polaris Grid for more complex layouts if needed */}
        <Metrics
          totalProducts={data.totalProducts}
          lowStockItemsCount={data.lowStockItemsCount}
          totalInventoryUnits={data.totalInventoryUnits}
        />
        {/* Render the new DashboardVisualizations component */}
        <DashboardVisualizations /* Pass mock data here if needed in the future */ />
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