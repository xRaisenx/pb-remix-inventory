import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, EmptyState, BlockStack, Link as PolarisLink, Banner, DataTable } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { ProductStatus } from "@prisma/client";
import AlertsDisplay, { type AlertItem } from "~/components/Alerts"; // Corrected import for AlertsDisplay
import type { NotificationLog as PrismaNotificationLog } from "@prisma/client"; // Prisma generated type

// Local fallback type in case Prisma type is not generated or available during development
type NotificationLog = PrismaNotificationLog | {
  id: string;
  createdAt: Date; // Assuming Date, adjust if it's string from DB
  channel: string;
  recipient: string | null;
  productTitle: string | null;
  message: string;
  status: string;
  // Add shopId if it's part of your NotificationLog model and needed here
  // shopId: string;
};

interface LoaderData {
  alerts: AlertItem[];
  notificationHistory: NotificationLog[];
  historyError?: string;
  error?: string;
  lowStockThresholdDisplay: number; // For displaying the threshold value
  criticalStockThresholdUnitsDisplay: string; // For displaying the threshold value
  criticalStockoutDaysDisplay: string; // For displaying the threshold value
  highSalesVelocityThresholdDisplay: string; // For displaying the threshold value
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { NotificationSettings: true } // Include related settings
  });

  if (!shopRecord) {
    // Return a well-structured error response consistent with LoaderData
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
  const { id: shopId, NotificationSettings } = shopRecord;
  const notificationSettings = NotificationSettings?.[0]; // Assuming one setting record per shop

  // Determine thresholds to use for generating alerts and display
  const currentLowStockThreshold = notificationSettings?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
  // Assuming default values if not set, adjust as necessary
  const criticalStockThresholdUnits = notificationSettings?.criticalStockThresholdUnits ?? 5;
  const criticalStockoutDays = notificationSettings?.criticalStockoutDays ?? 3;
  const highSalesVelocityThreshold = notificationSettings?.salesVelocityThreshold ?? 30; // Example value

  const allAlertItems: AlertItem[] = [];
  let notificationHistory: NotificationLog[] = [];
  let historyError: string | undefined = undefined;

  try {
    // Fetch Notification History
    try {
      notificationHistory = await prisma.notificationLog.findMany({
        where: { shopId: shopId }, // Assuming shopId is part of NotificationLog model
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
    } catch (e: any) {
      console.error("Error fetching notification history:", e);
      historyError = e.message?.includes("does not exist") || e.code === 'P2021' || e.code === 'P2022'
        ? "NotificationLog table not found. Please run database migrations."
        : "Failed to fetch notification history.";
    }

    // Generate Critical Stock Alerts
    const criticalStatusProducts = await prisma.product.findMany({
      where: { shopId, status: ProductStatus.Critical },
      select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } },
      take: 10, // Limit alerts for performance
    });
    criticalStatusProducts.forEach((p: { id: string; title: string; variants: Array<{ inventoryQuantity: number | null }> }) => {
      const totalInventory = p.variants.reduce((sum: number, v) => sum + (v.inventoryQuantity || 0), 0);
      allAlertItems.push({
        id: `critical-${p.id}`,
        title: `CRITICAL STOCK: ${p.title}`,
        description: `Product status is Critical. Current inventory: ${totalInventory}. Immediate attention required. (Threshold: < ${criticalStockThresholdUnits} units or < ${criticalStockoutDays} days cover)`,
        tone: 'critical',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` }
      });
    });

    // Generate Low Stock Alerts
    const lowStatusProducts = await prisma.product.findMany({
      where: { shopId, status: ProductStatus.Low },
      select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } },
      take: 10, // Limit alerts
    });
    lowStatusProducts.forEach((p: { id: string; title: string; variants: Array<{ inventoryQuantity: number | null }> }) => {
      const totalInventory = p.variants.reduce((sum: number, v) => sum + (v.inventoryQuantity || 0), 0);
      allAlertItems.push({
        id: `low-${p.id}`,
        title: `Low Stock: ${p.title}`,
        description: `Product stock is Low. Current inventory: ${totalInventory}. Consider restocking. (Threshold: < ${currentLowStockThreshold} units)`,
        tone: 'warning',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` }
      });
    });

    // Generate High Sales Trend Alerts
    const highSalesProducts = await prisma.product.findMany({
      where: { shopId, salesVelocityFloat: { gt: highSalesVelocityThreshold } }, // Use the threshold
      select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
      take: 10, // Limit alerts
      orderBy: { salesVelocityFloat: 'desc' }
    });
    highSalesProducts.forEach((p: { id: string; title: string; salesVelocityFloat: number | null; stockoutDays: number | null }) => {
      allAlertItems.push({
        id: `trend-${p.id}`,
        title: `High Sales Trend: ${p.title}`,
        description: `Sales velocity at ${p.salesVelocityFloat?.toFixed(1)} units/day. Est. stockout in ~${p.stockoutDays?.toFixed(0)} days. (Threshold: > ${highSalesVelocityThreshold} units/day)`,
        tone: 'info',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` }
      });
    });

    // Sort alerts: critical, then warning, then info
    allAlertItems.sort((a, b) => {
      const tonesOrder: Record<AlertItem['tone'], number> = { critical: 0, warning: 1, info: 2, success: 3 /*, default: 4 */ }; // Removed 'default' as it's not a valid tone for these alerts
      return (tonesOrder[a.tone] ?? 99) - (tonesOrder[b.tone] ?? 99);
    });

    return json({
      alerts: allAlertItems,
      notificationHistory,
      historyError,
      lowStockThresholdDisplay: currentLowStockThreshold,
      criticalStockThresholdUnitsDisplay: notificationSettings?.criticalStockThresholdUnits?.toString() ?? "Not set",
      criticalStockoutDaysDisplay: notificationSettings?.criticalStockoutDays?.toString() ?? "Not set",
      highSalesVelocityThresholdDisplay: highSalesVelocityThreshold.toString() + " units/day"
    });

  } catch (error) { // Catch errors from alert generation logic
    console.error("Error fetching product alerts:", error);
    return json({
      alerts: [],
      notificationHistory, // Potentially fetched before error
      historyError,      // Potentially set before error
      error: "Failed to fetch product alerts.",
      lowStockThresholdDisplay: currentLowStockThreshold, // Still useful to display
      criticalStockThresholdUnitsDisplay: "Error",
      criticalStockoutDaysDisplay: "Error",
      highSalesVelocityThresholdDisplay: "Error"
    } as LoaderData, { status: 500 });
  }
};


export default function AlertsPage() {
  const {
    alerts,
    notificationHistory,
    historyError,
    error, // This is for errors generating the alerts themselves
    lowStockThresholdDisplay,
    criticalStockThresholdUnitsDisplay,
    criticalStockoutDaysDisplay,
    highSalesVelocityThresholdDisplay
  } = useLoaderData<LoaderData>();

  // Handle case where only alerts failed but history might be okay
  if (error && alerts.length === 0 && !historyError) {
    return (
      <Page title="Product Alerts & History">
        <Card>
          <div style={{ padding: 'var(--p-space-400)' }}> {/* Ensure consistent padding */}
            <Text as="h2" variant="headingMd" tone="critical">Error loading product alerts</Text>
            <Text as="p">{error}</Text>
          </div>
        </Card>
        {/* Optionally still show history if it loaded */}
      </Page>
    );
  }

  const notificationHistoryRows = notificationHistory.map(log => [
    new Date(log.createdAt).toLocaleString(),
    log.channel,
    log.recipient || 'N/A',
    log.productTitle || 'N/A', // Assuming productTitle can be null
    log.message.length > 50 ? `${log.message.substring(0, 47)}...` : log.message,
    log.status,
  ]);

  return (
    <Page
      title="Product Alerts & History"
      subtitle={alerts.length > 0 ? `Found ${alerts.length} items needing attention.` : "Review current alerts and past notification activity."}
    >
      <BlockStack gap="400">
        {/* Banner for alert generation errors */}
        {error && <Banner title="Product Alert Error" tone="critical"><p>{error}</p></Banner>}

        {alerts.length === 0 && !error ? (
          <EmptyState
            heading="No active product alerts"
            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-success.png"
          >
            <p>All products are currently within defined thresholds.</p>
          </EmptyState>
        ) : (
          // AlertsDisplay component handles its own rendering of alerts
          <AlertsDisplay alerts={alerts} maxAlertsToShow={alerts.length} />
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Notification History</Text>
            {/* Banner for notification history fetch errors */}
            {historyError && <Banner title="Notification History Error" tone="warning"><p>{historyError}</p></Banner>}

            {!historyError && notificationHistory.length === 0 && <Text as="p" tone="subdued">No notification history yet.</Text>}
            {!historyError && notificationHistory.length > 0 && (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Date', 'Channel', 'Recipient', 'Product', 'Message', 'Status']}
                rows={notificationHistoryRows}
                truncate // Added truncate for better display of long messages
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Alert Settings Summary</Text>
            {/* Displaying threshold values from loader data */}
            <Text as="p">Low stock threshold (Notifications): {lowStockThresholdDisplay} units.</Text>
            <Text as="p">Critical stock threshold (Units): {criticalStockThresholdUnitsDisplay}</Text>
            <Text as="p">Critical stockout threshold (Days): {criticalStockoutDaysDisplay}</Text>
            <Text as="p">High sales velocity threshold (Notifications): {highSalesVelocityThresholdDisplay}</Text>
            <PolarisLink url="/app/settings">Configure notification settings and thresholds</PolarisLink>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
