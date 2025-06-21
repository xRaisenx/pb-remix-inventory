// --- START OF FILE app/components/AppLayout.tsx ---
import React, { useState, useCallback } from 'react';
import { Frame, TopBar, Navigation } from '@shopify/polaris';
// Import specific icons from polaris-icons with corrected names
import {
  HomeMajorIcon,
  ProductsMajorIcon,
  SettingsMajorIcon,
  AnalyticsMajorIcon,
  NotificationMajorIcon,
} from '@shopify/polaris-icons';
import { useLocation } from '@remix-run/react'; // To determine active navigation link

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
      name="Current User" // Replace with actual user name
      detail="Shop Name" // Replace with actual shop name
      initials="CS" // Replace with actual initials
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
              <NotificationMajorIcon />
            </span>
          }
          open={isSecondaryMenuOpen}
          onOpen={toggleIsSecondaryMenuOpen}
          onClose={toggleIsSecondaryMenuOpen}
          actions={[
            {
              items: [{ content: 'Notifications (placeholder)' }],
            },
          ]}
        />
      }
    />
  );

  // Navigation items: using imported icons with corrected names
  const navigationItems = [
    {
      url: '/app',
      label: 'Dashboard',
      icon: HomeMajorIcon,
      selected: location.pathname === '/app',
    },
    {
      url: '/app/products',
      label: 'Products',
      icon: ProductsMajorIcon,
      selected: location.pathname.startsWith('/app/products'),
    },
    {
      url: '/app/reports',
      label: 'Reports',
      icon: AnalyticsMajorIcon,
      selected: location.pathname === '/app/reports',
    },
    {
      url: '/app/alerts',
      label: 'Alerts',
      icon: NotificationMajorIcon,
      selected: location.pathname === '/app/alerts',
    },
    {
      url: '/app/settings',
      label: 'Settings',
      icon: SettingsMajorIcon,
      selected: location.pathname === '/app/settings',
    },
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
// --- END OF FILE app/components/AppLayout.tsx ---
