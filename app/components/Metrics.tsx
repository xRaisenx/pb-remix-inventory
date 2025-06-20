// app/components/Metrics.tsx
import React, { useState } from "react";
import { Card, Grid, Text, Icon, BlockStack } from "@shopify/polaris";
import { CartIcon, InventoryIcon } from "@shopify/polaris-icons";

interface MetricItemProps {
  title: string;
  value: string | number;
  iconSource: import("@shopify/polaris").IconSource;
  valueTone?: 'critical' | 'success' | 'subdued'; // Only valid tones for Polaris Text
  helpText?: string;
}

const MetricDisplayCard: React.FC<MetricItemProps> = ({ title, value, iconSource, valueTone, helpText }) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  const tone: 'critical' | 'success' | 'subdued' =
    numericValue > 0 ? "success" : numericValue < 0 ? "critical" : "subdued";

  return (
    <Card>
      <BlockStack gap="200">
        <Grid>
          <Grid.Cell columnSpan={{xs: 4, sm: 4, md: 4, lg: 4, xl: 4}}>
            <BlockStack gap="100">
              <Text as="h2" variant="bodyMd" tone="subdued">{title}</Text>
              <Text as="p" variant="headingXl" tone={tone}>{value}</Text>
              {helpText && <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>}
            </BlockStack>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 2, sm: 2, md: 2, lg: 2, xl: 2}}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
              <Icon source={iconSource} tone="base" />
            </div>
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Card>
  );
};

interface MetricsGridProps {
  totalProducts: number;
  lowStockItemsCount: number;
  totalInventoryUnits: number;
  // Add more metrics as needed, e.g.:
  // estimatedStockoutDays?: number; // Average stockout days for low items
  // totalSalesVelocity?: number; // Sum of sales velocity
}

export default function MetricsGrid({
  totalProducts,
  lowStockItemsCount,
  totalInventoryUnits
}: MetricsGridProps) {
  return (
    // Responsive grid: 1 column on xs, 2 on sm, 3 on md and up.
    <Grid gap={{xs: "400", sm: "400", md: "400", lg: "400", xl: "400"}} columns={{ xs: 1, sm: 2, md: 3 }}>
      <Grid.Cell>
        <MetricDisplayCard
          title="Total Products"
          value={totalProducts}
          iconSource={CartIcon}
        />
      </Grid.Cell>
      <Grid.Cell>
        <MetricDisplayCard
          title="Low Stock Items"
          value={lowStockItemsCount}
          iconSource={CartIcon}
          valueTone={lowStockItemsCount > 0 ? "critical" : "success"}
          helpText={lowStockItemsCount > 0 ? "Items needing attention" : "All items well stocked"}
        />
      </Grid.Cell>
      <Grid.Cell>
        <MetricDisplayCard
          title="Total Inventory Units"
          value={totalInventoryUnits}
          iconSource={InventoryIcon}
        />
      </Grid.Cell>
    </Grid>
  );
}
