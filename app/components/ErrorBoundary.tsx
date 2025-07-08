import { isRouteErrorResponse, useRouteError, Link } from "@remix-run/react";

interface ErrorDisplayProps {
  error: unknown;
  errorId: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, errorId }) => {
  const getErrorMessage = (error: unknown): { title: string; message: string; suggestion: string; isDatabaseError: boolean } => {
    let errorMessage = "An unexpected error occurred";
    let isDatabaseError = false;
    
    if (isRouteErrorResponse(error)) {
      errorMessage = error.data?.message || error.statusText;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check if it's a database-related error
      isDatabaseError = 
        error.message.includes('session') ||
        error.message.includes('database') ||
        error.message.includes('connection') ||
        error.message.includes('Prisma') ||
        error.message.includes('pool');
    }
    
    if (isDatabaseError) {
      return {
        title: 'Database Connection Issue',
        message: 'We\'re having trouble connecting to your inventory database. This is usually temporary.',
        suggestion: 'Please wait a moment and try refreshing the page. If the issue persists, run: npm run db:init',
        isDatabaseError: true
      };
    }
    
    // Network/API errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
      return {
        title: 'Network Connection Problem',
        message: 'Unable to connect to Planet Beauty services. Please check your internet connection.',
        suggestion: 'Try refreshing the page or check your network connection. The issue should resolve automatically.',
        isDatabaseError: false
      };
    }
    
    // Authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') || errorMessage.includes('session')) {
      return {
        title: 'Session Expired',
        message: 'Your session has expired for security reasons.',
        suggestion: 'Please refresh the page to log back in. Your data is safe and will be available once you\'re reconnected.',
        isDatabaseError: false
      };
    }
    
    // Shopify API errors
    if (errorMessage.includes('shopify') || errorMessage.includes('graphql')) {
      return {
        title: 'Shopify Connection Issue',
        message: 'We\'re having trouble connecting to your Shopify store data.',
        suggestion: 'This is usually temporary. Please try again in a few moments, or check your Shopify app permissions.',
        isDatabaseError: false
      };
    }
    
    // Generic fallback
    return {
      title: 'Something Went Wrong',
      message: 'We encountered an unexpected issue with your Planet Beauty inventory system.',
      suggestion: 'Please try refreshing the page. If the problem continues, our support team can help resolve this quickly.',
      isDatabaseError: false
    };
  };

  const { title, message, suggestion, isDatabaseError } = getErrorMessage(error);

  const handleContactSupport = () => {
    const subject = encodeURIComponent(`Planet Beauty Error: ${title} (${errorId})`);
    const body = encodeURIComponent(
      `Hi Planet Beauty Support,\n\nI encountered an error in my inventory system:\n\nError ID: ${errorId}\nError: ${error instanceof Error ? error.message : 'Unknown error'}\nTime: ${new Date().toISOString()}\n\nPlease help resolve this issue.\n\nThank you!`
    );
    window.open(`mailto:support@planetbeauty.com?subject=${subject}&body=${body}`);
  };

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="pb-min-h-screen pb-flex pb-items-center pb-justify-center bg-gray-50">
      <div className="pb-card pb-max-w-lg pb-w-full pb-mx-4">
        <div className="pb-text-center">
          {/* Error Icon */}
          <div className="pb-w-16 pb-h-16 pb-mx-auto pb-mb-4 pb-flex pb-items-center pb-justify-center rounded-full" style={{ backgroundColor: '#fee2e2' }}>
            <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
          </div>

          {/* Error Title */}
          <h1 className="pb-text-xl pb-font-bold pb-mb-2" style={{ color: '#374151' }}>
            {title}
          </h1>

          {/* Error Message */}
          <p className="pb-text-sm pb-mb-4" style={{ color: '#6b7280' }}>
            {message}
          </p>

          {/* Suggestion */}
          <div className="pb-p-4 pb-mb-6 rounded-md" style={{ backgroundColor: '#f3f4f6' }}>
            <p className="pb-text-sm" style={{ color: '#374151' }}>
              💡 <strong>What you can do:</strong> {suggestion}
            </p>
          </div>

          {/* Database-specific help */}
          {isDatabaseError && (
            <div className="pb-p-4 pb-mb-6 rounded-md bg-yellow-50 border border-yellow-200">
              <p className="pb-text-sm pb-font-medium pb-mb-2" style={{ color: '#92400e' }}>
                🔧 For Developers:
              </p>
              <div className="pb-text-xs pb-font-mono bg-gray-100 pb-p-2 rounded" style={{ color: '#374151' }}>
                npm run db:init
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pb-space-y-3">
            <button
              onClick={handleRetry}
              className="pb-btn-primary pb-w-full"
              style={{ backgroundColor: '#d81b60' }}
            >
              <i className="fas fa-redo mr-2"></i>
              Try Again
            </button>

            <button
              onClick={() => window.location.reload()}
              className="pb-btn-secondary pb-w-full"
            >
              <i className="fas fa-sync mr-2"></i>
              Refresh Page
            </button>

            <button
              onClick={handleContactSupport}
              className="pb-btn-secondary pb-w-full"
            >
              <i className="fas fa-envelope mr-2"></i>
              Contact Support
            </button>

            <Link to="/app" className="pb-btn-secondary pb-w-full pb-block pb-text-center">
              <i className="fas fa-home mr-2"></i>
              Return to Dashboard
            </Link>
          </div>

          {/* Error Details (for development) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="pb-mt-6 pb-text-left">
              <summary className="pb-cursor-pointer pb-text-sm pb-font-medium pb-mb-2" style={{ color: '#6b7280' }}>
                🔧 Developer Details (dev only)
              </summary>
              <div className="pb-p-3 rounded-md bg-red-50 pb-text-xs pb-font-mono pb-overflow-auto">
                <p><strong>Error ID:</strong> {errorId}</p>
                <p><strong>Error:</strong> {error instanceof Error ? error.message : String(error)}</p>
                <p><strong>Stack:</strong></p>
                <pre className="pb-whitespace-pre-wrap pb-text-xs pb-mt-1">
                  {error instanceof Error ? error.stack : 'No stack trace available'}
                </pre>
              </div>
            </details>
          )}

          {/* Footer */}
          <div className="pb-mt-6 pb-pt-4 pb-border-t" style={{ borderColor: '#e5e7eb' }}>
            <p className="pb-text-xs" style={{ color: '#9ca3af' }}>
              Planet Beauty Inventory AI • Error ID: {errorId.slice(-8)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook for programmatic error handling
export const useErrorHandler = () => {
  const handleError = (error: Error | string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    
    // Log for monitoring
    console.error('🚨 Planet Beauty Error:', errorObj);
    
    // In production, send to error tracking
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(errorObj);
    }
    
    // Re-throw to be caught by error boundary
    throw errorObj;
  };

  return { handleError };
};

// Main error boundary component (using route error boundary pattern)
export function DatabaseErrorBoundary() {
  const error = useRouteError();
  const errorId = `PB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.group('🚨 Planet Beauty Error Boundary');
  console.error('Error:', error);
  console.groupEnd();

  return <ErrorDisplay error={error} errorId={errorId} />;
}

export default DatabaseErrorBoundary;