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
  criticalStockThresholdUnitsDisplay: string;
  criticalStockoutDaysDisplay: string;
  highSalesVelocityThresholdDisplay: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

  if (!shopRecord) {
    return json({ alerts: [], error: "Shop not found.", lowStockThresholdDisplay: 10 }, { status: 404 });
  }
  const shopId = shopRecord.id;

  // Define thresholds (use defaults or fetch from settings)
  const currentLowStockThreshold = shopRecord.notificationSettings?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
  // const currentCriticalStockThreshold = shopRecord.notificationSettings?.criticalStockThresholdUnits ?? 5; // Example, make configurable later
  // For critical alerts, this page primarily relies on product.status which is calculated by product.service.ts using these new settings.

  const defaultSalesVelocityThreshold = 30; // Default for alerts if nothing is set in notification settings
  const highSalesVelocityThreshold =
      shopRecord.notificationSettings?.salesVelocityThreshold ??
      defaultSalesVelocityThreshold;

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
        salesVelocityFloat: { gt: highSalesVelocityThreshold }
        // The 'trending' flag on product model is also updated by product.service.ts using this threshold,
        // so querying product.trending: true would also work if preferred.
        // Using salesVelocityFloat directly here ensures it uses the latest threshold from settings for alert generation.
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
      lowStockThresholdDisplay: currentLowStockThreshold,
      criticalStockThresholdUnitsDisplay: shopRecord.notificationSettings?.criticalStockThresholdUnits?.toString() ?? "Not set (default logic applies)",
      criticalStockoutDaysDisplay: shopRecord.notificationSettings?.criticalStockoutDays?.toString() ?? "Not set (default logic applies)",
      highSalesVelocityThresholdDisplay: highSalesVelocityThreshold.toString() + " units/day"
    });

  } catch (error) {
    console.error("Error fetching alerts:", error);
    const errorDefaults = {
        lowStockThresholdDisplay: currentLowStockThreshold, // currentLowStockThreshold might not be defined here if error is early
        criticalStockThresholdUnitsDisplay: "Error loading",
        criticalStockoutDaysDisplay: "Error loading",
        highSalesVelocityThresholdDisplay: "Error loading"
    };
    return json({ alerts: [], error: "Failed to fetch alerts.", ...errorDefaults }, { status: 500 });
  }
};

export default function AlertsPage() {
  const {
    alerts,
    error,
    lowStockThresholdDisplay,
    criticalStockThresholdUnitsDisplay,
    criticalStockoutDaysDisplay,
    highSalesVelocityThresholdDisplay
  } = useLoaderData<LoaderData>();

  // ... (rest of the component function is the same up to the summary card) ...

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
          <AlertsDisplay alerts={alerts} maxAlertsToShow={alerts.length} />
        )}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Alert Settings Summary</Text>
            <Text as="p">Low stock threshold (Notifications): {lowStockThresholdDisplay} units.</Text>
            <Text as="p">Critical stock threshold (Units - used in status calculation): {criticalStockThresholdUnitsDisplay}</Text>
            <Text as="p">Critical stockout threshold (Days - used in status calculation): {criticalStockoutDaysDisplay}</Text>
            <Text as="p">High sales velocity threshold (Notifications): {highSalesVelocityThresholdDisplay}</Text>
            <PolarisLink url="/app/settings">Configure notification settings and thresholds</PolarisLink>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
