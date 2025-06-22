// app/components/Metrics.tsx

import { CustomCard } from '~/components/common/Card';
import { Icon, Grid, Box, Text, BlockStack } from '@shopify/polaris';
// Import specific icons from polaris-icons with corrected names
import { ProductIcon, AlertTriangleIcon, ChartVerticalIcon } from '@shopify/polaris-icons'; // Corrected Icons
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
            <Box
              background="bg-surface-success"
              padding="100"
              borderRadius="full"
              width="32px"
              minHeight="32px" // Changed from height to minHeight
            >
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                <Icon source={ProductIcon} tone="success" />
              </div>
            </Box>
            <Text as="h2" variant="headingLg">{totalProducts}</Text>
          </BlockStack>
        </CustomCard>
      </Grid.Cell>

      {/* Low Stock Items Metric */}
      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <CustomCard>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">Low Stock Items</Text>
            <Box
              background="bg-surface-critical"
              padding="100"
              borderRadius="full"
              width="32px"
              minHeight="32px" // Changed from height to minHeight
            >
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                <Icon source={AlertTriangleIcon} tone="critical" />
              </div>
            </Box>
            <Text as="h2" variant="headingLg">{lowStockItemsCount}</Text>
          </BlockStack>
        </CustomCard>
      </Grid.Cell>

      {/* Total Inventory Units Metric */}
      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <CustomCard>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">Total Inventory Units</Text>
            <Box
              background="bg-surface-info"
              padding="100"
              borderRadius="full"
              width="32px"
              minHeight="32px" // Changed from height to minHeight
            >
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                <Icon source={ChartVerticalIcon} tone="info" />
              </div>
            </Box>
            <Text as="h2" variant="headingLg">{totalInventoryUnits}</Text>
          </BlockStack>
        </CustomCard>
      </Grid.Cell>
    </Grid>
  );
};