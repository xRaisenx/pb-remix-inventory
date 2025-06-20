import React from 'react';
import { Grid, BlockStack } from '@shopify/polaris';
import { Card } from '~/components/common/Card';
import { Text } from '~/components/common/Text';
import { Badge } from '~/components/common/Badge';
// Import the centralized types
import type { DashboardTrendingProduct, DashboardProductVariant } from '~/types';

// interface ProductVariant { // Remove local definition
//   sku: string | null;
//   price: string;
// }

// interface ProductForTrending { // Remove local definition
//   id: string;
//   title: string;
//   vendor: string;
//   shopifyId: string;
//   salesVelocityFloat: number | null;
//   status: string | null;
//   trending: boolean | null;
//   variants: Array<DashboardProductVariant> | null; // Ensure this uses the imported type if it was named differently
// }

interface TrendingProductsProps {
  products: Array<DashboardTrendingProduct>; // Use the imported type
}

export const TrendingProducts: React.FC<TrendingProductsProps> = ({ products }) => {
  if (!products || products.length === 0) {
    return (
      <Card sectioned>
        <Text as="p" color="subdued" alignment="center">
          No trending products at the moment.
        </Text>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Text variant="headingMd" as="h2">Trending Products</Text>
      <Grid> {/* Removed explicit columns, let Grid auto-flow or adjust columnSpan in Grid.Cell */}
        {products.map(product => (
          <Grid.Cell key={product.id} columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
            <Card title={product.title} sectioned> {/* Ensure Card handles title prop */}
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" color="subdued">
                  SKU: {product.variants?.[0]?.sku || 'N/A'}
                </Text>
                <Text as="p" variant="bodySm">
                  Inventory Status: {product.status || 'N/A'}
                </Text>
                <Text as="p" variant="bodySm">
                  Sales Velocity: {product.salesVelocityFloat?.toFixed(2) || '0.00'} units/day
                </Text>
                {product.trending && <Badge customStatus="default">Trending</Badge>}
              </BlockStack>
            </Card>
          </Grid.Cell>
        ))}
      </Grid>
    </BlockStack>
  );
};
