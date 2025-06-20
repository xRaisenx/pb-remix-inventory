// app/components/ProductAlerts.tsx
import React from 'react';
import {
  Card,
  Banner,
  Button,
  Text,
  BlockStack, // Using BlockStack for better layout control
  Bleed // For full-width banners if needed within Card padding
} from '@shopify/polaris';
import { AlertDiamondIcon, InfoIcon, CheckCircleIcon } from '@shopify/polaris-icons'; // Fix: Update icon imports to new names

// Alert structure specific to this component's original design
interface ProductSpecificAlert {
  type: 'critical' | 'warning' | 'high-sales' | 'info' | 'success'; // Added more types
  message: string;
  productId: string; // Assuming this helps identify the product context if needed
}

// Notification history entry structure
interface NotificationHistoryEntry {
  message: string;
  timestamp: string;
  status: 'Sent' | 'Failed';
}

interface ProductAlertsProps {
  alerts: ProductSpecificAlert[];
  sendNotification?: (alert: ProductSpecificAlert) => void; // Make optional if sometimes just for display
  notificationHistory?: NotificationHistoryEntry[]; // Make optional
  title?: string; // Optional title for the alerts section
}

const ProductAlerts: React.FC<ProductAlertsProps> = ({
  alerts,
  sendNotification,
  notificationHistory,
  title = "Product Alerts" // Default title
}) => {
  const renderAlertIcon = (type: ProductSpecificAlert['type']) => {
    switch (type) {
      case 'critical':
        return AlertDiamondIcon;
      case 'warning':
        return AlertDiamondIcon; // Consider a different warning icon if available
      case 'high-sales':
        return InfoIcon; // Using InfoIcon for high-sales
      case 'info':
        return InfoIcon;
      case 'success':
        return CheckCircleIcon;
      default:
        return AlertDiamondIcon;
    }
  };

  const getToneForAlertType = (type: ProductSpecificAlert['type']): ('critical' | 'warning' | 'info' | 'success') => {
    if (type === 'high-sales') return 'info'; // Map 'high-sales' to 'info' tone
    return type; // 'critical', 'warning', 'info', 'success' map directly
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">{title}</Text>
        {alerts.length === 0 ? (
          <Text as="p" tone="subdued">No current alerts for this product/section.</Text>
        ) : (
          alerts.map((alert, index) => (
            // Using Bleed to make Banner take full width if Card has padding
            <Bleed marginInline="400" key={index}>
              <Banner
                title={alert.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} // Format title
                tone={getToneForAlertType(alert.type)}
                icon={renderAlertIcon(alert.type)}
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">{alert.message}</Text>
                  {sendNotification && (
                    <Button onClick={() => sendNotification(alert)} size="slim" variant="primary">
                      Send Notification
                    </Button>
                  )}
                </BlockStack>
              </Banner>
            </Bleed>
          ))
        )}

        {notificationHistory && notificationHistory.length > 0 && (
          <>
            <Text variant="headingMd" as="h2" >Notification History</Text>
            <BlockStack gap="100">
              {notificationHistory.slice(0, 5).map((entry, index) => ( // Show last 5
                <Text as="p" variant="bodySm" key={index} tone={entry.status === 'Failed' ? 'critical' : 'subdued'}>
                  <Text as="span" fontWeight="semibold">
                    {entry.timestamp} ({entry.status}):
                  </Text>{' '}
                  {entry.message}
                </Text>
              ))}
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
};

export default ProductAlerts;