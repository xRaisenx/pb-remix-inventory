// app/components/Metrics.tsx

import { CustomCard } from '~/components/common/Card';
// Box removed, BlockStack is already imported and will be used as replacement
import { Icon, Grid, Text, BlockStack } from '@shopify/polaris';
// Import specific icons from polaris-icons with corrected names
import { ProductIcon, NotificationIcon, ChartVerticalIcon as AnalyticsIcon } from '@shopify/polaris-icons'; // Renamed ProductsIcon to ProductIcon, AnalyticsIcon to ChartVerticalIcon, AlertMinor to NotificationIcon for testing
import React from 'react';

interface MetricsProps {
  totalProducts: number;
  lowStockItemsCount: number;
  totalInventoryUnits: number;
}

export const Metrics: React.FC<MetricsProps> = ({ totalProducts, lowStockItemsCount, totalInventoryUnits }) => {
  return (
    <Grid>
      {/* Total Products Metric */}
      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <CustomCard>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">Total Products</Text>
            {/* Replaced Box with BlockStack for icon background.
                TODO: Manual review recommended for layout/appearance changes due to Box replacement. */}
            <BlockStack
              background="bg-surface-success"
              padding="100"
              borderRadius="full"
              width="32px"
              minHeight="32px"
              inlineAlign="center" // For horizontal centering of content
              blockAlign="center" // For vertical centering of content
            >
              <Icon source={ProductsIcon} tone="success" />
            </BlockStack>
            <Text as="h2" variant="headingLg">{totalProducts}</Text>
          </BlockStack>
        </CustomCard>
      </Grid.Cell>

      {/* Low Stock Items Metric */}
      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <CustomCard>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">Low Stock Items</Text>
            {/* Replaced Box with BlockStack for icon background.
                TODO: Manual review recommended for layout/appearance changes due to Box replacement. */}
            <BlockStack
              background="bg-surface-critical"
              padding="100"
              borderRadius="full"
              width="32px"
              minHeight="32px"
              inlineAlign="center"
              blockAlign="center"
            >
              <Icon source={NotificationIcon} tone="critical" />
            </BlockStack>
            <Text as="h2" variant="headingLg">{lowStockItemsCount}</Text>
          </BlockStack>
        </CustomCard>
      </Grid.Cell>

      {/* Total Inventory Units Metric */}
      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <CustomCard>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">Total Inventory Units</Text>
            {/* Replaced Box with BlockStack for icon background.
                TODO: Manual review recommended for layout/appearance changes due to Box replacement. */}
            <BlockStack
              background="bg-surface-info"
              padding="100"
              borderRadius="full"
              width="32px"
              minHeight="32px"
              inlineAlign="center"
              blockAlign="center"
            >
              <Icon source={AnalyticsIcon} tone="info" />
            </BlockStack>
            <Text as="h2" variant="headingLg">{totalInventoryUnits}</Text>
          </BlockStack>
        </CustomCard>
      </Grid.Cell>
    </Grid>
  );
};