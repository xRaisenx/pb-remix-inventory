import React, { useState } from "react";
import {
  Card,
  TextField,
  Button,
  Select,
  BlockStack,
  Checkbox, // Added Checkbox
  Frame, // Added Frame for Toast
  Toast, // Added Toast
  Text, // Added Text for section titles
} from '@shopify/polaris';
// Removed useToast import as it's not directly available in older Polaris versions without context.
// We will use the Toast component directly if needed, managed by local state.
// However, the original ticket asked to REMOVE custom Toast, so we'll remove all toast functionality
// if a direct Polaris replacement isn't straightforward without useToast hook.
// For now, I will remove the custom toast and its usage.
// If feedback is absolutely necessary, a Banner could be used, or the parent component would handle it.

export interface NotificationSettingsType {
  email: { enabled: boolean; address: string };
  slack: { enabled: boolean; webhook: string };
  telegram: { enabled: boolean; botToken: string; chatId: string };
  mobilePush: { enabled: boolean; service: string };
  salesThreshold: number;
  stockoutThreshold: number;
  notificationFrequency: 'immediate' | 'hourly' | 'daily';
  syncEnabled: boolean;
}

interface SettingsProps {
  notificationSettings: NotificationSettingsType;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettingsType>>;
  // Add onSubmit prop for handling the actual save logic
  onSubmit: (settings: NotificationSettingsType) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export default function Settings({ notificationSettings, setNotificationSettings, onSubmit }: SettingsProps) {
  // State for Polaris Toast
  const [toastProps, setToastProps] = useState<{ content: string; error?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);


  const handleInputChange = (channel: keyof NotificationSettingsType, field: string, value: any) => {
    setNotificationSettings((prev) => {
      const prevChannelSettings = prev[channel];
      if (typeof prevChannelSettings === 'object' && prevChannelSettings !== null && 'enabled' in prevChannelSettings) {
        return {
          ...prev,
          [channel]: { ...prevChannelSettings, [field]: value },
        };
      }
      return prev; // Should not happen with correct types
    });
  };

  const handleThresholdChange = (field: keyof NotificationSettingsType, value: string | number | boolean) => {
    setNotificationSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const testNotification = (channel: string) => {
    // This function would ideally call an action to test the notification
    // For now, it just shows a local toast.
    setToastProps({ content: `${channel.charAt(0).toUpperCase() + channel.slice(1)} test initiated (simulation).` });
    console.log(`Test notification for ${channel}`);
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    setToastProps(null); // Clear previous toasts
    const result = await onSubmit(notificationSettings);
    setIsSaving(false);
    if (result.success) {
      setToastProps({ content: result.message || 'Settings saved successfully!' });
    } else {
      setToastProps({ content: result.error || 'Failed to save settings.', error: true });
    }
  };

  const toastMarkup = toastProps ? (
    <Toast content={toastProps.content} error={toastProps.error} onDismiss={() => setToastProps(null)} />
  ) : null;

  return (
    // Frame is needed for Polaris Toasts to be displayed
    <Frame>
      <BlockStack gap="400"> {/* Increased gap for overall layout */}
        <Card>
          <BlockStack gap="300"> {/* Consistent gap within cards */}
            <Text variant="headingMd" as="h2">Email Notifications</Text>
            <Checkbox
              label="Enable Email Notifications"
              checked={notificationSettings.email.enabled}
              onChange={(checked) =>
                handleInputChange('email', 'enabled', checked)
              }
            />
            <TextField
              label="Email Address"
              type="email"
              value={notificationSettings.email.address}
              onChange={(value) => handleInputChange('email', 'address', value)}
              disabled={!notificationSettings.email.enabled}
              autoComplete="email"
            />
            <Button onClick={() => testNotification('email')} disabled={!notificationSettings.email.enabled}>
              Test Email
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Slack Notifications</Text>
            <Checkbox
              label="Enable Slack Notifications"
              checked={notificationSettings.slack.enabled}
              onChange={(checked) =>
                handleInputChange('slack', 'enabled', checked)
              }
            />
            <TextField
              label="Slack Webhook URL"
              type="text"
              value={notificationSettings.slack.webhook}
              onChange={(value) => handleInputChange('slack', 'webhook', value)}
              disabled={!notificationSettings.slack.enabled}
              autoComplete="url"
            />
            <Button onClick={() => testNotification('slack')} disabled={!notificationSettings.slack.enabled}>
              Test Slack
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Telegram Notifications</Text>
            <Checkbox
              label="Enable Telegram Notifications"
              checked={notificationSettings.telegram.enabled}
              onChange={(checked) =>
                handleInputChange('telegram', 'enabled', checked)
              }
            />
            <TextField
              label="Telegram Bot Token"
              type="text"
              value={notificationSettings.telegram.botToken}
              onChange={(value) =>
                handleInputChange('telegram', 'botToken', value)
              }
              disabled={!notificationSettings.telegram.enabled}
              autoComplete="password"
            />
            <TextField
              label="Telegram Chat ID"
              type="text"
              value={notificationSettings.telegram.chatId}
              onChange={(value) => handleInputChange('telegram', 'chatId', value)}
              disabled={!notificationSettings.telegram.enabled}
              autoComplete="off"
            />
            <Button onClick={() => testNotification('telegram')} disabled={!notificationSettings.telegram.enabled}>
              Test Telegram
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Mobile Push Notifications</Text>
            <Checkbox
              label="Enable Mobile Push Notifications"
              checked={notificationSettings.mobilePush.enabled}
              onChange={(checked) =>
                handleInputChange('mobilePush', 'enabled', checked)
              }
            />
            <TextField
              label="Push Service Credentials"
              type="text"
              value={notificationSettings.mobilePush.service}
              onChange={(value) =>
                handleInputChange('mobilePush', 'service', value)
              }
              disabled={!notificationSettings.mobilePush.enabled}
              autoComplete="off"
            />
            <Button onClick={() => testNotification('mobilePush')} disabled={!notificationSettings.mobilePush.enabled}>
              Test Mobile Push
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Thresholds & Frequency</Text>
            <TextField
              label="High Sales Velocity Threshold (units/day)"
              type="number"
              value={String(notificationSettings.salesThreshold)}
              onChange={(value) => handleThresholdChange('salesThreshold', parseFloat(value) || 0)}
              autoComplete="off"
            />
            <TextField
              label="Stockout Risk Threshold (days)"
              type="number"
              value={String(notificationSettings.stockoutThreshold)}
              onChange={(value) => handleThresholdChange('stockoutThreshold', parseInt(value, 10) || 0)}
              autoComplete="off"
            />
            <Select
              label="Notification Frequency"
              options={[
                { label: 'Immediate', value: 'immediate' },
                { label: 'Hourly Digest', value: 'hourly' },
                { label: 'Daily Summary', value: 'daily' },
              ]}
              value={notificationSettings.notificationFrequency}
              onChange={(value) => handleThresholdChange('notificationFrequency', value as 'immediate' | 'hourly' | 'daily')}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Sync Settings</Text>
            <Checkbox
              label="Enable Real-Time Shopify Inventory Sync"
              checked={notificationSettings.syncEnabled}
              onChange={(checked) =>
                handleThresholdChange('syncEnabled', checked)
              }
            />
          </BlockStack>
        </Card>
        <Button variant="primary" onClick={handleSubmit} loading={isSaving}>
          Save Settings
        </Button>
      </BlockStack>
      {toastMarkup}
    </Frame>
  );
}
