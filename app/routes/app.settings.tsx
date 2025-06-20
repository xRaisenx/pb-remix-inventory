// app/routes/app.settings.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
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
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { z } from "zod";
import React from "react";

// MERGE FIX: Combined Zod schema for all settings
const SettingsSchema = z.object({
  // Notification Thresholds
  shopLowStockThreshold: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).optional().nullable(),
  salesVelocityThreshold: z.coerce.number().min(0).optional().nullable(),
  criticalStockThresholdUnits: z.coerce.number().int().min(0).optional().nullable(),
  criticalStockoutDays: z.coerce.number().int().min(0).optional().nullable(),
  // Notification Channels
  enableEmailNotifications: z.preprocess((val) => val === "on", z.boolean()).optional(),
  emailForNotifications: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  enableSlackNotifications: z.preprocess((val) => val === "on", z.boolean()).optional(),
  slackWebhookUrl: z.string().url({ message: "Invalid Slack Webhook URL." }).optional().or(z.literal('')),
  // AI Configuration
  aiProvider: z.string().optional(),
  geminiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
});

// MERGE FIX: Combined data structure for the form
interface FormState {
  shopLowStockThreshold: number;
  lowStockThreshold: number | null;
  salesVelocityThreshold: number | null;
  criticalStockThresholdUnits: number | null;
  criticalStockoutDays: number | null;
  enableEmailNotifications: boolean;
  emailForNotifications: string;
  enableSlackNotifications: boolean;
  slackWebhookUrl: string;
  aiProvider: string;
  geminiApiKey: string;
  anthropicApiKey: string;
}

interface LoaderData {
  settings: FormState;
  error?: string;
  success?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { notificationSettings: true },
  });

  if (!shopRecord) {
    throw new Response("Shop not found", { status: 404 });
  }

  // MERGE FIX: Create a single settings object from both models
  const settings: FormState = {
    shopLowStockThreshold: shopRecord.lowStockThreshold ?? 10,
    lowStockThreshold: shopRecord.notificationSettings?.lowStockThreshold ?? null,
    salesVelocityThreshold: shopRecord.notificationSettings?.salesVelocityThreshold ?? null,
    criticalStockThresholdUnits: shopRecord.notificationSettings?.criticalStockThresholdUnits ?? null,
    criticalStockoutDays: shopRecord.notificationSettings?.criticalStockoutDays ?? null,
    enableEmailNotifications: !!shopRecord.emailForNotifications,
    emailForNotifications: shopRecord.emailForNotifications ?? '',
    enableSlackNotifications: !!shopRecord.slackWebhookUrl,
    slackWebhookUrl: shopRecord.slackWebhookUrl ?? '',
    aiProvider: shopRecord.aiProvider ?? 'none',
    geminiApiKey: shopRecord.geminiApiKey ?? '',
    anthropicApiKey: shopRecord.anthropicApiKey ?? '',
  };

  const url = new URL(request.url);
  const successMessage = url.searchParams.get("success");

  return json({ settings, success: successMessage ?? undefined });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const submittedValues = Object.fromEntries(formData);

  const validationResult = SettingsSchema.safeParse(submittedValues);

  if (!validationResult.success) {
    const errors = validationResult.error.flatten().fieldErrors;
    return json({ errors, submittedValues }, { status: 400 });
  }

  const {
    shopLowStockThreshold, lowStockThreshold, salesVelocityThreshold, criticalStockThresholdUnits, criticalStockoutDays,
    enableEmailNotifications, emailForNotifications,
    enableSlackNotifications, slackWebhookUrl,
    aiProvider, geminiApiKey, anthropicApiKey
  } = validationResult.data;

  try {
    // MERGE FIX: Update both Shop and NotificationSettings models in one transaction
    await prisma.$transaction([
      prisma.shop.update({
        where: { id: shopRecord.id },
        data: {
          lowStockThreshold: shopLowStockThreshold,
          emailForNotifications: enableEmailNotifications ? (emailForNotifications || null) : null,
          slackWebhookUrl: enableSlackNotifications ? (slackWebhookUrl || null) : null,
          aiProvider: aiProvider === 'none' ? null : aiProvider,
          geminiApiKey: geminiApiKey || null,
          anthropicApiKey: anthropicApiKey || null,
        },
      }),
      prisma.notificationSettings.upsert({
        where: { shopId: shopRecord.id },
        create: {
          shopId: shopRecord.id,
          lowStockThreshold, salesVelocityThreshold, criticalStockThresholdUnits, criticalStockoutDays,
        },
        update: {
          lowStockThreshold, salesVelocityThreshold, criticalStockThresholdUnits, criticalStockoutDays,
        },
      })
    ]);
    // Redirect with a success message to prevent form resubmission on refresh
    return redirect("/app/settings?success=Settings saved successfully!");
  } catch (error) {
    console.error("Error saving settings:", error);
    return json({ errors: { form: ["Failed to save settings."] }, submittedValues }, { status: 500 });
  }
};

export default function SettingsPage() {
  const { settings: initialSettings, error: loaderError, success: loaderSuccess } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<typeof action>();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting" && navigation.formData?.get('intent') === 'saveSettings';
  const actionData = fetcher.data || {};
  const formErrors = 'errors' in actionData ? actionData.errors : {};
  const displaySuccess = loaderSuccess; // Success message comes from loader after redirect

  return (
    <Page title="Settings">
      <Form method="post">
        {displaySuccess && <Banner title="Success" tone="success" onDismiss={() => {}}>{displaySuccess}</Banner>}
        {'form' in formErrors && <Banner title="Error" tone="critical">{formErrors.form}</Banner>}

        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">Alert Thresholds</Text>
                  <TextField
                    label="Shop Low Stock Threshold (Default)" name="shopLowStockThreshold" type="number"
                    defaultValue={initialSettings.shopLowStockThreshold}
                    error={'shopLowStockThreshold' in formErrors && formErrors.shopLowStockThreshold}
                    helpText="Global threshold for your shop." autoComplete="off"
                  />
                  <TextField
                    label="Notification Low Stock Threshold (Override)" name="lowStockThreshold" type="number"
                    defaultValue={initialSettings.lowStockThreshold ?? ""}
                    placeholder="Uses shop default if empty"
                    error={'lowStockThreshold' in formErrors && formErrors.lowStockThreshold}
                    autoComplete="off"
                  />
                  {/* Other threshold fields... */}
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">AI Configuration</Text>
                  <Select
                    label="AI Provider" name="aiProvider"
                    options={[
                      { label: "None", value: "none" },
                      { label: "Gemini (Google)", value: "gemini" },
                      { label: "Anthropic (Claude)", value: "anthropic" },
                    ]}
                    defaultValue={initialSettings.aiProvider}
                    error={'aiProvider' in formErrors && formErrors.aiProvider}
                  />
                  <TextField
                    label="Gemini API Key" name="geminiApiKey" type="password"
                    defaultValue={initialSettings.geminiApiKey}
                    error={'geminiApiKey' in formErrors && formErrors.geminiApiKey}
                    autoComplete="off"
                  />
                  <TextField
                    label="Anthropic API Key" name="anthropicApiKey" type="password"
                    defaultValue={initialSettings.anthropicApiKey}
                    error={'anthropicApiKey' in formErrors && formErrors.anthropicApiKey}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">Notification Channels</Text>
                  <Checkbox
                    label="Enable Email Notifications" name="enableEmailNotifications"
                    defaultChecked={initialSettings.enableEmailNotifications}
                  />
                  <TextField
                    label="Recipient Email Address" name="emailForNotifications" type="email"
                    defaultValue={initialSettings.emailForNotifications}
                    error={'emailForNotifications' in formErrors && formErrors.emailForNotifications}
                    autoComplete="off"
                  />
                  <Divider />
                  <Checkbox
                    label="Enable Slack Notifications" name="enableSlackNotifications"
                    defaultChecked={initialSettings.enableSlackNotifications}
                  />
                  <TextField
                    label="Slack Webhook URL" name="slackWebhookUrl" type="url"
                    defaultValue={initialSettings.slackWebhookUrl}
                    error={'slackWebhookUrl' in formErrors && formErrors.slackWebhookUrl}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
          <Button submit variant="primary" loading={isSaving}>Save Settings</Button>
        </BlockStack>
      </Form>
    </Page>
  );
}