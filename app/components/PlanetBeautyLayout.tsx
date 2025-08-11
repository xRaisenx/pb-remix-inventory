import React, { type ReactNode } from 'react';
import { Text, ButtonGroup, Button, Card } from '@shopify/polaris';

interface PlanetBeautyLayoutProps {
  children: ReactNode;
}

export function PlanetBeautyLayout({ children }: PlanetBeautyLayoutProps) {
  return (
    <div className="pb-gradient-page pb-embedded-bg" style={{ minHeight: '100vh' }}>
      <div className="pb-hero">
        <Text as="h1" variant="heading2xl">
          <span className="pb-gradient-text">Planet Beauty Inventory AI</span>
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          Intelligent inventory management for beauty retailers
        </Text>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
        <ButtonGroup>
          <Button>Dashboard</Button>
          <Button>Products</Button>
          <Button>Inventory</Button>
          <Button>Analytics</Button>
          <Button>Alerts</Button>
          <Button>Settings</Button>
        </ButtonGroup>
      </div>

      <div className="pb-index-container">
        <Card>
          <div className="pb-glass pb-card-hover" style={{ padding: 20 }}>
            {children}
          </div>
        </Card>
      </div>
    </div>
  );
}
