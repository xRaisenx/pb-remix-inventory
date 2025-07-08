import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import React, { useState, useEffect } from "react";
import { PlanetBeautyLayout } from "~/components/layout/PlanetBeautyLayout";
import Settings, { type NotificationSettingsType } from "~/components/Settings";
import { INTENT } from "~/utils/intents";

// TypeScript Interfaces for the route
interface LoaderData {
  settings: NotificationSettingsType;
  success?: string;
}

interface ActionData {
  errors?: Partial<Record<string, string>>;
  success?: string;
}

// Loader Function
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const notificationSettings = await prisma.NotificationSetting.findUnique({
    where: { shopId: shopRecord.id },
  });

  const settings: NotificationSettingsType = {
    email: {
      enabled: notificationSettings?.email ?? false,
      address: notificationSettings?.emailAddress ?? ''
    },
    slack: {
      enabled: notificationSettings?.slack ?? false,
      webhook: notificationSettings?.slackWebhookUrl ?? ''
    },
    telegram: {
      enabled: notificationSettings?.telegram ?? false,
      botToken: notificationSettings?.telegramBotToken ?? '',
      chatId: notificationSettings?.telegramChatId ?? ''
    },
    mobilePush: {
      enabled: notificationSettings?.mobilePush ?? false,
      service: notificationSettings?.mobilePushService ?? ''
    },
    salesThreshold: notificationSettings?.salesVelocityThreshold ?? 50,
    stockoutThreshold: notificationSettings?.criticalStockoutDays ?? 3,
    notificationFrequency: (notificationSettings?.frequency as 'immediate' | 'hourly' | 'daily') ?? 'daily',
    syncEnabled: notificationSettings?.syncEnabled ?? false
  };

  const url = new URL(request.url);
  const successMessage = url.searchParams.get("success");

  return json({ settings, success: successMessage ?? undefined });
};

// Action Function
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  if (intent === INTENT.SAVE_SETTINGS) {
    // Parse the settings from form data
    const settingsData = JSON.parse(formData.get('settings') as string) as NotificationSettingsType;
    
    // Basic validation
    const errors: ActionData['errors'] = {};
    
    if (settingsData.email.enabled && !settingsData.email.address.includes('@')) {
      errors.email = "A valid email address is required for email notifications.";
    }
    
    if (settingsData.slack.enabled && !settingsData.slack.webhook.startsWith('https://')) {
      errors.slack = "A valid Slack webhook URL is required for Slack notifications.";
    }
    
    if (settingsData.telegram.enabled && (!settingsData.telegram.botToken || !settingsData.telegram.chatId)) {
      errors.telegram = "Bot token and chat ID are required for Telegram notifications.";
    }

    if (Object.keys(errors).length > 0) {
      return json({ errors }, { status: 400 });
    }

    try {
      // Update shop-level settings
      await prisma.shop.update({
        where: { id: shopRecord.id },
        data: { 
          lowStockThreshold: settingsData.stockoutThreshold,
        }
      });

      // Upsert NotificationSettings
      await prisma.NotificationSetting.upsert({
        where: { shopId: shopRecord.id },
        create: {
          shopId: shopRecord.id,
          email: settingsData.email.enabled,
          emailAddress: settingsData.email.address,
          slack: settingsData.slack.enabled,
          slackWebhookUrl: settingsData.slack.webhook,
          telegram: settingsData.telegram.enabled,
          telegramBotToken: settingsData.telegram.botToken,
          telegramChatId: settingsData.telegram.chatId,
          mobilePush: settingsData.mobilePush.enabled,
          mobilePushService: settingsData.mobilePush.service,
          salesVelocityThreshold: settingsData.salesThreshold,
          criticalStockoutDays: settingsData.stockoutThreshold,
          frequency: settingsData.notificationFrequency,
          syncEnabled: settingsData.syncEnabled,
          lowStockThreshold: settingsData.stockoutThreshold,
          criticalStockThresholdUnits: 5 // Default value
        },
        update: {
          email: settingsData.email.enabled,
          emailAddress: settingsData.email.address,
          slack: settingsData.slack.enabled,
          slackWebhookUrl: settingsData.slack.webhook,
          telegram: settingsData.telegram.enabled,
          telegramBotToken: settingsData.telegram.botToken,
          telegramChatId: settingsData.telegram.chatId,
          mobilePush: settingsData.mobilePush.enabled,
          mobilePushService: settingsData.mobilePush.service,
          salesVelocityThreshold: settingsData.salesThreshold,
          criticalStockoutDays: settingsData.stockoutThreshold,
          frequency: settingsData.notificationFrequency,
          syncEnabled: settingsData.syncEnabled,
          lowStockThreshold: settingsData.stockoutThreshold,
        },
      });

      return redirect('/app/settings?success=Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      return json({ errors: { general: "Failed to save settings. Please try again." } }, { status: 500 });
    }
  }

  return json({ errors: { general: "Invalid intent" } }, { status: 400 });
};

// Page Component
export default function SettingsPage() {
  const { settings: initialSettings, success: loaderSuccess } = useLoaderData<LoaderData>();
  const [settings, setSettings] = useState<NotificationSettingsType>(initialSettings);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  const handleSubmit = async (updatedSettings: NotificationSettingsType): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const formData = new FormData();
      formData.append('intent', INTENT.SAVE_SETTINGS);
      formData.append('settings', JSON.stringify(updatedSettings));

      const response = await fetch('/app/settings', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Handle successful redirect or update
        return { success: true, message: 'Settings saved successfully!' };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.errors?.general || 'Failed to save settings' };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  return (
    <PlanetBeautyLayout>
      <div className="pb-space-y-6">
        {/* Page Header */}
        <div className="pb-flex pb-justify-between pb-items-center">
          <h1 className="pb-text-2xl pb-font-bold">Notification Settings</h1>
          <div className="pb-text-sm" style={{ color: '#718096' }}>
            Configure alerts, thresholds, and notification channels
          </div>
        </div>

        {/* Success Banner */}
        {loaderSuccess && (
          <div className="pb-alert-high-sales">
            <p>{loaderSuccess}</p>
          </div>
        )}

        {/* Settings Component */}
        <Settings
          notificationSettings={settings}
          setNotificationSettings={setSettings}
          onSubmit={handleSubmit}
        />

        {/* Additional Planet Beauty Settings */}
        <div className="pb-card">
          <h2 className="pb-text-lg pb-font-medium pb-mb-4">Planet Beauty Features</h2>
          <div className="pb-space-y-4">
            <div className="pb-p-4 bg-pink-50 rounded-md">
              <h3 className="pb-font-medium pb-mb-2" style={{ color: '#d81b60' }}>🚀 Coming Soon</h3>
              <ul className="pb-text-sm pb-space-y-1" style={{ color: '#374151' }}>
                <li>• Advanced analytics and predictive insights</li>
                <li>• Automated reorder suggestions</li>
                <li>• Integration with Planet Beauty POS system</li>
                <li>• Mobile app notifications</li>
                <li>• Custom alert scheduling</li>
              </ul>
            </div>
            
            <div className="pb-p-4 bg-blue-50 rounded-md">
              <h3 className="pb-font-medium pb-mb-2" style={{ color: '#2563eb' }}>💡 Tips for Optimal Performance</h3>
              <ul className="pb-text-sm pb-space-y-1" style={{ color: '#374151' }}>
                <li>• Set up multiple notification channels for critical alerts</li>
                <li>• Adjust thresholds based on seasonal sales patterns</li>
                <li>• Test notifications regularly to ensure delivery</li>
                <li>• Monitor notification history for tracking purposes</li>
              </ul>
            </div>

            <div className="pb-p-4 bg-yellow-50 rounded-md">
              <h3 className="pb-font-medium pb-mb-2" style={{ color: '#d97706' }}>⚙️ Advanced Configuration</h3>
              <div className="pb-grid pb-grid-cols-2 pb-gap-4 pb-text-sm">
                <div>
                  <p><strong>API Rate Limits:</strong></p>
                  <p style={{ color: '#6b7280' }}>Email: 100/hour</p>
                  <p style={{ color: '#6b7280' }}>Slack: 200/hour</p>
                  <p style={{ color: '#6b7280' }}>Telegram: 300/hour</p>
                </div>
                <div>
                  <p><strong>Data Retention:</strong></p>
                  <p style={{ color: '#6b7280' }}>Notifications: 30 days</p>
                  <p style={{ color: '#6b7280' }}>Analytics: 90 days</p>
                  <p style={{ color: '#6b7280' }}>Reports: 1 year</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Support Section */}
        <div className="pb-card">
          <h2 className="pb-text-lg pb-font-medium pb-mb-4">Need Help?</h2>
          <div className="pb-grid pb-grid-cols-1 md:pb-grid-cols-3 pb-gap-4">
            <div className="pb-text-center">
              <div className="pb-w-12 pb-h-12 pb-mx-auto pb-mb-2 pb-flex pb-items-center pb-justify-center rounded-full" style={{ backgroundColor: '#d81b60' }}>
                <i className="fas fa-book text-white"></i>
              </div>
              <h3 className="pb-font-medium pb-mb-1">Documentation</h3>
              <p className="pb-text-sm" style={{ color: '#6b7280' }}>
                Complete setup guides and troubleshooting
              </p>
              <a href="#" className="pb-btn-secondary pb-text-sm pb-mt-2">
                View Docs
              </a>
            </div>
            
            <div className="pb-text-center">
              <div className="pb-w-12 pb-h-12 pb-mx-auto pb-mb-2 pb-flex pb-items-center pb-justify-center rounded-full" style={{ backgroundColor: '#d81b60' }}>
                <i className="fas fa-comments text-white"></i>
              </div>
              <h3 className="pb-font-medium pb-mb-1">Live Chat</h3>
              <p className="pb-text-sm" style={{ color: '#6b7280' }}>
                Get instant help from our support team
              </p>
              <a href="#" className="pb-btn-secondary pb-text-sm pb-mt-2">
                Start Chat
              </a>
            </div>
            
            <div className="pb-text-center">
              <div className="pb-w-12 pb-h-12 pb-mx-auto pb-mb-2 pb-flex pb-items-center pb-justify-center rounded-full" style={{ backgroundColor: '#d81b60' }}>
                <i className="fas fa-envelope text-white"></i>
              </div>
              <h3 className="pb-font-medium pb-mb-1">Email Support</h3>
              <p className="pb-text-sm" style={{ color: '#6b7280' }}>
                Send us your questions and we'll respond within 24h
              </p>
              <a href="mailto:support@planetbeauty.com" className="pb-btn-secondary pb-text-sm pb-mt-2">
                Email Us
              </a>
            </div>
          </div>
        </div>
      </div>
    </PlanetBeautyLayout>
  );
}
