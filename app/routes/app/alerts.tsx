import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { ProductStatus } from "@prisma/client";
import { PlanetBeautyLayout } from "~/components/PlanetBeautyLayout";
import { useState, useMemo } from "react";
import type { NotificationLog as PrismaNotificationLog } from "@prisma/client";

type NotificationLog = PrismaNotificationLog | {
  id: string;
  createdAt: Date;
  channel: string;
  recipient: string | null;
  productTitle: string | null;
  message: string;
  status: string;
};

interface AlertItem {
  id: string;
  title: string;
  description: string;
  tone: 'critical' | 'warning' | 'info' | 'success';
  action: { content: string; url: string };
  productId?: string;
}

interface LoaderData {
  alerts: AlertItem[];
  notificationHistory: NotificationLog[];
  historyError?: string;
  error?: string;
  lowStockThresholdDisplay: number;
  criticalStockThresholdUnitsDisplay: string;
  criticalStockoutDaysDisplay: string;
  highSalesVelocityThresholdDisplay: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  let shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop }, include: { NotificationSettings: true } });
  if (!shopRecord) {
    shopRecord = await prisma.shop.create({ data: { shop: session.shop, updatedAt: new Date() } });
  }

  const { id: shopId, NotificationSettings } = shopRecord;
  const notificationSettings = NotificationSettings?.[0];

  const currentLowStockThreshold = notificationSettings?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
  const highSalesVelocityThreshold = notificationSettings?.salesVelocityThreshold ?? 30;

  const allAlertItems: AlertItem[] = [];
  let notificationHistory: NotificationLog[] = [];
  let historyError: string | undefined = undefined;

  try {
    try {
      notificationHistory = await prisma.notificationLog.findMany({
        where: { shopId: shopId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
    } catch (e: any) {
      console.error("Error fetching notification history:", e);
      historyError = e.message?.includes("does not exist") || e.code === 'P2021' || e.code === 'P2022'
        ? "NotificationLog table not found. Please run database migrations."
        : "Failed to fetch notification history.";
    }

    const criticalStatusProducts = await prisma.product.findMany({
      where: { shopId, status: ProductStatus.Critical },
      select: { id: true, title: true, Variant: { select: { inventoryQuantity: true } } },
      take: 10,
    });
    criticalStatusProducts.forEach((p: { id: string; title: string; Variant: Array<{ inventoryQuantity: number | null }> }) => {
      const totalInventory = p.Variant.reduce((sum: number, v) => sum + (v.inventoryQuantity || 0), 0);
      allAlertItems.push({
        id: `critical-${p.id}`,
        title: `CRITICAL STOCK: ${p.title}`,
        description: `Product status is Critical. Current inventory: ${totalInventory}. Immediate attention required.`,
        tone: 'critical',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` },
        productId: p.id
      });
    });

    const lowStatusProducts = await prisma.product.findMany({
      where: { shopId, status: ProductStatus.Low },
      select: { id: true, title: true, Variant: { select: { inventoryQuantity: true } } },
      take: 10,
    });
    lowStatusProducts.forEach((p: { id: string; title: string; Variant: Array<{ inventoryQuantity: number | null }> }) => {
      const totalInventory = p.Variant.reduce((sum: number, v) => sum + (v.inventoryQuantity || 0), 0);
      allAlertItems.push({
        id: `low-${p.id}`,
        title: `Low Stock: ${p.title}`,
        description: `Product stock is Low. Current inventory: ${totalInventory}. Consider restocking.`,
        tone: 'warning',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` },
        productId: p.id
      });
    });

    const highSalesProducts = await prisma.product.findMany({
      where: { shopId, salesVelocityFloat: { gt: highSalesVelocityThreshold } },
      select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
      take: 10,
      orderBy: { salesVelocityFloat: 'desc' }
    });
    highSalesProducts.forEach((p: { id: string; title: string; salesVelocityFloat: number | null; stockoutDays: number | null }) => {
      allAlertItems.push({
        id: `trend-${p.id}`,
        title: `High Sales Trend: ${p.title}`,
        description: `Sales velocity at ${p.salesVelocityFloat?.toFixed(1)} units/day. Est. stockout in ~${p.stockoutDays?.toFixed(0)} days.`,
        tone: 'info',
        action: { content: 'View Product', url: `/app/products?productId=${p.id}` },
        productId: p.id
      });
    });

    allAlertItems.sort((a, b) => {
      const tonesOrder: Record<AlertItem['tone'], number> = { critical: 0, warning: 1, info: 2, success: 3 };
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

  } catch (error) {
    console.error("Error fetching product alerts:", error);
    return json({
      alerts: [],
      notificationHistory,
      historyError,
      error: "Failed to fetch product alerts.",
      lowStockThresholdDisplay: currentLowStockThreshold,
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
    error,
    lowStockThresholdDisplay,
    criticalStockThresholdUnitsDisplay,
    criticalStockoutDaysDisplay,
    highSalesVelocityThresholdDisplay
  } = useLoaderData<LoaderData>();

  const [alertFilter, setAlertFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'priority' | 'title' | 'type'>('priority');
  const [sentNotifications, setSentNotifications] = useState<Set<string>>(new Set());

  const filteredAlerts = useMemo(() => {
    let result = alerts;
    
    if (alertFilter !== 'all') {
      result = alerts.filter(alert => alert.tone === alertFilter);
    }

    if (sortBy === 'title') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'type') {
      result = [...result].sort((a, b) => a.tone.localeCompare(b.tone));
    }
    // 'priority' maintains the original order from loader

    return result;
  }, [alerts, alertFilter, sortBy]);

  const handleSendNotification = (alertId: string, alertTitle: string) => {
    // Simulate sending notification
    setSentNotifications(prev => new Set([...prev, alertId]));
    console.log(`Notification sent for: ${alertTitle}`);
  };

  const getAlertClassName = (tone: AlertItem['tone']) => {
    switch (tone) {
      case 'critical': return 'pb-alert-critical';
      case 'warning': return 'pb-alert-warning';
      case 'info': return 'pb-alert-high-sales';
      case 'success': return 'pb-alert-high-sales';
      default: return 'pb-alert-warning';
    }
  };

  if (error && alerts.length === 0 && !historyError) {
    return (
      <PlanetBeautyLayout>
        <div className="pb-alert-critical">
          <p>Error loading product alerts: {error}</p>
        </div>
      </PlanetBeautyLayout>
    );
  }

  return (
    <PlanetBeautyLayout>
      <div className="pb-space-y-6">
        {/* Page Header */}
        <div className="pb-flex pb-justify-between pb-items-center">
          <h1 className="pb-text-2xl pb-font-bold">Product Alerts & History</h1>
          <div className="pb-text-sm" style={{ color: '#718096' }}>
            {alerts.length > 0 ? `${alerts.length} items need attention` : "No active alerts"}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="pb-alert-critical">
            <p>Product Alert Error: {error}</p>
          </div>
        )}

        {/* Filters and Controls */}
        <div className="pb-card">
          <div className="pb-flex pb-flex-wrap pb-gap-4 pb-items-center pb-justify-between">
            <div className="pb-flex pb-gap-4">
              <select
                className="pb-select"
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value)}
              >
                <option value="all">All Alerts</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">High Sales</option>
              </select>
              
              <select
                className="pb-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'priority' | 'title' | 'type')}
              >
                <option value="priority">Sort by Priority</option>
                <option value="title">Sort by Title</option>
                <option value="type">Sort by Type</option>
              </select>
            </div>
            
            <div className="pb-text-sm" style={{ color: '#718096' }}>
              {filteredAlerts.length} alerts shown
            </div>
          </div>
        </div>

        {/* Active Alerts */}
        <div className="pb-card">
          <h2 className="pb-text-lg pb-font-medium pb-mb-4">Active Alerts</h2>
          
          {filteredAlerts.length === 0 && !error ? (
            <div className="pb-text-center pb-p-8">
              <div className="pb-text-lg pb-mb-2">🎉 No active alerts!</div>
              <p style={{ color: '#718096' }}>All products are currently within defined thresholds.</p>
            </div>
          ) : (
            <div className="pb-space-y-3">
              {filteredAlerts.map((alert) => (
                <div key={alert.id} className={`${getAlertClassName(alert.tone)} pb-flex pb-justify-between pb-items-start`}>
                  <div className="pb-flex-1">
                    <h3 className="pb-font-medium pb-mb-1">{alert.title}</h3>
                    <p className="pb-text-sm pb-mb-2">{alert.description}</p>
                    <div className="pb-flex pb-gap-2">
                      <a href={alert.action.url} className="pb-btn-secondary pb-text-sm">
                        {alert.action.content}
                      </a>
                    </div>
                  </div>
                  
                  <button
                    className={`pb-btn-primary pb-text-sm ${sentNotifications.has(alert.id) ? 'pb-btn-disabled' : ''}`}
                    onClick={() => handleSendNotification(alert.id, alert.title)}
                    disabled={sentNotifications.has(alert.id)}
                  >
                    {sentNotifications.has(alert.id) ? 'Sent' : 'Send Notification'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notification History */}
        <div className="pb-card">
          <h2 className="pb-text-lg pb-font-medium pb-mb-4">Notification History</h2>
          
          {historyError && (
            <div className="pb-alert-warning pb-mb-4">
              <p>Notification History Error: {historyError}</p>
            </div>
          )}

          {!historyError && notificationHistory.length === 0 && (
            <p style={{ color: '#718096' }}>No notification history yet.</p>
          )}
          
          {!historyError && notificationHistory.length > 0 && (
            <div className="pb-overflow-x-auto">
              <table className="pb-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Channel</th>
                    <th>Recipient</th>
                    <th>Product</th>
                    <th>Message</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notificationHistory.map((log) => (
                    <tr key={log.id}>
                      <td className="pb-text-sm">{new Date(log.createdAt).toLocaleString()}</td>
                      <td><span className="pb-badge-info">{log.channel}</span></td>
                      <td>{log.recipient || 'N/A'}</td>
                      <td>{log.productTitle || 'N/A'}</td>
                      <td className="pb-text-sm">
                        {log.message.length > 50 ? `${log.message.substring(0, 47)}...` : log.message}
                      </td>
                      <td>
                        <span className={log.status === 'sent' ? 'pb-badge-success' : 'pb-badge-warning'}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alert Settings Summary */}
        <div className="pb-card">
          <h2 className="pb-text-lg pb-font-medium pb-mb-4">Alert Thresholds</h2>
          <div className="pb-grid pb-grid-cols-2 pb-gap-4 pb-text-sm">
            <div>
              <p><strong>Low Stock Threshold:</strong> {lowStockThresholdDisplay} units</p>
              <p><strong>Critical Stock Units:</strong> {criticalStockThresholdUnitsDisplay}</p>
            </div>
            <div>
              <p><strong>Critical Stockout Days:</strong> {criticalStockoutDaysDisplay}</p>
              <p><strong>High Sales Velocity:</strong> {highSalesVelocityThresholdDisplay}</p>
            </div>
          </div>
          <div className="pb-mt-3">
            <a href="/app/settings" className="pb-btn-secondary">
              Configure Notification Settings
            </a>
          </div>
        </div>
      </div>
    </PlanetBeautyLayout>
  );
}
