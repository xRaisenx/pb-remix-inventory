import React from 'react';
import { Grid, BlockStack } from '@shopify/polaris';
import { Card } from '~/components/common/Card';
import { Text } from '~/components/common/Text';
import { Badge } from '~/components/common/Badge';

// Define the expected structure for a product, especially the variants part for SKU and price.
// This should align with what the loader in app._index.tsx provides.
interface ProductVariant {
  sku: string | null;
  price: string; // Assuming price is a string, adjust if it's a number
}

interface ProductForTrending {
  id: string;
  title: string;
  vendor: string;
  shopifyId: string; // Not directly used in display but good for keying or future links
  salesVelocityFloat: number | null;
  status: string | null; // Used for "Inventory Status"
  trending: boolean | null;
  variants: Array<ProductVariant> | null; // Array of variants
}

interface TrendingProductsProps {
  products: Array<ProductForTrending>;
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
