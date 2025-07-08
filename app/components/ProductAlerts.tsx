// app/components/ProductAlerts.tsx
import { useFetcher } from '@remix-run/react';
import React, { useState, useEffect } from 'react';
import type { DashboardAlertProduct } from '~/types';

interface ProductAlertsProps {
  lowStockProducts: DashboardAlertProduct[];
  highSalesTrendProducts: DashboardAlertProduct[];
}

interface NotificationHistoryItem {
  message: string;
  timestamp: string;
  status: string;
}

export const ProductAlerts: React.FC<ProductAlertsProps> = ({ 
  lowStockProducts, 
  highSalesTrendProducts 
}) => {
  const fetcher = useFetcher();
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([]);

  const handleSendNotification = (
    productId: string,
    productTitle: string,
    alertType: 'low_stock' | 'high_trend',
    message: string
  ) => {
    // Add to notification history
    const historyEntry: NotificationHistoryItem = {
      message,
      timestamp: new Date().toLocaleString(),
      status: "Sent"
    };
    
    const updatedHistory = [...notificationHistory, historyEntry];
    setNotificationHistory(updatedHistory.slice(-5)); // Keep last 5 notifications

    // Submit to server
    fetcher.submit(
      {
        productId,
        productTitle,
        alertType,
        message,
      },
      { method: 'post', action: '/app/actions/send-alert-notification' }
    );
  };

  // Create alert data combining both low stock and high sales
  const allAlerts = [
    ...lowStockProducts.map(product => ({
      id: product.id,
      type: 'critical' as const,
      title: product.title,
      message: `${product.title} inventory ${product.status?.toLowerCase()} (${'inventory' in product ? (product as any).inventory : 'N/A'} left)`,
      fullMessage: `${product.title} is ${product.status?.toLowerCase()} in stock. Current inventory: ${'inventory' in product ? (product as any).inventory : 'N/A'}. Consider restocking.`,
      alertType: 'low_stock' as const
    })),
    ...highSalesTrendProducts.map(product => ({
      id: product.id,
      type: 'high-sales' as const,
      title: product.title,
      message: `🚨 High Sales Alert: ${product.title} has sales velocity of ${product.salesVelocityFloat?.toFixed(0) || 0} units/day. Estimated stockout in ${product.stockoutDays?.toFixed(2) || 0} days.`,
      fullMessage: `${product.title} has high sales velocity (${product.salesVelocityFloat?.toFixed(2)} units/day). Estimated stockout in ${product.stockoutDays?.toFixed(0)} days.`,
      alertType: 'high_trend' as const
    }))
  ];

  return (
    <div className="pb-card pb-mb-6">
      <h2 className="pb-text-lg pb-font-medium pb-mb-4">Current Alerts</h2>
      
      {/* Alerts List */}
      <div className="pb-space-y-2 pb-mb-4">
        {allAlerts.map((alert, index) => (
          <div 
            key={`${alert.type}-${alert.id}-${index}`} 
            className={`pb-alert-${alert.type} pb-flex pb-justify-between pb-items-center`}
          >
            <div className="pb-flex">
              <div className={`mr-2 text-${
                alert.type === 'critical' ? 'red' : 
                alert.type === 'high-sales' ? 'blue' : 'yellow'
              }-500`}>
                <i className="fas fa-circle"></i>
              </div>
              <div dangerouslySetInnerHTML={{ __html: alert.message }}></div>
            </div>
            <button
              className="pb-btn-primary pb-text-sm"
              onClick={() => handleSendNotification(
                alert.id,
                alert.title,
                alert.alertType,
                alert.fullMessage
              )}
              disabled={fetcher.state === 'submitting'}
            >
              {fetcher.state === 'submitting' && fetcher.formData?.get('productId') === alert.id 
                ? 'Sending...' 
                : 'Send Notification'
              }
            </button>
          </div>
        ))}

        {allAlerts.length === 0 && (
          <div className="text-center pb-p-4" style={{ color: '#718096' }}>
            No active product alerts.
          </div>
        )}
      </div>

      {/* Notification History */}
      <div>
        <h3 className="pb-text-sm pb-font-medium pb-mt-4 pb-mb-2">Notification History (Last 5)</h3>
        <div className="bg-gray-50 pb-p-4 rounded-md max-h-40 pb-overflow-y-auto">
          {notificationHistory.length === 0 ? (
            <p style={{ color: '#718096' }}>No notifications sent yet.</p>
          ) : (
            notificationHistory.map((entry, index) => (
              <div key={index} className="pb-mb-2" style={{ color: '#374151' }}>
                <strong>{entry.timestamp} ({entry.status}):</strong> {entry.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};