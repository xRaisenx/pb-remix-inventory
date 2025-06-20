// app/components/ProductAlerts.tsx
import { Banner, BlockStack, Button, Text } from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';
import React, { useEffect } from 'react';
import type { DashboardAlertProduct } from '~/types'; // Import the centralized type
// [FIX] useToast is not available in your version of Polaris. All toast logic is commented out for now.
// import polaris from '@shopify/polaris';
// const { useToast } = polaris as typeof import('@shopify/polaris');


interface ProductAlertsProps {
  lowStockProducts: DashboardAlertProduct[];
  highSalesTrendProducts: DashboardAlertProduct[];
}

export const ProductAlerts: React.FC<ProductAlertsProps> = ({ lowStockProducts, highSalesTrendProducts }) => {
  const fetcher = useFetcher();
  // const { show: showToast } = useToast(); // Commented out as per original code

  const handleSendNotification = (
    productId: string,
    productTitle: string,
    alertType: 'low_stock' | 'high_trend',
    message: string
  ) => {
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

  // All showToast usages are commented out below. Replace with a supported notification system if needed.
  // useEffect(() => {
  //   if (fetcher.data) {
  //     const data = fetcher.data as { success?: boolean; message?: string; error?: string };
  //     if (data.success && data.message) {
  //       showToast(data.message, { tone: 'success' });
  //     } else if (data.error) {
  //       showToast(data.error, { tone: 'critical' });
  //     }
  //   }
  // }, [fetcher.data, showToast]);

  return (
    <BlockStack gap="400">
      {lowStockProducts.map(product => (
        <Banner
          key={`low-${product.id}`}
          title={`${product.title} inventory ${product.status?.toLowerCase()}`}
          tone={product.status === 'Critical' ? 'critical' : 'warning'}
          action={{
            content: 'Send Notification',
            onAction: () => handleSendNotification(
              product.id,
              product.title,
              'low_stock',
              `${product.title} is ${product.status?.toLowerCase()} in stock. Current inventory: ${'inventory' in product ? (product as any).inventory : 'N/A'}. Consider restocking.`
            ),
            loading: fetcher.state === 'submitting' && fetcher.formData?.get('productId') === product.id,
          }}
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
          action={{
            content: 'Send Notification',
            onAction: () => handleSendNotification(
              product.id,
              product.title,
              'high_trend',
              `${product.title} has high sales velocity (${product.salesVelocityFloat?.toFixed(2)} units/day). Estimated stockout in ${product.stockoutDays?.toFixed(0)} days.`
            ),
            loading: fetcher.state === 'submitting' && fetcher.formData?.get('productId') === product.id,
          }}
          // onDismiss={() => {}}
        >
          <p>Sales velocity: {product.salesVelocityFloat?.toFixed(2)} units/day. Estimated stockout in ${product.stockoutDays?.toFixed(0)} days.</p>
        </Banner>
      ))}
      {(lowStockProducts.length === 0 && highSalesTrendProducts.length === 0) && (
        <Text as="p" tone="subdued" alignment="center">No active product alerts.</Text>
      )}
    </BlockStack>
  );
};