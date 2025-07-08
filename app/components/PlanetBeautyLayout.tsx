import React, { type ReactNode } from 'react';
import { Text, ButtonGroup, Button } from '@shopify/polaris';

interface PlanetBeautyLayoutProps {
  children: ReactNode;
}

export function PlanetBeautyLayout({ children }: PlanetBeautyLayoutProps) {
  return (
    <div style={{
      padding: '20px',
      background: 'linear-gradient(135deg, #ffeef7 0%, #fff5f8 100%)',
      minHeight: '100vh'
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '30px',
        padding: '20px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(216, 27, 96, 0.1)'
      }}>
        <Text variant="headingXl" as="h1">
          Planet Beauty Inventory AI
        </Text>
        <Text variant="bodyMd" as="p" tone="subdued">
          Intelligent inventory management for beauty retailers
        </Text>
      </div>
      
      <div style={{
        marginBottom: '30px',
        display: 'flex',
        justifyContent: 'center'
      }}>
        <ButtonGroup>
          <Button>Dashboard</Button>
          <Button>Products</Button>
          <Button>Inventory</Button>
          <Button>Analytics</Button>
          <Button>Alerts</Button>
          <Button>Settings</Button>
        </ButtonGroup>
      </div>
      
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(216, 27, 96, 0.1)'
      }}>
        {children}
      </div>
    </div>
  );
}
