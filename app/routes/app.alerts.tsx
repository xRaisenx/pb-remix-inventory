import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link as RemixLink } from "@remix-run/react"; // Use RemixLink for internal navigation
import { Page, Card, Text, EmptyState, BlockStack, Link as PolarisLink } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import AlertsDisplay, { type AlertItem } from "~/components/AlertsDisplay"; // Assuming AlertsDisplay path is correct

interface LoaderData {
  alerts: AlertItem[];
  error?: string;
  lowStockThresholdDisplay: number;
  // Add other thresholds if fetched, e.g., salesVelocityThresholdDisplay
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

  if (!shopRecord) {
    return json({ alerts: [], error: "Shop not found.", lowStockThresholdDisplay: 10 }, { status: 404 });
  }
  const shopId = shopRecord.id;

  // Define thresholds (use defaults or fetch from settings)
  const currentLowStockThreshold = shopRecord.lowStockThreshold ?? 10;
  const currentCriticalStockThreshold = 5; // Example, make configurable later
  const currentHighSalesVelocityThreshold = 30; // Example, make configurable later

  const allAlertItems: AlertItem[] = [];

  try {
    // Critical Stock Items (based on status field)
    const criticalStatusProducts = await prisma.product.findMany({
      where: { shopId, status: 'Critical' },
      select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } }, // Fetch total quantity if needed
      take: 10, // Limit alerts displayed
    });
    criticalStatusProducts.forEach(p => {
      const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
      allAlertItems.push({
        id: `critical-${p.id}`,
        title: `CRITICAL STOCK: ${p.title}`,
        description: `Product status is Critical. Current inventory: ${totalInventory}. Immediate attention required.`,
        tone: 'critical',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` }
      });
    });

    // Low Stock Items (based on status field, excluding Critical ones if status is hierarchical)
    const lowStatusProducts = await prisma.product.findMany({
      where: { shopId, status: 'Low' },
      select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } },
      take: 10,
    });
    lowStatusProducts.forEach(p => {
      const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
      allAlertItems.push({
        id: `low-${p.id}`,
        title: `Low Stock: ${p.title}`,
        description: `Product stock is Low. Current inventory: ${totalInventory}. Consider restocking. Threshold: < ${currentLowStockThreshold}`,
        tone: 'warning',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` }
      });
    });

    // High Sales Trend Items
    const highSalesProducts = await prisma.product.findMany({
      where: {
        shopId,
        // Assuming 'trending' can be a proxy OR a direct sales velocity check
        // If using salesVelocityFloat directly:
        salesVelocityFloat: { gt: currentHighSalesVelocityThreshold }
        // If using trending as a proxy and it's a boolean:
        // trending: true
      },
      select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
      take: 10,
    });
    highSalesProducts.forEach(p => {
      allAlertItems.push({
        id: `trend-${p.id}`,
        title: `High Sales Trend: ${p.title}`,
        description: `Sales velocity at ${p.salesVelocityFloat?.toFixed(1)} units/day. Est. stockout in ~${p.stockoutDays?.toFixed(0)} days.`,
        tone: 'info',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` }
      });
    });

    // Sort alerts: critical, warning, info
    allAlertItems.sort((a,b) => {
        const tonesOrder: Record<AlertItem['tone'], number> = { critical: 0, warning: 1, info: 2, success: 3, default: 4 };
        return (tonesOrder[a.tone] ?? 99) - (tonesOrder[b.tone] ?? 99);
    });

    return json({
      alerts: allAlertItems,
      lowStockThresholdDisplay: currentLowStockThreshold
      // Pass other thresholds if needed for display
    });

  } catch (error) {
    console.error("Error fetching alerts:", error);
    return json({ alerts: [], error: "Failed to fetch alerts.", lowStockThresholdDisplay: currentLowStockThreshold }, { status: 500 });
  }
};

export default function AlertsPage() {
  const { alerts, error, lowStockThresholdDisplay } = useLoaderData<LoaderData>();

  if (error && alerts.length === 0) { // Only show full page error if no alerts could be loaded
    return (
      <Page title="Product Alerts">
        <Card>
          <div style={{padding: 'var(--p-space-400)'}}>
            <Text as="h2" variant="headingMd" tone="critical">Error loading alerts</Text>
            <Text as="p">{error}</Text>
          </div>
        </Card>
      </Page>
    );
  }

  // If there's an error but some alerts were loaded, AlertsDisplay might show them with an error message for the failed ones.
  // For simplicity, if error exists, we'll show it prominently here. A more granular approach is possible.

  return (
    <Page
      title="Product Alerts"
      subtitle={alerts.length > 0 ? `Found ${alerts.length} items needing attention.` : ""}
    >
      <BlockStack gap="400">
        {error && ( /* Display error as a banner if some alerts might still be shown or if it's a partial error */
          <Banner title="Error Notice" tone="critical"><p>{error}</p></Banner>
        )}
        {alerts.length === 0 && !error ? (
          <EmptyState
            heading="No active alerts"
            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-success.png"
          >
            <p>All products are currently within defined thresholds.</p>
          </EmptyState>
        ) : (
          // Assuming AlertsDisplay can handle AlertItem[]
          // If AlertsDisplay is not designed for this, we would map alerts to Banners here.
          <AlertsDisplay alerts={alerts} maxAlertsToShow={alerts.length} />
        )}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Alert Settings Summary</Text>
            <Text as="p">Current low stock threshold: {lowStockThresholdDisplay} units.</Text>
            <Text as="p">Current critical stock threshold: 5 units (example).</Text>
            <Text as="p">Current high sales velocity threshold: 30 units/day (example).</Text>
            <PolarisLink url="/app/settings">Configure notification settings and thresholds</PolarisLink>
            {/* For Remix internal links, prefer RemixLink if not using PolarisLink's external features: */}
            {/* <RemixLink to="/app/settings">Configure notification settings and thresholds</RemixLink> */}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
