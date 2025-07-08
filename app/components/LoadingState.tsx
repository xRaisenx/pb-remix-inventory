interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  type?: 'spinner' | 'skeleton' | 'pulse';
  overlay?: boolean;
}

export const LoadingState = ({ 
  message = "Loading your Planet Beauty data...", 
  size = 'medium',
  type = 'spinner',
  overlay = false 
}: LoadingStateProps) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8', 
    large: 'w-12 h-12'
  };

  const SpinnerComponent = () => (
    <div className="pb-flex pb-flex-col pb-items-center pb-justify-center pb-space-y-4">
      <div 
        className={`${sizeClasses[size]} pb-border-4 pb-border-pink-200 pb-border-t-pink-600 pb-rounded-full animate-spin`}
        style={{ borderTopColor: '#d81b60' }}
      ></div>
      {message && (
        <p className="pb-text-sm pb-text-center" style={{ color: '#6b7280' }}>
          {message}
        </p>
      )}
    </div>
  );

  const SkeletonComponent = () => (
    <div className="pb-space-y-4">
      <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-3/4 animate-pulse"></div>
      <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-1/2 animate-pulse"></div>
      <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-2/3 animate-pulse"></div>
    </div>
  );

  const PulseComponent = () => (
    <div className="pb-flex pb-items-center pb-space-x-2">
      <div className="w-2 h-2 bg-pink-600 rounded-full animate-pulse"></div>
      <div className="w-2 h-2 bg-pink-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
      <div className="w-2 h-2 bg-pink-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
      {message && (
        <span className="pb-ml-2 pb-text-sm" style={{ color: '#6b7280' }}>
          {message}
        </span>
      )}
    </div>
  );

  const renderContent = () => {
    switch (type) {
      case 'skeleton':
        return <SkeletonComponent />;
      case 'pulse':
        return <PulseComponent />;
      default:
        return <SpinnerComponent />;
    }
  };

  if (overlay) {
    return (
      <div className="pb-fixed pb-inset-0 pb-bg-black pb-bg-opacity-50 pb-flex pb-items-center pb-justify-center pb-z-50">
        <div className="pb-bg-white pb-rounded-lg pb-p-6 pb-shadow-lg">
          {renderContent()}
        </div>
      </div>
    );
  }

  return renderContent();
};

// Specific loading states for different areas
export const InventoryLoadingState = () => (
  <LoadingState 
    message="Loading your inventory data..." 
    size="medium"
    type="spinner"
  />
);

export const ProductsLoadingState = () => (
  <LoadingState 
    message="Fetching your products from Shopify..." 
    size="medium"
    type="spinner"
  />
);

export const AlertsLoadingState = () => (
  <LoadingState 
    message="Checking for critical alerts..." 
    size="medium"
    type="pulse"
  />
);

export const ReportsLoadingState = () => (
  <LoadingState 
    message="Generating your analytics report..." 
    size="medium"
    type="spinner"
  />
);

// Table loading skeleton
export const TableLoadingState = ({ rows = 5 }: { rows?: number }) => (
  <div className="pb-space-y-3">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="pb-flex pb-space-x-4 pb-items-center">
        <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-8 animate-pulse"></div>
        <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-1/4 animate-pulse"></div>
        <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-1/6 animate-pulse"></div>
        <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-1/8 animate-pulse"></div>
        <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-1/12 animate-pulse"></div>
      </div>
    ))}
  </div>
);

// Metrics card loading skeleton
export const MetricsLoadingState = () => (
  <div className="pb-grid pb-grid-cols-1 md:pb-grid-cols-4 pb-gap-6 pb-mb-6">
    {Array.from({ length: 4 }).map((_, index) => (
      <div key={index} className="pb-card">
        <div className="pb-space-y-3">
          <div className="pb-h-4 pb-bg-gray-200 pb-rounded pb-w-3/4 animate-pulse"></div>
          <div className="pb-h-8 pb-bg-gray-200 pb-rounded pb-w-1/2 animate-pulse"></div>
          <div className="pb-h-3 pb-bg-gray-200 pb-rounded pb-w-full animate-pulse"></div>
        </div>
      </div>
    ))}
  </div>
);

export default LoadingState;