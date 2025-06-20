// app/routes/app._index.tsx
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, BlockStack, Grid } from "@shopify/polaris"; // Or InlineGrid
import prisma from "~/db.server"; // Corrected path
import { authenticate } from "~/shopify.server"; // Corrected path
import { Metrics } from "~/components/Metrics"; // Corrected path
import { TrendingProducts } from "~/components/TrendingProducts"; // Corrected path
import { ProductAlerts } from "~/components/ProductAlerts";
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
    // Select fields needed by TrendingProducts component, including variants for SKU/price
    select: { id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true, variants: { select: { sku: true, price: true }, take: 1 } }
  });

  const lowStockProductsForAlerts = await prisma.product.findMany({
    where: { shopId, status: { in: ['Low', 'Critical'] } },
    select: { id: true, title: true, status: true }, // Add 'inventory' if you have a direct field or calculate it
    take: 3
  });

  // Using 'trending: true' as a proxy for high sales for alerts for now
  const highSalesTrendProducts = await prisma.product.findMany({
    where: { shopId, trending: true }, // Replace with actual high sales velocity logic later if different from 'trending'
    select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
    take: 3
  });

  return json({
    totalProducts,
    lowStockItemsCount,
    totalInventoryUnits,
    trendingProducts,
    lowStockProductsForAlerts,
    highSalesTrendProducts,
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
          lowStockProducts={data.lowStockProductsForAlerts as any} // Cast as any if Prisma types don't perfectly match AlertProduct
          highSalesTrendProducts={data.highSalesTrendProducts as any} // Cast as any for same reason
        />
        <TrendingProducts products={data.trendingProducts as any} />
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