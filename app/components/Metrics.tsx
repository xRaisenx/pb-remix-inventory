// app/components/Metrics.tsx
import React from "react";
import {
  Card,
  Grid,
  Text,
  Icon,
  BlockStack,
  InlineStack,
  type IconSource,
} from "@shopify/polaris";
import { CartIcon, InventoryIcon, AlertCircleIcon } from "@shopify/polaris-icons";

// A reusable card for displaying a single metric.
interface MetricDisplayCardProps {
  title: string;
  value: string | number;
  iconSource: IconSource;
  // FIX 1: Removed 'warning' as it's not a valid tone for the Text component.
  valueTone?: 'critical' | 'success' | 'subdued';
  helpText?: string;
}

const MetricDisplayCard: React.FC<MetricDisplayCardProps> = ({
  title,
  value,
  iconSource,
  valueTone,
  helpText,
}) => {
  const calculatedTone = () => {
    const numericValue = Number(value);
    if (isNaN(numericValue)) return 'subdued';
    return numericValue > 0 ? 'success' : 'subdued';
  };

  const displayTone = valueTone ?? calculatedTone();

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="start" blockAlign="start" gap="400" wrap={false}>
          <BlockStack gap="100" inlineAlign="start">
            <Text as="h2" variant="bodyMd" tone="subdued">
              {title}
            </Text>
            <Text as="p" variant="headingXl" tone={displayTone}>
              {value}
            </Text>
          </BlockStack>
          <div style={{ marginLeft: 'auto' }}>
            <Icon source={iconSource} tone="base" />
          </div>
        </InlineStack>
        {helpText && (
          <Text as="p" variant="bodySm" tone="subdued">
            {helpText}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
};

// The main grid component that lays out all the metrics.
interface MetricsGridProps {
  totalProducts: number;
  lowStockItemsCount: number;
  totalInventoryUnits: number;
}

export default function MetricsGrid({
  totalProducts,
  lowStockItemsCount,
  totalInventoryUnits,
}: MetricsGridProps) {
  const hasLowStock = lowStockItemsCount > 0;
  const lowStockTone = hasLowStock ? 'critical' : 'success';
  const lowStockHelpText = hasLowStock
    ? "Items needing attention"
    : "All items are well stocked";

  return (
    // FIX 2: The 'gap' prop must be an object for responsive values.
    <Grid gap={{ xs: "400", sm: "400", md: "400" }} columns={{ xs: 1, sm: 2, md: 3 }}>
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
          iconSource={AlertCircleIcon}
          valueTone={lowStockTone}
          helpText={lowStockHelpText}
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