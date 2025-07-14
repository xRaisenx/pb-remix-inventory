// app/components/Alerts.tsx
import { Banner, Text, Link, BlockStack, Button } from "@shopify/polaris";
import { useNavigate } from "@remix-run/react";

// Defines the structure for an alert item
export interface AlertItem {
  id: string; // Unique identifier for the alert (e.g., product_id + alert_type)
  title: string; // Main title of the alert banner
  description?: string; // Optional further description within the banner
  tone: 'critical' | 'warning' | 'info' | 'success'; // Tone of the banner
  action?: { // Optional action for the alert
    content: string; // Text for the action link/button
    url?: string; // URL for internal Remix navigation
    externalUrl?: string; // URL for external links
    onAction?: () => void; // Callback function for custom actions
  };
}

interface AlertsDisplayProps {
  alerts: AlertItem[]; // Array of alert items to display
  maxAlertsToShow?: number; // Optional: limits the number of banners shown directly
  // onDismiss?: (alertId: string) => void; // Optional callback for dismissing an alert
}

export default function AlertsDisplay({ alerts, maxAlertsToShow = 3 /*, onDismiss */ }: AlertsDisplayProps) {
  const navigate = useNavigate();

  if (!alerts || alerts.length === 0) {
    // By default, render nothing if there are no alerts.
    // This can be changed to show a "no alerts" message or a success banner if preferred.
    // Example:
    // return (
    //   <Banner title="All Systems Go!" tone="success" onDismiss={onDismiss ? () => onDismiss("all-clear") : undefined}>
    //     <p>No critical alerts at this time.</p>
    //   </Banner>
    // );
    return null;
  }

  // Determine which alerts to show directly vs. summarize
  const alertsToShow = alerts.slice(0, maxAlertsToShow);

  return (
    <BlockStack gap="400">
      {alertsToShow.map((alert) => (
        <Banner
          key={alert.id}
          title={alert.title}
          tone={alert.tone}
          // Example of how onDismiss could be wired up if an onDismiss prop was passed
          // onDismiss={onDismiss ? () => onDismiss(alert.id) : undefined}
        >
          {alert.description && <Text as="p" tone="subdued">{alert.description}</Text>}
          {alert.action && (
            <BlockStack gap="200">
              {alert.action.url ? (
                typeof alert.action.url === 'string' ? (
                  <Link url={alert.action.url}>
                    {alert.action.content}
                  </Link>
                ) : (
                  console.warn('Non-string url prop in AlertsDisplay:', alert.action.url),
                  <Link url="/">
                    {alert.action.content}
                  </Link>
                )
              ) : alert.action.externalUrl ? (
                typeof alert.action.externalUrl === 'string' ? (
                  <Link url={alert.action.externalUrl} external>
                    {alert.action.content}
                  </Link>
                ) : (
                  console.warn('Non-string externalUrl prop in AlertsDisplay:', alert.action.externalUrl),
                  <Link url="/">
                    {alert.action.content}
                  </Link>
                )
              ) : (
                <Button variant="plain" onClick={alert.action.onAction}>
                  {alert.action.content}
                </Button>
              )}
            </BlockStack>
          )}
        </Banner>
      ))}

      {alerts.length > maxAlertsToShow && (
        // Using a simple button approach instead of problematic Link with onClick
        <div style={{paddingBlockStart: 'var(--p-space-200)', textAlign: 'right'}}>
            <Button 
              variant="plain" 
              onClick={() => navigate("/app/alerts")}
              accessibilityLabel={`View all ${alerts.length} alerts`}
            >
              View all {alerts.length.toString()} alerts...
            </Button>
        </div>
      )}
    </BlockStack>
  );
}
