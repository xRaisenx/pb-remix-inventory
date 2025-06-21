import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, Form as RemixForm } from "@remix-run/react"; // Use RemixForm to avoid conflict with Polaris Form
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Select, // Keep Select if used, otherwise remove
  BlockStack,
  Text,
  Banner,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import React, { useState, useEffect, useCallback } from "react"; // Import useCallback
import { INTENT } from "~/utils/intents";

// TypeScript Interfaces
interface NotificationSettingsFormData {
  emailEnabled: boolean;
  slackEnabled: boolean;
  telegramEnabled: boolean; // Assuming this might be added later
  mobilePushEnabled: boolean; // Assuming this might be added later

  emailAddress: string;
  slackWebhookUrl: string;
  telegramBotToken: string; // For consistency
  telegramChatId: string;   // For consistency

  frequency: string; // e.g., 'daily', 'weekly', 'immediately'

  // Shop-level general threshold (fallback)
  shopLowStockThreshold: number;

  // Notification-specific overrides
  lowStockThreshold: number | null; // Specific for notifications, can be null to use shop default
  salesVelocityThreshold: number | null;
  criticalStockThresholdUnits: number | null;
  criticalStockoutDays: number | null;

  syncEnabled: boolean; // For real-time inventory sync
}

interface ActionData {
  errors?: Partial<Record<keyof NotificationSettingsFormData | 'general', string>>;
  success?: string;
  // submittedValues?: NotificationSettingsFormData; // Not strictly needed if redirecting
}

// Loader Function
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const notificationSettings = await prisma.notificationSettings.findUnique({
    where: { shopId: shopRecord.id },
  });

  const settings: NotificationSettingsFormData = {
    emailEnabled: notificationSettings?.email ?? false,
    slackEnabled: notificationSettings?.slack ?? false,
    telegramEnabled: notificationSettings?.telegram ?? false, // Default to false
    mobilePushEnabled: notificationSettings?.mobilePush ?? false, // Default to false

    emailAddress: notificationSettings?.emailAddress ?? '',
    slackWebhookUrl: notificationSettings?.slackWebhookUrl ?? '',
    telegramBotToken: notificationSettings?.telegramBotToken ?? '', // Default to empty
    telegramChatId: notificationSettings?.telegramChatId ?? '',     // Default to empty

    frequency: notificationSettings?.frequency ?? 'daily', // Default frequency

    shopLowStockThreshold: shopRecord.lowStockThreshold ?? 10, // Default from shop or app default

    lowStockThreshold: notificationSettings?.lowStockThreshold, // Nullable
    salesVelocityThreshold: notificationSettings?.salesVelocityThreshold, // Nullable
    criticalStockThresholdUnits: notificationSettings?.criticalStockThresholdUnits, // Nullable
    criticalStockoutDays: notificationSettings?.criticalStockoutDays, // Nullable

    syncEnabled: notificationSettings?.syncEnabled ?? false, // Default sync to false
  };

  const url = new URL(request.url);
  const successMessage = url.searchParams.get("success"); // For success message after redirect

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
    // Basic validation example (enhance as needed)
    const errors: ActionData['errors'] = {};
    const emailAddress = formData.get('emailAddress') as string;
    if (formData.get('emailEnabled') === 'on' && (!emailAddress || !emailAddress.includes('@'))) {
      errors.emailAddress = "A valid email address is required for email notifications.";
    }
    // Add more validations...

    if (Object.keys(errors).length > 0) {
      // Re-bundle submitted values to repopulate form if needed, though formState handles this client-side
      return json({ errors /*, submittedValues: Object.fromEntries(formData) as unknown as NotificationSettingsFormData */ }, { status: 400 });
    }

    const dataToSave = {
      // Shop-level threshold
      shopLowStockThreshold: Number(formData.get('shopLowStockThreshold')),

      // NotificationSettings specific fields
      lowStockThreshold: formData.get('lowStockThreshold') ? Number(formData.get('lowStockThreshold')) : null,
      salesVelocityThreshold: formData.get('salesVelocityThreshold') ? Number(formData.get('salesVelocityThreshold')) : null,
      criticalStockThresholdUnits: formData.get('criticalStockThresholdUnits') ? Number(formData.get('criticalStockThresholdUnits')) : null,
      criticalStockoutDays: formData.get('criticalStockoutDays') ? Number(formData.get('criticalStockoutDays')) : null,

      email: formData.get('emailEnabled') === 'on',
      emailAddress: formData.get('emailAddress') as string,
      slack: formData.get('slackEnabled') === 'on',
      slackWebhookUrl: formData.get('slackWebhookUrl') as string,
      telegram: formData.get('telegramEnabled') === 'on',
      telegramBotToken: formData.get('telegramBotToken') as string,
      telegramChatId: formData.get('telegramChatId') as string,
      mobilePush: formData.get('mobilePushEnabled') === 'on',
      frequency: formData.get('frequency') as string,
      syncEnabled: formData.get('syncEnabled') === 'on',
    };

    await prisma.shop.update({
      where: { id: shopRecord.id },
      data: { lowStockThreshold: dataToSave.shopLowStockThreshold }
    });

    // Upsert NotificationSettings
    const { shopLowStockThreshold, ...notificationSpecificData } = dataToSave; // Exclude shop-level field from NS table
    await prisma.notificationSettings.upsert({
      where: { shopId: shopRecord.id },
      create: { shopId: shopRecord.id, ...notificationSpecificData },
      update: notificationSpecificData,
    });

    return redirect('/app/settings?success=Settings saved successfully!');
  }

  // Handle other intents if any
  return json({ errors: { general: "Invalid intent" } }, { status: 400 });
};


// Page Component
export default function SettingsPage() {
  const { settings: initialSettings, success: loaderSuccess } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();

  // formState now correctly typed with NotificationSettingsFormData
  const [formState, setFormState] = useState<NotificationSettingsFormData>(initialSettings);

  useEffect(() => {
    // This effect ensures that if the loader re-runs (e.g., after a redirect with a success message),
    // the formState is updated with the potentially new initialSettings from the loader.
    setFormState(initialSettings);
  }, [initialSettings]);


  // useCallback for stable function references if passed to memoized children
  const handleInputChange = useCallback((field: keyof NotificationSettingsFormData, value: string | boolean | number | null) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleNumberInputChange = useCallback((field: keyof NotificationSettingsFormData, value: string) => {
    // Allow empty string for nullable number fields, convert to null before saving
    // For non-nullable, ensure it's a valid number or handle error/default
    if (value === "") {
        if (field === 'lowStockThreshold' || field === 'salesVelocityThreshold' || field === 'criticalStockThresholdUnits' || field === 'criticalStockoutDays') {
            handleInputChange(field, null);
        } else { // For shopLowStockThreshold which is not nullable
            handleInputChange(field, 0); // Or some default / keep previous valid
        }
    } else {
        handleInputChange(field, Number(value));
    }
  }, [handleInputChange]);


  const actionData = fetcher.data;
  const isSaving = fetcher.state === "submitting";

  // Consolidate success/error messages from loader (after redirect) and fetcher (direct action response)
  const displaySuccess = actionData?.success || loaderSuccess;
  const displayError = actionData?.errors?.general;
  const fieldErrors = actionData?.errors || {};


  return (
    <Page title="Settings">
      {/* Use RemixForm and manage submission via fetcher.submit */}
      <RemixForm method="post" onSubmit={(event) => {
        // Client-side validation can happen here before fetcher.submit
        // fetcher.submit will automatically serialize the form
        fetcher.submit(event.currentTarget);
      }}>
        <input type="hidden" name="intent" value={INTENT.SAVE_SETTINGS} />
        <BlockStack gap={{ xs: "800", sm: "400" }}>
          {/* Banners for general errors or success messages */}
          {displayError && <Banner title="Error" tone="critical" onDismiss={() => fetcher.data && (fetcher.data.errors = undefined)}>{displayError}</Banner>}
          {displaySuccess && <Banner title="Success" tone="success" onDismiss={() => { /* Clear success state if needed */ }}>{displaySuccess}</Banner>}

          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Notification Channels</Text>
                  {/* Email */}
                  <Checkbox label="Enable Email Notifications" name="emailEnabled" checked={formState.emailEnabled} onChange={checked => handleInputChange('emailEnabled', checked)} />
                  {formState.emailEnabled && (
                    <TextField label="Email Address" name="emailAddress" type="email" value={formState.emailAddress} onChange={value => handleInputChange('emailAddress', value)} error={fieldErrors.emailAddress} autoComplete="email" />
                  )}
                  <Divider />
                  {/* Slack */}
                  <Checkbox label="Enable Slack Notifications" name="slackEnabled" checked={formState.slackEnabled} onChange={checked => handleInputChange('slackEnabled', checked)} />
                  {formState.slackEnabled && (
                    <TextField label="Slack Webhook URL" name="slackWebhookUrl" value={formState.slackWebhookUrl} onChange={value => handleInputChange('slackWebhookUrl', value)} error={fieldErrors.slackWebhookUrl} autoComplete="off" />
                  )}
                  {/* Add Telegram and Mobile Push similarly if implemented */}
                   <Divider />
                  <Checkbox label="Enable Telegram Notifications (Future)" name="telegramEnabled" checked={formState.telegramEnabled} onChange={v => handleInputChange('telegramEnabled', v)} disabled/>
                  {/* ... Telegram fields ... */}
                  <Divider />
                  <Checkbox label="Enable Mobile Push Notifications (Future)" name="mobilePushEnabled" checked={formState.mobilePushEnabled} onChange={v => handleInputChange('mobilePushEnabled', v)} disabled/>

                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Alert Thresholds</Text>
                    <FormLayout>
                      <TextField label="Default Low Stock Threshold (Units)" name="shopLowStockThreshold" type="number" min={0} value={String(formState.shopLowStockThreshold)} onChange={v => handleNumberInputChange('shopLowStockThreshold', v)} error={fieldErrors.shopLowStockThreshold} autoComplete="off" helpText="General threshold for the shop."/>
                      <TextField label="Notification Low Stock (Units)" name="lowStockThreshold" type="number" min={0} value={formState.lowStockThreshold === null ? '' : String(formState.lowStockThreshold)} onChange={v => handleNumberInputChange('lowStockThreshold', v)} error={fieldErrors.lowStockThreshold} autoComplete="off" helpText="Override for notifications. Leave blank to use default."/>
                      <TextField label="Notification Sales Velocity (Units/Day)" name="salesVelocityThreshold" type="number" min={0} value={formState.salesVelocityThreshold === null ? '' : String(formState.salesVelocityThreshold)} onChange={v => handleNumberInputChange('salesVelocityThreshold', v)} error={fieldErrors.salesVelocityThreshold} autoComplete="off" helpText="Alert if daily sales exceed this. Leave blank to disable."/>
                      <TextField label="Notification Critical Stock (Units)" name="criticalStockThresholdUnits" type="number" min={0} value={formState.criticalStockThresholdUnits === null ? '' : String(formState.criticalStockThresholdUnits)} onChange={v => handleNumberInputChange('criticalStockThresholdUnits', v)} error={fieldErrors.criticalStockThresholdUnits} autoComplete="off" helpText="Override for critical status. Leave blank for default logic."/>
                      <TextField label="Notification Critical Stockout (Days)" name="criticalStockoutDays" type="number" min={0} value={formState.criticalStockoutDays === null ? '' : String(formState.criticalStockoutDays)} onChange={v => handleNumberInputChange('criticalStockoutDays', v)} error={fieldErrors.criticalStockoutDays} autoComplete="off" helpText="Override for critical status. Leave blank for default logic."/>
                    </FormLayout>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Sync Settings</Text>
                     <Select
                        label="Notification Frequency"
                        name="frequency"
                        options={[
                          { label: 'Daily', value: 'daily' },
                          { label: 'Weekly', value: 'weekly' },
                          { label: 'Immediately (if supported)', value: 'immediately' },
                        ]}
                        onChange={value => handleInputChange('frequency', value)}
                        value={formState.frequency}
                      />
                    <Checkbox label="Enable Real-Time Inventory Sync (Future)" name="syncEnabled" checked={formState.syncEnabled} onChange={v => handleInputChange('syncEnabled', v)} disabled/>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
          <div style={{ marginTop: 'var(--p-space-400)' }}> {/* Using div for layout */}
            {/* This button will now correctly submit the RemixForm handled by the fetcher */}
            <Button submit variant="primary" fullWidth loading={isSaving}>Save Settings</Button>
          </div>
        </BlockStack>
      </RemixForm>
    </Page>
  );
}
