import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  AlphaCard,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Select,
  BlockStack,
  Text,
  Banner,
  Divider,
} from "@shopify/polaris";
import { Prisma } from "@prisma/client"; // For Prisma.Decimal type, though not directly used in form values
import type { NotificationSettings as NotificationSettingsPrismaType, Shop as ShopPrismaType } from '@prisma/client';
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import React from "react"; // Required for JSX

// TypeScript Interfaces
interface NotificationSettingsFormData {
  // Channel enables
  emailEnabled: boolean;
  slackEnabled: boolean;
  telegramEnabled: boolean;
  mobilePushEnabled: boolean;

  // Channel-specific details
  emailAddress: string;
  slackWebhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;

  frequency: string;

  // Thresholds
  shopLowStockThreshold: number; // From Shop model
  lowStockThreshold: number | null; // Override on NotificationSettings
  salesVelocityThreshold: number | null;
  criticalStockThresholdUnits: number | null; // New
  criticalStockoutDays: number | null;      // New

  syncEnabled: boolean;
}

interface LoaderData {
  settings: NotificationSettingsFormData;
  error?: string; // General errors from loader
  success?: string;
}

// Loader Function
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

  if (!shopRecord) {
    throw new Response("Shop not found", { status: 404 });
  }
  const shopId = shopRecord.id;

  const notificationSettings = await prisma.notificationSettings.findUnique({
    where: { shopId },
  });

  const settings: NotificationSettingsFormData = {
    emailEnabled: notificationSettings?.email ?? false,
    slackEnabled: notificationSettings?.slack ?? false,
    telegramEnabled: notificationSettings?.telegram ?? false,
    mobilePushEnabled: notificationSettings?.mobilePush ?? false,
    emailAddress: notificationSettings?.emailAddress ?? '',
    slackWebhookUrl: notificationSettings?.slackWebhookUrl ?? '',
    telegramBotToken: notificationSettings?.telegramBotToken ?? '',
    telegramChatId: notificationSettings?.telegramChatId ?? '',
    frequency: notificationSettings?.frequency ?? 'daily',
    shopLowStockThreshold: shopRecord.lowStockThreshold ?? 10,
    lowStockThreshold: notificationSettings?.lowStockThreshold ?? null,
    salesVelocityThreshold: notificationSettings?.salesVelocityThreshold ?? null,
    criticalStockThresholdUnits: notificationSettings?.criticalStockThresholdUnits ?? null,
    criticalStockoutDays: notificationSettings?.criticalStockoutDays ?? null,
    syncEnabled: notificationSettings?.syncEnabled ?? false,
  };

  // Check for query parameters indicating success from action
  const url = new URL(request.url);
  const successMessage = url.searchParams.get("success");

  return json({ settings, success: successMessage ?? undefined });
};

// Action Function
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });
  const shopId = shopRecord.id;

  const formData = await request.formData();
  const intent = formData.get('intent') as string;
  const submittedValues = Object.fromEntries(formData);

  interface FormErrors {
    emailAddress?: string;
    slackWebhookUrl?: string;
    shopLowStockThreshold?: string;
    lowStockThreshold?: string;
    salesVelocityThreshold?: string;
    criticalStockThresholdUnits?: string; // New error field
    criticalStockoutDays?: string;      // New error field
    frequency?: string;
    general?: string;
  }
  const errors: FormErrors = {};

  if (intent === 'saveSettings') {
    const emailEnabled = formData.get('emailEnabled') === 'on';
    const slackEnabled = formData.get('slackEnabled') === 'on';
    // ... (get other boolean flags)
    const syncEnabled = formData.get('syncEnabled') === 'on';
    const mobilePushEnabled = formData.get('mobilePushEnabled') === 'on';
    const telegramEnabled = formData.get('telegramEnabled') === 'on';


    const emailAddress = formData.get('emailAddress') as string || null;
    const slackWebhookUrl = formData.get('slackWebhookUrl') as string || null;
    const telegramBotToken = formData.get('telegramBotToken') as string || null;
    const telegramChatId = formData.get('telegramChatId') as string || null;
    const frequency = formData.get('frequency') as string || 'daily';

    // Validation
    if (emailEnabled && emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
      errors.emailAddress = "Invalid email format.";
    }
    if (slackEnabled && slackWebhookUrl && !slackWebhookUrl.startsWith('https://hooks.slack.com/')) {
      errors.slackWebhookUrl = "Invalid Slack Webhook URL format.";
    }
    if (!['immediate', 'hourly', 'daily'].includes(frequency)) {
        errors.frequency = "Invalid frequency value.";
    }

    const shopLowStockThresholdStr = formData.get('shopLowStockThreshold') as string;
    let shopLowStockThreshold = shopRecord.lowStockThreshold ?? 10; // Default if not provided or invalid
    if (shopLowStockThresholdStr) {
        const parsed = parseInt(shopLowStockThresholdStr, 10);
        if (isNaN(parsed) || parsed < 0) errors.shopLowStockThreshold = "Must be a non-negative integer.";
        else shopLowStockThreshold = parsed;
    }

    const lowStockThresholdStr = formData.get('lowStockThreshold') as string;
    let lowStockThreshold: number | null = null;
    if (lowStockThresholdStr && lowStockThresholdStr.trim() !== '') {
        const parsed = parseInt(lowStockThresholdStr, 10);
        if (isNaN(parsed) || parsed < 0) errors.lowStockThreshold = "Must be a non-negative integer.";
        else lowStockThreshold = parsed;
    }

    const salesVelocityThresholdStr = formData.get('salesVelocityThreshold') as string;
    let salesVelocityThreshold: number | null = null;
    if (salesVelocityThresholdStr && salesVelocityThresholdStr.trim() !== '') {
        const parsed = parseFloat(salesVelocityThresholdStr);
        if (isNaN(parsed) || parsed < 0) errors.salesVelocityThreshold = "Must be a non-negative number.";
        else salesVelocityThreshold = parsed;
    }

    const criticalStockThresholdUnitsStr = formData.get('criticalStockThresholdUnits') as string;
    let criticalStockThresholdUnits: number | null = null;
    if (criticalStockThresholdUnitsStr && criticalStockThresholdUnitsStr.trim() !== '') {
        const parsed = parseInt(criticalStockThresholdUnitsStr, 10);
        if (isNaN(parsed) || parsed < 0) errors.criticalStockThresholdUnits = "Must be a non-negative integer.";
        else criticalStockThresholdUnits = parsed;
    }

    const criticalStockoutDaysStr = formData.get('criticalStockoutDays') as string;
    let criticalStockoutDays: number | null = null;
    if (criticalStockoutDaysStr && criticalStockoutDaysStr.trim() !== '') {
        const parsed = parseInt(criticalStockoutDaysStr, 10);
        if (isNaN(parsed) || parsed < 0) errors.criticalStockoutDays = "Must be a non-negative integer.";
        else criticalStockoutDays = parsed;
    }

    if (Object.keys(errors).length > 0) {
      return json({ errors, submittedValues }, { status: 400 });
    }

    try {
      await prisma.shop.update({
        where: { id: shopId },
        data: { lowStockThreshold: shopLowStockThreshold }
      });

      const settingsData = {
        shopId, email: emailEnabled, slack: slackEnabled, telegram: telegramEnabled, mobilePush: mobilePushEnabled,
        emailAddress, slackWebhookUrl, telegramBotToken, telegramChatId,
        frequency, lowStockThreshold, salesVelocityThreshold,
        criticalStockThresholdUnits, criticalStockoutDays, // Add new fields
        syncEnabled,
      };
      await prisma.notificationSettings.upsert({
        where: { shopId }, create: settingsData, update: settingsData,
      });
      return json({ success: "Settings saved successfully!", submittedValues });
    } catch (e: any) {
      console.error("Error saving settings:", e);
      return json({ errors: { general: e.message || "Failed to save settings." }, submittedValues }, { status: 500 });
    }
  }

  if (intent === 'sendTestEmail') {
    const settings = await prisma.notificationSettings.findUnique({ where: { shopId } });
    if (!settings?.emailEnabled || !settings.emailAddress) {
      return json({ error: 'Email notifications are not enabled or no email address is configured.', submittedValues });
    }
    console.log(`Test email would be sent to: ${settings.emailAddress}`);
    return json({ success: `Test email logged (simulated send to ${settings.emailAddress}).`, submittedValues });
  }

  return json({ error: "Invalid intent", submittedValues }, { status: 400 });
};


// Page Component
export default function SettingsPage() {
  const { settings: initialSettings, error: loaderError, success: loaderSuccess } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<typeof action>();

  // Use state for form values to allow repopulation from actionData.submittedValues
  // This makes them controlled components.
  const [formState, setFormState] = React.useState<NotificationSettingsFormData>(initialSettings);

  React.useEffect(() => {
    if (fetcher.data?.submittedValues) {
      const values = fetcher.data.submittedValues;
      setFormState({
        emailEnabled: values.emailEnabled === 'on',
        slackEnabled: values.slackEnabled === 'on',
        telegramEnabled: values.telegramEnabled === 'on',
        mobilePushEnabled: values.mobilePushEnabled === 'on',
        emailAddress: values.emailAddress as string || '',
        slackWebhookUrl: values.slackWebhookUrl as string || '',
        telegramBotToken: values.telegramBotToken as string || '',
        telegramChatId: values.telegramChatId as string || '',
        frequency: values.frequency as string || 'daily',
        shopLowStockThreshold: parseInt(values.shopLowStockThreshold as string, 10) || 10,
        lowStockThreshold: values.lowStockThreshold && values.lowStockThreshold !== 'null' ? parseInt(values.lowStockThreshold as string, 10) : null,
        salesVelocityThreshold: values.salesVelocityThreshold && values.salesVelocityThreshold !== 'null' ? parseFloat(values.salesVelocityThreshold as string) : null,
        criticalStockThresholdUnits: values.criticalStockThresholdUnits && values.criticalStockThresholdUnits !== 'null' ? parseInt(values.criticalStockThresholdUnits as string, 10) : null,
        criticalStockoutDays: values.criticalStockoutDays && values.criticalStockoutDays !== 'null' ? parseInt(values.criticalStockoutDays as string, 10) : null,
        syncEnabled: values.syncEnabled === 'on',
      });
    } else if (fetcher.state === 'idle' && !fetcher.data && actionResponse?.success) {
      // After a successful save (indicated by actionResponse.success),
      // and fetcher is idle with no new data (implying it was a successful POST, not a validation error return)
      // Re-initialize formState from initialSettings which would have been reloaded by Remix if we used a redirect,
      // or if we want to ensure it reflects DB state after a successful save without redirect.
      // However, if action returns submittedValues on success, this might be redundant or cause quick flicker.
      // For now, let's rely on submittedValues if present, or initialSettings if not.
      // This logic might need refinement based on whether action returns submittedValues on success.
      // If success implies a full reload/redirect, this specific else-if might not be hit often with new data.
      setFormState(initialSettings);
    } else if (fetcher.state === 'idle' && !fetcher.data && !actionResponse?.success && !actionResponse?.errors) {
      // If idle, no data, and no success/error (e.g. initial load or after a test notification that doesn't return submittedValues)
      setFormState(initialSettings);
    }
  }, [fetcher.data, fetcher.state, initialSettings]);


  const handleInputChange = (field: keyof NotificationSettingsFormData) => (value: string | boolean) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };
  const handleNumericInputChange = (field: keyof NotificationSettingsFormData) => (value: string) => {
     setFormState(prev => ({ ...prev, [field]: value === '' ? null : Number(value) }));
  };
   const handleShopLowStockThresholdChange = (value: string) => {
    setFormState(prev => ({ ...prev, shopLowStockThreshold: value === '' ? 0 : Number(value) })); // Ensure it's not null
  };


  const actionResponse = fetcher.data;
  const displayError = actionResponse?.errors?.general || loaderError ;
  const fieldErrors = actionResponse?.errors || {};
  const displaySuccess = actionResponse?.success || loaderSuccess;

  // Determine if the form is currently submitting for the main save action
  const isSaving = fetcher.state === "submitting" && fetcher.formData?.get('intent') === 'saveSettings';
  const isSendingTest = fetcher.state === "submitting" && fetcher.formData?.get('intent')?.toString().startsWith('sendTest');

  return (
    <Page title="Settings">
      <fetcher.Form method="post">
        {/* General error/success banner */}
        {displayError && !fieldErrors.general && <Banner title="There were errors with your submission" tone="critical" onDismiss={() => {}}><BlockStack gap="100">{Object.values(fieldErrors).map((e,i) => <Text as="p" key={i}>{e as string}</Text>)}</BlockStack></Banner>}
        {displayError && fieldErrors.general && <Banner tone="critical" onDismiss={() => {}}>{fieldErrors.general}</Banner>}
        {displaySuccess && <Banner tone="success" onDismiss={() => {}}>{displaySuccess}</Banner>}

        <BlockStack gap={{xs: "800", sm: "400"}}>
          <Layout>
            <Layout.Section>
              <AlphaCard roundedAbove="sm">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Notification Channels</Text>

                  <Checkbox label="Enable Email Notifications" name="emailEnabled" checked={formState.emailEnabled} onChange={v => handleInputChange('emailEnabled')(v)} />
                  {formState.emailEnabled && (
                    <FormLayout>
                      <TextField label="Email Address for Notifications" name="emailAddress" type="email" value={formState.emailAddress} onChange={v => handleInputChange('emailAddress')(v)} error={fieldErrors.emailAddress} autoComplete="email" />
                      <Button onClick={() => fetcher.submit({ intent: 'sendTestEmail' }, { method: 'post' })} loading={isSendingTest && fetcher.formData?.get('intent') === 'sendTestEmail'}>Send Test Email</Button>
                    </FormLayout>
                  )}
                  <Divider />

                  <Checkbox label="Enable Slack Notifications" name="slackEnabled" checked={formState.slackEnabled} onChange={v => handleInputChange('slackEnabled')(v)} />
                   {formState.slackEnabled && (
                    <FormLayout>
                      <TextField label="Slack Webhook URL" name="slackWebhookUrl" value={formState.slackWebhookUrl} onChange={v => handleInputChange('slackWebhookUrl')(v)} error={fieldErrors.slackWebhookUrl} autoComplete="off" />
                    </FormLayout>
                  )}
                  <Divider />

                  <Checkbox label="Enable Telegram Notifications" name="telegramEnabled" checked={formState.telegramEnabled} onChange={v => handleInputChange('telegramEnabled')(v)} />
                  {formState.telegramEnabled && (
                    <FormLayout>
                      <TextField label="Telegram Bot Token" name="telegramBotToken" value={formState.telegramBotToken} onChange={v => handleInputChange('telegramBotToken')(v)} autoComplete="off" />
                      <TextField label="Telegram Chat ID" name="telegramChatId" value={formState.telegramChatId} onChange={v => handleInputChange('telegramChatId')(v)} autoComplete="off" />
                    </FormLayout>
                  )}
                  <Divider />

                  <Checkbox label="Enable Mobile Push Notifications (General)" name="mobilePushEnabled" checked={formState.mobilePushEnabled} onChange={v => handleInputChange('mobilePushEnabled')(v)} />
                </BlockStack>
              </AlphaCard>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap={{ xs: "800", sm: "400" }}>
                <AlphaCard roundedAbove="sm">
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Alert Thresholds</Text>
                        <TextField
                            label="Shop Low Stock Threshold (Default)" name="shopLowStockThreshold" type="number"
                            value={formState.shopLowStockThreshold.toString()} onChange={handleShopLowStockThresholdChange}
                            error={fieldErrors.shopLowStockThreshold} helpText="Global threshold for your shop." autoComplete="off"
                        />
                        <TextField
                            label="Notification Low Stock Threshold (Override)" name="lowStockThreshold" type="number"
                            value={formState.lowStockThreshold?.toString() ?? ""} onChange={v => handleNumericInputChange('lowStockThreshold')(v)}
                            placeholder="Uses shop default if empty" error={fieldErrors.lowStockThreshold}
                            helpText="Override for notifications. Cleared if shop default is preferred." autoComplete="off"
                        />
                        <TextField
                            label="Sales Velocity Alert Threshold (units/day)" name="salesVelocityThreshold" type="number"
                            value={formState.salesVelocityThreshold?.toString() ?? ""} onChange={v => handleNumericInputChange('salesVelocityThreshold')(v)}
                            placeholder="e.g., 30" error={fieldErrors.salesVelocityThreshold} autoComplete="off"
                        />
                        <TextField
                            label="Critical Stock Threshold (Units)" name="criticalStockThresholdUnits" type="number" min="0"
                            value={formState.criticalStockThresholdUnits?.toString() ?? ""} onChange={v => handleNumericInputChange('criticalStockThresholdUnits')(v)}
                            placeholder="e.g., 5" error={fieldErrors.criticalStockThresholdUnits} autoComplete="off"
                            helpText="Inventory at or below this is critical."
                        />
                        <TextField
                            label="Critical Stockout Threshold (Days)" name="criticalStockoutDays" type="number" min="0"
                            value={formState.criticalStockoutDays?.toString() ?? ""} onChange={v => handleNumericInputChange('criticalStockoutDays')(v)}
                            placeholder="e.g., 3" error={fieldErrors.criticalStockoutDays} autoComplete="off"
                            helpText="Stockout in this many days or less is critical."
                        />
                    </BlockStack>
                </AlphaCard>
                <AlphaCard roundedAbove="sm">
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Notification Frequency</Text>
                        <Select
                            label="Send notifications" name="frequency"
                            options={[
                                { label: 'Immediately', value: 'immediate' }, { label: 'Hourly Digest', value: 'hourly' }, { label: 'Daily Digest', value: 'daily' },
                            ]}
                            value={formState.frequency} onChange={v => handleInputChange('frequency')(v)} error={fieldErrors.frequency}
                        />
                    </BlockStack>
                </AlphaCard>
                 <AlphaCard roundedAbove="sm">
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Inventory Sync</Text>
                         <Checkbox
                            label="Enable Real-Time Shopify Inventory Sync" name="syncEnabled"
                            checked={formState.syncEnabled} onChange={v => handleInputChange('syncEnabled')(v)}
                            helpText="Allow the app to sync inventory changes to/from Shopify."
                        />
                    </BlockStack>
                </AlphaCard>
              </BlockStack>
            </Layout.Section>
            <Layout.Section>
                 <Button submit variant="primary" fullWidth loading={isSaving} onClick={() => fetcher.submit(formStateToFormData(formState, 'saveSettings'), { method: 'post' })}>Save Settings</Button>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </fetcher.Form>
    </Page>
  );
}

// Helper to convert formState back to FormData for submission, ensuring checkbox values are correct
function formStateToFormData(formState: NotificationSettingsFormData, intent: string): FormData {
    const formData = new FormData();
    formData.append('intent', intent);
    for (const key in formState) {
        const value = formState[key as keyof NotificationSettingsFormData];
        if (typeof value === 'boolean') {
            if (value) formData.append(key, 'on');
        } else if (value !== null && value !== undefined) {
            formData.append(key, value.toString());
        }
    }
    return formData;
}
                    </BlockStack>
                </AlphaCard>
                <AlphaCard roundedAbove="sm">
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Notification Frequency</Text>
                        <Select
                            label="Send notifications"
                            name="frequency"
                            options={[
                                { label: 'Immediately', value: 'immediate' },
                                { label: 'Hourly Digest', value: 'hourly' },
                                { label: 'Daily Digest', value: 'daily' },
                            ]}
                            defaultValue={settings.frequency}
                        />
                    </BlockStack>
                </AlphaCard>
                 <AlphaCard roundedAbove="sm">
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Inventory Sync</Text>
                         <Checkbox
                            label="Enable Real-Time Shopify Inventory Sync"
                            name="syncEnabled"
                            defaultChecked={settings.syncEnabled}
                            helpText="Allow the app to sync inventory changes to/from Shopify."
                        />
                    </BlockStack>
                </AlphaCard>
              </BlockStack>
            </Layout.Section>
            <Layout.Section>
                <Button submit variant="primary" fullWidth loading={isSaving}>Save Settings</Button>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </fetcher.Form>
    </Page>
  );
}
