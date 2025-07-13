// app/components/Metrics.tsx

import React from 'react';
import { Card, Text, Grid, Icon } from '@shopify/polaris';
import { 
  ProductIcon, 
  AlertTriangleIcon, 
  ChartVerticalIcon 
} from '@shopify/polaris-icons';

interface MetricsProps {
  totalProducts: number;
  lowStockItemsCount: number;
  totalInventoryUnits: number;
}

export const Metrics: React.FC<MetricsProps> = ({ 
  totalProducts, 
  lowStockItemsCount, 
  totalInventoryUnits 
}) => {
  return (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text variant="bodySm" tone="subdued" as="p">Total Products</Text>
                <Text variant="heading2xl" as="h2">{totalProducts.toLocaleString()}</Text>
              </div>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: '#fef3f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon source={ProductIcon} tone="base" />
              </div>
            </div>
          </div>
        </Card>
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text variant="bodySm" tone="subdued" as="p">Low Stock Items</Text>
                <Text variant="heading2xl" as="h2" tone={lowStockItemsCount > 0 ? "critical" : "success"}>
                  {lowStockItemsCount.toLocaleString()}
                </Text>
              </div>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: lowStockItemsCount > 0 ? '#fef3f2' : '#f0f9ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon source={AlertTriangleIcon} tone={lowStockItemsCount > 0 ? "critical" : "base"} />
              </div>
            </div>
          </div>
        </Card>
      </Grid.Cell>

      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text variant="bodySm" tone="subdued" as="p">Total Inventory</Text>
                <Text variant="heading2xl" as="h2">{totalInventoryUnits.toLocaleString()}</Text>
              </div>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: '#f0f9ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon source={ChartVerticalIcon} tone="base" />
              </div>
            </div>
          </div>
        </Card>
      </Grid.Cell>
    </Grid>
  );
};