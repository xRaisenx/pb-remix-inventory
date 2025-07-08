import { useState } from 'react';
import { useLocation, Link } from '@remix-run/react';

interface PlanetBeautyLayoutProps {
  children: React.ReactNode;
}

interface NavItemProps {
  to: string;
  label: string;
  icon: string;
  isActive: boolean;
}

const NavItem = ({ to, label, icon, isActive }: NavItemProps) => (
  <Link to={to} className={`pb-nav-item ${isActive ? 'active' : ''}`}>
    <i className={`fas ${icon} mr-3`}></i>
    {label}
  </Link>
);

const Navbar = () => (
  <nav className="pb-navbar">
    <div className="pb-flex pb-items-center">
      <i className="fas fa-warehouse mr-2"></i>
      <span className="pb-text-lg pb-font-bold">Planet Beauty Inventory AI</span>
    </div>
    <div className="pb-flex pb-items-center pb-space-x-4">
      <span className="pb-text-sm">User: Admin</span>
      <button className="pb-btn-primary">
        <i className="fas fa-sign-out-alt mr-1"></i> Logout
      </button>
    </div>
  </nav>
);

const Sidebar = ({ activeSection }: { activeSection: string }) => {
  const navigationItems = [
    { to: '/app', label: 'Overview', icon: 'fa-home' },
    { to: '/app/products', label: 'Products', icon: 'fa-cube' },
    { to: '/app/alerts', label: 'Alerts', icon: 'fa-exclamation-triangle' },
    { to: '/app/reports', label: 'Reports', icon: 'fa-chart-line' },
    { to: '/app/settings', label: 'Settings', icon: 'fa-cog' },
  ];

  return (
    <div className="pb-sidebar">
      <h2 className="pb-text-lg pb-font-medium pb-mb-4" style={{ color: '#718096' }}>Dashboard</h2>
      <nav className="pb-mb-6">
        {navigationItems.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            isActive={activeSection === item.label || (item.to === '/app' && activeSection === 'Overview')}
          />
        ))}
      </nav>
      <h2 className="pb-text-lg pb-font-medium pb-mb-4" style={{ color: '#718096' }}>Quick Actions</h2>
      <Link to="/app/reports" className="pb-btn-primary pb-w-full pb-mb-4 pb-flex pb-items-center pb-justify-center">
        <span>Generate Report</span>
      </Link>
      <Link to="/app/alerts" className="pb-btn-secondary pb-w-full pb-flex pb-items-center pb-justify-center">
        <span>View All Alerts</span>
      </Link>
    </div>
  );
};

export const PlanetBeautyLayout = ({ children }: PlanetBeautyLayoutProps) => {
  const location = useLocation();
  
  // Determine active section from pathname
  const getActiveSection = (pathname: string): string => {
    if (pathname === '/app') return 'Overview';
    if (pathname.startsWith('/app/products')) return 'Products';
    if (pathname.startsWith('/app/alerts')) return 'Alerts';
    if (pathname.startsWith('/app/reports')) return 'Reports';
    if (pathname.startsWith('/app/settings')) return 'Settings';
    return 'Overview';
  };

  const activeSection = getActiveSection(location.pathname);

  return (
    <div className="pb-min-h-screen">
      <Navbar />
      <header className="pb-header-bg">
        <div className="pb-container">
          <h1 className="pb-text-3xl pb-font-bold pb-mb-1">Planet Beauty Inventory AI</h1>
          <p className="pb-text-sm opacity-75">AI-powered Inventory Monitoring for Planet Beauty</p>
        </div>
      </header>
      <div className="pb-container pb-p-6">
        <div className="pb-grid pb-grid-cols-1 pb-grid-md-cols-4 pb-gap-6">
          <div className="md:col-span-1">
            <Sidebar activeSection={activeSection} />
          </div>
          <div className="md:col-span-3">
            {children}
          </div>
        </div>
      </div>
      <footer className="pb-footer">
        <div className="pb-mb-1">Developed with ❤️ by Jose</div>
        <div className="pb-text-sm opacity-75">© 2025 Planet Beauty Inventory AI. All rights reserved.</div>
      </footer>
    </div>
  );
};

export default PlanetBeautyLayout;