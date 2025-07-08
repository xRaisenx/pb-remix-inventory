import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; errorId: string; retry: () => void }>;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate a unique error ID for tracking
    const errorId = `PB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error for monitoring (in production, send to error tracking service)
    console.group('🚨 Planet Beauty Error Boundary');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    // In production, you would send this to an error tracking service
    // like Sentry, LogRocket, or Bugsnag
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent 
            error={this.state.error!} 
            errorId={this.state.errorId}
            retry={this.handleRetry}
          />
        );
      }

      // Default Planet Beauty error UI
      return (
        <PlanetBeautyErrorFallback 
          error={this.state.error!}
          errorId={this.state.errorId}
          retry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  errorId: string;
  retry: () => void;
}

const PlanetBeautyErrorFallback: React.FC<ErrorFallbackProps> = ({ error, errorId, retry }) => {
  const getErrorMessage = (error: Error): { title: string; message: string; suggestion: string } => {
    const errorMessage = error.message.toLowerCase();
    
    // Database connection errors
    if (errorMessage.includes('connection') || errorMessage.includes('database') || errorMessage.includes('prisma')) {
      return {
        title: 'Database Connection Issue',
        message: 'We\'re having trouble connecting to your inventory database. This is usually temporary.',
        suggestion: 'Please wait a moment and try refreshing the page. If the issue persists, contact our support team.'
      };
    }
    
    // Network/API errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
      return {
        title: 'Network Connection Problem',
        message: 'Unable to connect to Planet Beauty services. Please check your internet connection.',
        suggestion: 'Try refreshing the page or check your network connection. The issue should resolve automatically.'
      };
    }
    
    // Authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') || errorMessage.includes('session')) {
      return {
        title: 'Session Expired',
        message: 'Your session has expired for security reasons.',
        suggestion: 'Please refresh the page to log back in. Your data is safe and will be available once you\'re reconnected.'
      };
    }
    
    // Shopify API errors
    if (errorMessage.includes('shopify') || errorMessage.includes('graphql')) {
      return {
        title: 'Shopify Connection Issue',
        message: 'We\'re having trouble connecting to your Shopify store data.',
        suggestion: 'This is usually temporary. Please try again in a few moments, or check your Shopify app permissions.'
      };
    }
    
    // Generic fallback
    return {
      title: 'Something Went Wrong',
      message: 'We encountered an unexpected issue with your Planet Beauty inventory system.',
      suggestion: 'Please try refreshing the page. If the problem continues, our support team can help resolve this quickly.'
    };
  };

  const { title, message, suggestion } = getErrorMessage(error);

  const handleContactSupport = () => {
    const subject = encodeURIComponent(`Planet Beauty Error: ${title} (${errorId})`);
    const body = encodeURIComponent(
      `Hi Planet Beauty Support,\n\nI encountered an error in my inventory system:\n\nError ID: ${errorId}\nError: ${error.message}\nTime: ${new Date().toISOString()}\n\nPlease help resolve this issue.\n\nThank you!`
    );
    window.open(`mailto:support@planetbeauty.com?subject=${subject}&body=${body}`);
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

          {/* Action Buttons */}
          <div className="pb-space-y-3">
            <button
              onClick={retry}
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

            <button
              onClick={() => window.location.href = '/app'}
              className="pb-btn-secondary pb-w-full"
            >
              <i className="fas fa-home mr-2"></i>
              Return to Dashboard
            </button>
          </div>

          {/* Error Details (for development) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="pb-mt-6 pb-text-left">
              <summary className="pb-cursor-pointer pb-text-sm pb-font-medium pb-mb-2" style={{ color: '#6b7280' }}>
                🔧 Developer Details (dev only)
              </summary>
              <div className="pb-p-3 rounded-md bg-red-50 pb-text-xs pb-font-mono pb-overflow-auto">
                <p><strong>Error ID:</strong> {errorId}</p>
                <p><strong>Error:</strong> {error.message}</p>
                <p><strong>Stack:</strong></p>
                <pre className="pb-whitespace-pre-wrap pb-text-xs pb-mt-1">
                  {error.stack}
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
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((error: Error | string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    setError(errorObj);
    
    // Log for monitoring
    console.error('🚨 Planet Beauty Error:', errorObj);
    
    // In production, send to error tracking
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(errorObj);
    }
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  // Throw error to be caught by error boundary
  if (error) {
    throw error;
  }

  return { handleError, clearError };
};

// Higher-order component for wrapping components with error boundary
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error; errorId: string; retry: () => void }>
) => {
  return React.forwardRef<any, P>((props, ref) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} ref={ref} />
    </ErrorBoundary>
  ));
};

export default ErrorBoundary;