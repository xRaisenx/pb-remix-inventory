// app/components/ProductAlerts.tsx
import { Banner, BlockStack, Button, Text } from '@shopify/polaris';
import React from 'react';

// Assuming Product type similar to what's fetched in loader
interface AlertProduct {
  id: string;
  title: string;
  // For low stock
  inventory?: number; // This might need to come from summing variants if status isn't enough
  status?: string | null;
  // For high sales
  salesVelocityFloat?: number | null;
  stockoutDays?: number | null;
}

interface ProductAlertsProps {
  lowStockProducts: AlertProduct[];
  highSalesTrendProducts: AlertProduct[];
}

export const ProductAlerts: React.FC<ProductAlertsProps> = ({ lowStockProducts, highSalesTrendProducts }) => {
  const handleSendNotification = (message: string) => {
    console.log("Send Notification:", message);
  };

  return (
    <BlockStack gap="400">
      {lowStockProducts.map(product => (
        <Banner
          key={`low-${product.id}`}
          title={`${product.title} inventory ${product.status?.toLowerCase()}`}
          tone={product.status === 'Critical' ? 'critical' : 'warning'}
          action={{ content: 'Send Notification', onAction: () => handleSendNotification(`${product.title} is low in stock!`)}}
          // onDismiss={() => {}} // If dismissible
        >
          <p>Inventory reported as {product.status?.toLowerCase()}. Consider restocking.</p>
        </Banner>
      ))}
      {highSalesTrendProducts.map(product => (
        <Banner
          key={`trend-${product.id}`}
          title={`High Sales Trend: ${product.title}`}
          tone="info"
          action={{ content: 'Send Notification', onAction: () => handleSendNotification(`${product.title} has high sales velocity!`)}}
          // onDismiss={() => {}}
        >
          <p>Sales velocity: {product.salesVelocityFloat?.toFixed(2)} units/day. Estimated stockout in {product.stockoutDays?.toFixed(0)} days.</p>
        </Banner>
      ))}
      {(lowStockProducts.length === 0 && highSalesTrendProducts.length === 0) && (
        <Text as="p" color="subdued" alignment="center">No active product alerts.</Text>
      )}
    </BlockStack>
  );
};