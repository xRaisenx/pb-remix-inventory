import { useRouteError, isRouteErrorResponse, Link } from "@remix-run/react";

export function DatabaseErrorBoundary() {
  const error = useRouteError();

  console.error("Route Error:", error);

  let errorMessage = "An unexpected error occurred";
  let errorDetails = "";
  let isDatabaseError = false;

  if (isRouteErrorResponse(error)) {
    errorMessage = error.data?.message || error.statusText;
    errorDetails = `Status: ${error.status}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || "";
    
    // Check if it's a database-related error
    isDatabaseError = 
      error.message.includes('session') ||
      error.message.includes('database') ||
      error.message.includes('connection') ||
      error.message.includes('Prisma') ||
      error.message.includes('pool');
  }

  return (
    <div className="pb-min-h-screen pb-flex pb-items-center pb-justify-center" style={{ backgroundColor: '#f5f7fa' }}>
      <div className="pb-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="text-center pb-space-y-4">
          <div className="pb-text-3xl pb-font-bold" style={{ color: '#c94f6d' }}>
            🛠️ Planet Beauty Inventory AI
          </div>
          
          {isDatabaseError ? (
            <>
              <div className="pb-text-xl pb-font-medium" style={{ color: '#822727' }}>
                Database Connection Issue
              </div>
              <div className="pb-alert-critical">
                <p>We're experiencing database connectivity issues. This usually happens when:</p>
                <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                  <li>• Database migrations haven't been applied</li>
                  <li>• Database connection pool is full</li>
                  <li>• Database credentials are incorrect</li>
                  <li>• Database server is temporarily unavailable</li>
                </ul>
              </div>
              <div className="pb-space-y-2">
                <p className="pb-text-sm">
                  <strong>For Developers:</strong> Run the database initialization script:
                </p>
                <code style={{ 
                  backgroundColor: '#f1f2f3', 
                  padding: '8px 12px', 
                  borderRadius: '4px', 
                  display: 'block',
                  fontSize: '14px'
                }}>
                  npm run db:init
                </code>
              </div>
            </>
          ) : (
            <>
              <div className="pb-text-xl pb-font-medium" style={{ color: '#822727' }}>
                Application Error
              </div>
              <div className="pb-alert-warning">
                <p>{errorMessage}</p>
              </div>
            </>
          )}

          <div className="pb-space-y-2">
            <p className="pb-text-sm" style={{ color: '#6b7280' }}>
              If this problem persists, please contact support.
            </p>
          </div>

          <div className="pb-flex pb-justify-center pb-space-x-4">
            <Link to="/app" className="pb-btn-primary">
              Return to Dashboard
            </Link>
            <button 
              onClick={() => window.location.reload()} 
              className="pb-btn-secondary"
            >
              Refresh Page
            </button>
          </div>

          {process.env.NODE_ENV === "development" && (
            <details className="pb-mt-4">
              <summary className="pb-text-sm cursor-pointer" style={{ color: '#6b7280' }}>
                Error Details (Development Only)
              </summary>
              <pre className="pb-text-sm pb-mt-2 p-2" style={{ 
                backgroundColor: '#f1f2f3', 
                borderRadius: '4px', 
                overflow: 'auto',
                textAlign: 'left',
                fontSize: '12px'
              }}>
                {errorDetails}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}