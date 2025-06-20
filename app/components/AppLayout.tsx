import React, { useState, useCallback } from 'react';
import { Frame, TopBar, Navigation }
from '@shopify/polaris';
import { HomeMajor, OrdersMajor, ProductsMajor, SettingsMajor, AnalyticsMajor, Bell } // Example icons
from '@shopify/polaris-icons';
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

  // Attempting to apply custom background color for TopBar.
  // Polaris TopBar doesn't have a direct 'backgroundColor' prop in its theme object structure usually.
  // We might need CSS override. For now, this 'theme' prop on TopBar is illustrative.
  // A more robust way is often via CSS custom properties or direct CSS.
  const topBarTheme = {
     // This is not a standard Polaris TopBar theme prop.
     // backgroundColor: '#c94f6d', // Prototype header-bg color
  };

  // The TopBar itself. The custom background will be attempted via CSS in app.css
  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      userMenu={userMenuMarkup}
      secondaryMenu={
        <TopBar.Menu
          activatorContent={
            <Bell /> // Placeholder for notifications or other actions
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

  const navigationItems = [
    {
      url: '/app',
      label: 'Dashboard',
      icon: HomeMajor,
      selected: location.pathname === '/app',
    },
    {
      url: '/app/products',
      label: 'Products',
      icon: ProductsMajor,
      selected: location.pathname.startsWith('/app/products'),
    },
    {
      url: '/app/reports',
      label: 'Reports',
      icon: AnalyticsMajor,
      selected: location.pathname === '/app/reports',
    },
    {
      url: '/app/alerts',
      label: 'Alerts',
      icon: BellMajor, // Using Bell as a stand-in for general alerts
      selected: location.pathname === '/app/alerts',
    },
    {
      url: '/app/settings',
      label: 'Settings',
      icon: SettingsMajor,
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
