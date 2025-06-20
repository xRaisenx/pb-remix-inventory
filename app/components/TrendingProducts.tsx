// app/components/TrendingProducts.tsx
import React from "react";
import { Card, Grid, Text, Badge, BlockStack } from "@shopify/polaris";
import type { Product } from "~/types"; // Assuming Product type includes 'trending', 'salesVelocity', 'variants' with sku/inventory.

interface TrendingProductsProps {
  products: Product[];
  title?: string;
}

export default function TrendingProducts({ products, title = "Trending Products" }: TrendingProductsProps) {
  const trendingProducts = products.filter(p => p.trending);

  if (trendingProducts.length === 0) {
    return (
      <Card>
        <BlockStack gap="200"> {/* Removed inlineAlign and align, simpler for just text */}
          <div style={{padding: 'var(--p-space-400)', textAlign: 'center'}}> {/* Added padding and centering for the message */}
            <Text as="p" tone="subdued">No trending products at the moment.</Text>
          </div>
        </BlockStack>
      </Card>
    );
  }

  // Determine number of columns based on products, up to 3
  const columns = Math.min(trendingProducts.length, 3) as (1|2|3);


  return (
    <BlockStack gap="400">
      <Text variant="headingMd" as="h2">{title}</Text>
      <Grid columns={{ xs: 1, sm: 2, md: columns, lg: columns, xl: columns }}> {/* Ensured columns prop is valid for all breakpoints */}
        {trendingProducts.map((product) => {
          const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
          const sku = firstVariant?.sku ?? "N/A";
          const totalInventory = product.variants?.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0) ?? 0;
          // Assuming product image URL might be available on product.imageUrl or firstVariant.imageUrl
          // For now, a placeholder or no image. If using an image:
          // const imageUrl = product.imageUrl || firstVariant?.imageUrl; // Example

          return (
            <Grid.Cell key={product.id}>
              <Card> {/* Default Card padding will apply */}
                <BlockStack gap="200">
                  {/* {imageUrl && <Thumbnail source={imageUrl} alt={product.title} size="large" />} */}
                  <Text variant="headingMd" as="h3" truncate>{product.title}</Text> {/* Changed to headingMd and added truncate */}
                  <Badge tone="success">Trending</Badge>
                  <Text as="p" variant="bodyMd" tone="subdued">SKU: {sku}</Text> {/* Changed to bodyMd for consistency */}
                  <Text as="p" variant="bodyMd" tone="subdued">Inventory: {totalInventory}</Text> {/* Changed to bodyMd */}
                  {product.salesVelocity !== undefined && ( // Check if salesVelocity is available
                     <Text as="p" variant="bodyMd" tone="subdued">Sales Velocity: {product.salesVelocity.toFixed(2)} units/day</Text>
                  )}
                </BlockStack>
              </Card>
            </Grid.Cell>
          );
        })}
      </Grid>
    </BlockStack>
  );
}
