import React from 'react';
import { Grid, BlockStack } from '@shopify/polaris';
import { CustomCard } from '~/components/common/Card'; // Corrected import
import { Text } from '~/components/common/Text';     // Assuming you have a common Text or using Polaris Text directly
import { CustomBadge } from '~/components/common/Badge'; // Corrected import
import type { DashboardTrendingProduct } from '~/types'; // Assuming this type is correctly defined

interface TrendingProductsProps {
  products: Array<DashboardTrendingProduct>;
}

export const TrendingProducts: React.FC<TrendingProductsProps> = ({ products }) => {
  if (!products || products.length === 0) {
    return (
      <CustomCard>
        {/* Ensure Text component from Polaris or your common component is used correctly */}
        <Text as="p" tone="subdued" alignment="center">
          No trending products at the moment.
        </Text>
      </CustomCard>
    );
  }

  return (
    <BlockStack gap="400">
      <Text variant="headingMd" as="h2">Trending Products</Text>
      <Grid>
        {products.map(product => (
          <Grid.Cell key={product.id} columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
            <CustomCard>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">{product.title}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  SKU: {product.variants?.[0]?.sku || 'N/A'}
                </Text>
                <Text as="p" variant="bodySm">
                  Inventory Status: {product.status || 'N/A'}
                </Text>
                <Text as="p" variant="bodySm">
                  Sales Velocity: {product.salesVelocityFloat?.toFixed(2) || '0.00'} units/day
                </Text>
                {/* Using CustomBadge which should handle tones correctly */}
                {product.trending && <CustomBadge customStatus="new">Trending</CustomBadge>}
              </BlockStack>
            </CustomCard>
          </Grid.Cell>
        ))}
      </Grid>
    </BlockStack>
  );
};
