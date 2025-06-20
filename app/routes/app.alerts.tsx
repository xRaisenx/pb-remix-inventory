import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link as RemixLink } from "@remix-run/react"; // Use RemixLink for internal navigation
import { Page, Card, Text, EmptyState, BlockStack, Link as PolarisLink, Banner, DataTable } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { AlertsDisplay, type AlertItem } from "~/components/Alerts"; // Assuming AlertsDisplay is a named export from Alerts.tsx
import type { NotificationLog } from "@prisma/client"; // Import the NotificationLog type

interface LoaderData {
  alerts: AlertItem[];
  notificationHistory: NotificationLog[];
  historyError?: string; // For errors specifically related to fetching history
  error?: string; // General errors
  lowStockThresholdDisplay: number;
  criticalStockThresholdUnitsDisplay: string;
  criticalStockoutDaysDisplay: string;
  highSalesVelocityThresholdDisplay: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

  if (!shopRecord) {
    // Ensure all expected fields in LoaderData are provided, even in error cases
    return json({
      alerts: [],
      notificationHistory: [],
      error: "Shop not found.",
      lowStockThresholdDisplay: 10, // Default or placeholder
      criticalStockThresholdUnitsDisplay: "N/A",
      criticalStockoutDaysDisplay: "N/A",
      highSalesVelocityThresholdDisplay: "N/A",
    } as LoaderData, { status: 404 });
  }
  const shopId = shopRecord.id;

  // Define thresholds (use defaults or fetch from settings)
  const notificationSettings = shopRecord.NotificationSettings?.[0]; // Access the first NotificationSetting record
  const currentLowStockThreshold = notificationSettings?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
  // For critical alerts, this page primarily relies on product.status which is calculated by product.service.ts using these new settings.

  const defaultSalesVelocityThreshold = 30; // Default for alerts if nothing is set in notification settings
  const highSalesVelocityThreshold =
      notificationSettings?.salesVelocityThreshold ??
      defaultSalesVelocityThreshold;

  const allAlertItems: AlertItem[] = [];
  let notificationHistory: NotificationLog[] = [];
  let historyError: string | undefined = undefined;

  try {
    // Fetch Notification History
    try {
      notificationHistory = await prisma.notificationLog.findMany({
        where: { shopId: shopId },
        orderBy: { createdAt: 'desc' },
        take: 30, // Fetch last 30 entries
      });
    } catch (e: any) {
      // This catch block is specifically for errors fetching notification history
      console.error("Error fetching notification history:", e);
      if (e.message?.includes("relation \"NotificationLog\" does not exist")) {
        historyError = "NotificationLog table not found. Please ensure database migrations are up to date.";
      } else {
        historyError = "Failed to fetch notification history.";
      }
      // Continue to fetch other data even if history fails
    }

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
      notificationHistory,
      historyError,
      lowStockThresholdDisplay: currentLowStockThreshold,
      criticalStockThresholdUnitsDisplay: notificationSettings?.criticalStockThresholdUnits?.toString() ?? "Not set (default logic applies)",
      criticalStockoutDaysDisplay: notificationSettings?.criticalStockoutDays?.toString() ?? "Not set (default logic applies)",
      highSalesVelocityThresholdDisplay: highSalesVelocityThreshold.toString() + " units/day"
    });

  } catch (error) { // This catch block is for errors fetching product alerts, not history specifically
    console.error("Error fetching product alerts:", error);
    const errorDefaults = {
        notificationHistory, // Return history even if alerts fail, if fetched
        historyError,
        lowStockThresholdDisplay: shopRecord.lowStockThreshold ?? 10, // Use shopRecord if available
        criticalStockThresholdUnitsDisplay: "Error loading alerts",
        criticalStockoutDaysDisplay: "Error loading alerts",
        highSalesVelocityThresholdDisplay: "Error loading alerts"
    };
    // Ensure all LoaderData fields are present
    return json({ alerts: [], error: "Failed to fetch product alerts.", ...errorDefaults } as LoaderData, { status: 500 });
  }
};

export default function AlertsPage() {
  const {
    alerts,
    notificationHistory,
    historyError,
    error, // General error for product alerts
    lowStockThresholdDisplay,
    criticalStockThresholdUnitsDisplay,
    criticalStockoutDaysDisplay,
    highSalesVelocityThresholdDisplay
  } = useLoaderData<LoaderData>();


  // ... (rest of the component function is the same up to the summary card) ...

  const generalError = error; // Error from fetching product alerts

  if (generalError && alerts.length === 0 && !historyError) { // Only show full page error if no alerts could be loaded and no specific history error
    return (
      <Page title="Product Alerts & History">
        <Card>
          <div style={{padding: 'var(--p-space-400)'}}>
            <Text as="h2" variant="headingMd" tone="critical">Error loading product alerts</Text>
            <Text as="p">{generalError}</Text>
          </div>
        </Card>
      </Page>
    );
  }

  const notificationHistoryRows = notificationHistory.map(log => [
    new Date(log.createdAt).toLocaleString(),
    log.channel,
    log.recipient || 'N/A',
    log.productTitle || 'N/A',
    log.message.length > 50 ? `${log.message.substring(0, 47)}...` : log.message,
    log.status,
  ]);


  return (
    <Page
      title="Product Alerts & History"
      subtitle={alerts.length > 0 ? `Found ${alerts.length} items needing attention.` : "Review current alerts and past notification activity."}
    >
      <BlockStack gap="400">
        {generalError && ( /* Display general error as a banner */
          <Banner title="Product Alert Error" tone="critical"><p>{generalError}</p></Banner>
        )}
        {alerts.length === 0 && !generalError ? (
          <EmptyState
            heading="No active product alerts"
            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-success.png"
          >
            <p>All products are currently within defined thresholds.</p>
          </EmptyState>
        ) : (
          <AlertsDisplay alerts={alerts} maxAlertsToShow={alerts.length} />
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Notification History</Text>
            {historyError && (
              <Banner title="Notification History Error" tone="warning"><p>{historyError}</p></Banner>
            )}
            {!historyError && notificationHistory.length === 0 && (
              <Text as="p" tone="subdued">No notification history yet.</Text>
            )}
            {!historyError && notificationHistory.length > 0 && (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Date', 'Channel', 'Recipient', 'Product', 'Message', 'Status']}
                rows={notificationHistoryRows}
                truncate={true}
              />
            )}
          </BlockStack>
        </Card>

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
