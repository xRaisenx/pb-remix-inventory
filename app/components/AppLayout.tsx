// app/components/AppLayout.tsx
import React, { useState, useCallback } from 'react';
import { Frame, TopBar, Navigation, Icon } from '@shopify/polaris'; // Added Icon
import {
  HomeIcon,
  ProductIcon, // Corrected from ProductsIcon
  SettingsIcon,
  ChartVerticalIcon, // Corrected from AnalyticsIcon
  NotificationIcon,
} from '@shopify/polaris-icons';
import { useLocation } from '@remix-run/react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);

  const toggleIsUserMenuOpen = useCallback(
    () => setIsUserMenuOpen((isUserMenuOpen) => !isUserMenuOpen),
    [],
  );

  const toggleIsSecondaryMenuOpen = useCallback(
    () => setIsSecondaryMenuOpen((isSecondaryMenuOpen) => !isSecondaryMenuOpen),
    [],
  );

  const userMenuMarkup = (
    <TopBar.UserMenu
      actions={[
        {
          items: [{ content: 'Community forums' }],
        },
      ]}
      name="Current User"
      detail="Shop Name"
      initials="CS"
      open={isUserMenuOpen}
      onToggle={toggleIsUserMenuOpen}
    />
  );

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      userMenu={userMenuMarkup}
      secondaryMenu={
        <TopBar.Menu
          activatorContent={
            <span>
              <Icon source={NotificationIcon} />
            </span>
          }
          open={isSecondaryMenuOpen}
          onOpen={toggleIsSecondaryMenuOpen}
          onClose={toggleIsSecondaryMenuOpen}
          actions={[
            {
              items: [
                { content: 'Notifications (placeholder)' },
                ...(process.env.NODE_ENV !== 'production'
                  ? [
                      {
                        content: 'Toggle Embedded (dev)',
                        onAction: () => {
                          const url = new URL(window.location.href);
                          const current = url.searchParams.get('embedded');
                          const next = current === '1' || current === 'true' ? '0' : '1';
                          url.searchParams.set('embedded', next);
                          window.location.href = url.toString();
                        },
                      },
                    ]
                  : []),
              ],
            },
          ]}
        />
      }
    />
  );

  const navigationItems = [
    { url: '/app', label: 'Dashboard', icon: HomeIcon, selected: location.pathname === '/app', },
    { url: '/app/products', label: 'Products', icon: ProductIcon, selected: location.pathname.startsWith('/app/products'), }, // Corrected from ProductsIcon
    { url: '/app/reports', label: 'Reports', icon: ChartVerticalIcon, selected: location.pathname === '/app/reports', }, // Corrected from AnalyticsIcon
    { url: '/app/alerts', label: 'Alerts', icon: NotificationIcon, selected: location.pathname === '/app/alerts', },
    { url: '/app/settings', label: 'Settings', icon: SettingsIcon, selected: location.pathname === '/app/settings', },
  ];

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={navigationItems}
      />
    </Navigation>
  );

  const logo = {
    width: 124,
    accessibilityLabel: 'Planet Beauty',
    url: '/app',
  };

  return (
    <Frame
      topBar={topBarMarkup}
      navigation={navigationMarkup}
      logo={logo}
    >
      {children}
    </Frame>
  );
};

export default AppLayout;
