import { Card } from '~/components/common/Card';
import { Text } from '~/components/common/Text';
import { Icon, Grid, Box } from '@shopify/polaris';
import { ProductsMajor, AlertMinor, AnalyticsMajor } from '@shopify/polaris-icons'; // Example icons
import React from 'react';

interface MetricsProps {
  totalProducts: number;
  lowStockItemsCount: number;
  totalInventoryUnits: number;
}

export const Metrics: React.FC<MetricsProps> = ({ totalProducts, lowStockItemsCount, totalInventoryUnits }) => {
  return (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <Card sectioned>
          <Box paddingBlockEnd="200">
            <Grid>
              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 8, xl: 8 }}>
                <Text as="p" variant="bodySm" color="subdued">Total Products</Text>
                <Text as="h2" variant="headingLg">{totalProducts}</Text>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 2, sm: 2, md: 2, lg: 4, xl: 4 }}>
                <Box
                  background="bg-surface-magic-subdued" // Approx #fff1f2
                  padding="100" // Approx 4px, Polaris token might be different
                  borderRadius="full"
                  width="32px"
                  height="32px"
                  UNSTABLE_style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon source={ProductsMajor} />
                </Box>
              </Grid.Cell>
            </Grid>
          </Box>
        </Card>
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <Card sectioned>
          <Box paddingBlockEnd="200">
            <Grid>
              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 8, xl: 8 }}>
                <Text as="p" variant="bodySm" color="subdued">Low Stock Items</Text>
                <Text as="h2" variant="headingLg">{lowStockItemsCount}</Text>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 2, sm: 2, md: 2, lg: 4, xl: 4 }}>
                <Box
                  background="bg-surface-critical-subdued" // Approx #fff5f5
                  padding="100"
                  borderRadius="full"
                  width="32px"
                  height="32px"
                  UNSTABLE_style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon source={AlertMinor} color="critical" />
                </Box>
              </Grid.Cell>
            </Grid>
          </Box>
        </Card>
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
        <Card sectioned>
          <Box paddingBlockEnd="200">
            <Grid>
              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 8, xl: 8 }}>
                <Text as="p" variant="bodySm" color="subdued">Total Inventory Units</Text>
                <Text as="h2" variant="headingLg">{totalInventoryUnits}</Text>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 2, sm: 2, md: 2, lg: 4, xl: 4 }}>
                <Box
                  background="bg-surface-success-subdued" // Approx #e6fffa
                  padding="100"
                  borderRadius="full"
                  width="32px"
                  height="32px"
                  UNSTABLE_style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon source={AnalyticsMajor} color="success" />
                </Box>
              </Grid.Cell>
            </Grid>
          </Box>
        </Card>
      </Grid.Cell>
    </Grid>
  );
};