// app/routes/notifications.tsx

import { Page, Card, Text, ResourceList, ResourceItem, Avatar, BlockStack } from "@shopify/polaris";

// Define a structure for notification messages
interface NotificationMessage {
  id: string;
  title: string;
  content?: string;
  timestamp?: string;
  read?: boolean;
  url: string;
}

// Mock data for now - in a real app, this would come from a loader
const mockNotifications: NotificationMessage[] = [
  {
    id: "notif_001",
    title: "Low Stock Alert",
    content: "Critical: 'Elta MD UV Physical SPF40' stock is very low (5 units) in 'Downtown Warehouse'. Sales velocity is high.",
    timestamp: "2025-06-18 10:30 AM",
    read: false,
    url: "/app/inventory?productId=gid://shopify/Product/123" // Example product ID
  },
  {
    id: "notif_002",
    title: "Low Stock Warning",
    content: "Warning: 'Anastasia Beverly Hills Clear Brow Gel' is below reorder point (8 units) in 'Online Fulfillment Center'.",
    timestamp: "2025-06-18 09:15 AM",
    read: false,
    url: "/app/inventory?productId=gid://shopify/Product/456"
  },
  {
    id: "notif_003",
    title: "AI Forecast Update",
    content: "Info: Demand forecast for 'Skincare' category has been updated by the AI assistant.",
    timestamp: "2025-06-17 08:00 AM",
    read: true,
    url: "/app/reports/ai_forecast"
  },
  {
    id: "notif_004",
    title: "Export Complete",
    content: "Success: Your scheduled inventory export for 'All Products' completed successfully.",
    timestamp: "2025-06-16 05:00 PM",
    read: true,
    url: "/app/reports/export_history/xyz" // Example link to a report
  },
];

export default function NotificationsPage() {
  // In a real application, you would use a loader to fetch notifications:
  // const { notifications } = useLoaderData<typeof loader>();

  return (
    <Page title="Notification History">
      <Card>
        {mockNotifications.length === 0 ? (
          <div style={{padding: 'var(--p-space-400)', textAlign: 'center'}}>
            <Text as="p" tone="subdued">You have no notifications at this time.</Text>
          </div>
        ) : (
          <ResourceList
            resourceName={{ singular: 'notification', plural: 'notifications' }}
            items={mockNotifications}
            renderItem={(notification: NotificationMessage) => {
              return (
                <ResourceItem
                  key={notification.id}
                  id={notification.id}
                  url={typeof notification.url === 'string' ? notification.url : (console.warn('Non-string url in notification:', notification.url), '/')}
                  accessibilityLabel={`View details for ${notification.title}`}
                  onClick={() => {}} // Add proper click handler
                  media={<Avatar customer={false} />}
                >
                  <BlockStack gap="100">
                    <Text variant="bodyMd" fontWeight={notification.read ? 'regular' : "semibold"} as="h3">
                      {notification.content}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">{notification.timestamp}</Text>
                  </BlockStack>
                </ResourceItem>
              );
            }}
          />
        )}
      </Card>
    </Page>
  );
}
