// --- START OF FILE app/components/AppLayout.tsx ---
import React, { useState, useCallback } from 'react';
import { Frame, TopBar, Navigation } from '@shopify/polaris';
// Import specific icons from polaris-icons
import { HomeMajor, ProductsMajor, SettingsMajor, AnalyticsMajor, BellMajor } from '@shopify/polaris-icons';
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
            <BellMajor /> // Using imported BellMajor icon
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

  // Navigation items: using imported icons
  const navigationItems = [
    {
      url: '/app',
      label: 'Dashboard',
      icon: HomeMajor, // Using imported HomeMajor icon
      selected: location.pathname === '/app',
    },
    {
      url: '/app/products',
      label: 'Products',
      icon: ProductsMajor, // Using imported ProductsMajor icon
      selected: location.pathname.startsWith('/app/products'),
    },
    {
      url: '/app/reports',
      label: 'Reports',
      icon: AnalyticsMajor, // Using imported AnalyticsMajor icon
      selected: location.pathname === '/app/reports',
    },
    {
      url: '/app/alerts',
      label: 'Alerts',
      icon: BellMajor, // Using imported BellMajor icon
      selected: location.pathname === '/app/alerts',
    },
    {
      url: '/app/settings',
      label: 'Settings',
      icon: SettingsMajor, // Using imported SettingsMajor icon
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

  // Logo for the Frame component, aligning with AppTheme in root.tsx
  const logo = {
    width: 124,
    accessibilityLabel: 'Planet Beauty',
    // topBarSource: '/path/to/your/logo-on-dark-bg.svg', // if needed for dark topbar
    url: '/app', // Link for the logo
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

export default AppLayout; // Ensure default export if this is the main layout file used by Remix
// --- END OF FILE app/components/AppLayout.tsx ---
