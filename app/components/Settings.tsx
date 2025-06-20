import React, { useState } from "react";
import {
  AppProvider,
  Card,
  TextField,
  Button,
  Select,
  InlineStack,
  BlockStack,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

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
}

// Custom Toast component
function Toast({ content, onDismiss }: { content: string; onDismiss: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#333', color: '#fff', padding: '12px 24px', borderRadius: 8, zIndex: 9999 }}>
      {content}
    </div>
  );
}

export default function Settings({ notificationSettings, setNotificationSettings }: SettingsProps) {
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState('');

  const handleInputChange = (channel: string, field: string, value: string) => {
    setNotificationSettings((prev: any) => ({
      ...prev,
      [channel]: { ...prev[channel], [field]: value }
    }));
  };

  const handleThresholdChange = (field: string, value: string | number | boolean) => {
    setNotificationSettings((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  };

  const testNotification = (channel: string) => {
    const message = `Test notification for ${channel}`;
    setToastContent(`${channel.charAt(0).toUpperCase() + channel.slice(1)} test sent`);
    setToastActive(true);
  };

  const saveSettings = () => {
    console.log('Settings saved:', notificationSettings);
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Card>
        <BlockStack gap="200">
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <label htmlFor="email-enabled">Enable Email Notifications</label>
                <input
                  type="checkbox"
                  id="email-enabled"
                  checked={notificationSettings.email.enabled}
                  onChange={(e: any) =>
                    handleInputChange('email', 'enabled', e.target.checked)
                  }
                />
              </InlineStack>
              <TextField
                label="Email Address"
                type="email"
                value={notificationSettings.email.address}
                onChange={(value) => handleInputChange('email', 'address', value)}
                disabled={!notificationSettings.email.enabled}
                autoComplete="email"
              />
              <Button variant="primary" onClick={() => testNotification('email')}>
                Test Email
              </Button>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <label htmlFor="slack-enabled">Enable Slack Notifications</label>
                <input
                  type="checkbox"
                  id="slack-enabled"
                  checked={notificationSettings.slack.enabled}
                  onChange={(e: any) =>
                    handleInputChange('slack', 'enabled', e.target.checked)
                  }
                />
              </InlineStack>
              <TextField
                label="Slack Webhook URL"
                type="text"
                value={notificationSettings.slack.webhook}
                onChange={(value) => handleInputChange('slack', 'webhook', value)}
                disabled={!notificationSettings.slack.enabled}
                autoComplete="url"
              />
              <Button variant="primary" onClick={() => testNotification('slack')}>
                Test Slack
              </Button>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <label htmlFor="telegram-enabled">Enable Telegram Notifications</label>
                <input
                  type="checkbox"
                  id="telegram-enabled"
                  checked={notificationSettings.telegram.enabled}
                  onChange={(e: any) =>
                    handleInputChange('telegram', 'enabled', e.target.checked)
                  }
                />
              </InlineStack>
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
              <Button variant="primary" onClick={() => testNotification('telegram')}>
                Test Telegram
              </Button>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <label htmlFor="mobile-push-enabled">Enable Mobile Push Notifications</label>
                <input
                  type="checkbox"
                  id="mobile-push-enabled"
                  checked={notificationSettings.mobilePush.enabled}
                  onChange={(e: any) =>
                    handleInputChange('mobilePush', 'enabled', e.target.checked)
                  }
                />
              </InlineStack>
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
              <Button variant="primary" onClick={() => testNotification('mobilePush')}>
                Test Mobile Push
              </Button>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <TextField
                label="High Sales Velocity Threshold (units/day)"
                type="number"
                value={String(notificationSettings.salesThreshold)}
                onChange={(value) => handleThresholdChange('salesThreshold', value)}
                autoComplete="off"
              />
              <TextField
                label="Stockout Risk Threshold (days)"
                type="number"
                value={String(notificationSettings.stockoutThreshold)}
                onChange={(value) => handleThresholdChange('stockoutThreshold', value)}
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
                onChange={(value) => handleThresholdChange('notificationFrequency', value)}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <label htmlFor="sync-enabled">
                  Enable Real-Time Shopify Inventory Sync
                </label>
                <input
                  type="checkbox"
                  id="sync-enabled"
                  checked={notificationSettings.syncEnabled}
                  onChange={(e: any) =>
                    handleThresholdChange('syncEnabled', e.target.checked)
                  }
                />
              </InlineStack>
            </BlockStack>
          </Card>
          <Button variant="primary" onClick={saveSettings}>
            Save Settings
          </Button>
        </BlockStack>
      </Card>
      {toastActive && <Toast content={toastContent} onDismiss={() => setToastActive(false)} />}
    </AppProvider>
  );
}
