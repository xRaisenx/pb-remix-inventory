import React, { type ReactNode } from 'react';
import { Page, Layout, Card } from '@shopify/polaris';

interface PlanetBeautyLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
}

export function PlanetBeautyLayout({ 
  children, 
  title = "Planet Beauty Inventory AI",
  subtitle = "Intelligent inventory management for beauty retailers",
  showHeader = true 
}: PlanetBeautyLayoutProps) {
  return (
    <Page
      title={title}
      subtitle={subtitle}
      backAction={showHeader ? undefined : { content: 'Back', url: '/app' }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '24px' }}>
              {children}
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
