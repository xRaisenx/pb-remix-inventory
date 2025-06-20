// app/routes/app.settings.tsx


import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  Banner,
  Checkbox,
  BlockStack,
  Divider,
} from '@shopify/polaris';
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";
import { z } from "zod";

// Import Shop type from our own types file instead of @prisma/client
import type { Shop } from "~/types";

// --- Zod Schemas ---
const SettingsSchema = z.object({
  lowStockThreshold: z.coerce.number().int().min(0, "Threshold must be non-negative.").optional(),
  emailForNotifications: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  enableEmailNotifications: z.preprocess((val) => val === "on", z.boolean()).optional(),
  slackWebhookUrl: z.string().url({ message: "Invalid Slack Webhook URL." }).optional().or(z.literal('')),
  enableSlackNotifications: z.preprocess((val) => val === "on", z.boolean()).optional(),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  enableTelegramNotifications: z.preprocess((val) => val === "on", z.boolean()).optional(),
  whatsAppProviderInfo: z.string().optional(), // Individual fields for form
  whatsAppPhoneNumberId: z.string().optional(),
  whatsAppAccessToken: z.string().optional(),
  enableWhatsAppNotifications: z.preprocess((val) => val === "on", z.boolean()).optional(),
});

// --- Loader Data and Action Data Types ---
interface LoaderData {
  settings: Partial<Shop & { whatsAppApiCredentialsJson?: any }>; // Fields from Shop model + gemini status
  geminiApiKeySet: boolean;
  error?: string;
}

interface ActionData {
  errors?: Record<string, string[]>;
  success?: boolean;
  message?: string;
}

// --- Loader ---
export const loader = async ({ request }: LoaderFunctionArgs): Promise<ReturnType<typeof json<LoaderData>>> => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json({ settings: {}, geminiApiKeySet: !!process.env.GEMINI_API_KEY, error: "Shop not found." }, { status: 404 });
    }

    let whatsAppCreds = {};
    if (typeof shop.whatsAppApiCredentialsJson === 'string') {
      try {
        whatsAppCreds = JSON.parse(shop.whatsAppApiCredentialsJson);
      } catch (e) {
        console.error("Failed to parse WhatsApp credentials JSON:", e);
        // Keep whatsAppCreds as {} or handle error appropriately
      }
    }

    // Explicitly type the settings object for clarity if needed
    const typedSettings: Partial<Shop & { whatsAppApiCredentialsJson?: any }> = {
      ...shop,
      whatsAppApiCredentialsJson: whatsAppCreds, // Use parsed object
    };

    return json({
      settings: typedSettings,
      geminiApiKeySet: !!process.env.GEMINI_API_KEY,
    });
  } catch (e) {
    console.error("Settings loader error:", e);
    return json({ settings: {}, geminiApiKeySet: !!process.env.GEMINI_API_KEY, error: "Failed to load settings." }, { status: 500 });
  }
};

// --- Action ---
export const action = async ({ request }: ActionFunctionArgs): Promise<ReturnType<typeof json<ActionData>>> => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const formPayload = Object.fromEntries(formData);

  const validationResult = SettingsSchema.safeParse(formPayload);

  if (!validationResult.success) {
    return json({ errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
  }

  const {
    lowStockThreshold, emailForNotifications, enableEmailNotifications,
    slackWebhookUrl, enableSlackNotifications,
    telegramBotToken, telegramChatId, enableTelegramNotifications,
    whatsAppProviderInfo, whatsAppPhoneNumberId, whatsAppAccessToken, enableWhatsAppNotifications
  } = validationResult.data;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json({ errors: { form: ["Shop not found."] } }, { status: 404 });
    }

    const whatsAppCredentials = (enableWhatsAppNotifications && (whatsAppProviderInfo || whatsAppPhoneNumberId || whatsAppAccessToken))
      ? JSON.stringify({
          providerInfo: whatsAppProviderInfo || "",
          phoneNumberId: whatsAppPhoneNumberId || "",
          accessToken: whatsAppAccessToken || ""
        })
      : null;

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        lowStockThreshold: lowStockThreshold ?? shop.lowStockThreshold, // Keep existing if not provided or null
        emailForNotifications: enableEmailNotifications ? (emailForNotifications || null) : null,
        slackWebhookUrl: enableSlackNotifications ? (slackWebhookUrl || null) : null,
        telegramBotToken: enableTelegramNotifications ? (telegramBotToken || null) : null,
        telegramChatId: enableTelegramNotifications ? (telegramChatId || null) : null,
        whatsAppApiCredentialsJson: whatsAppCredentials,
      },
    });
    return json({ success: true, message: "Settings saved successfully!" });
  } catch (error) {
    console.error("Error saving settings:", error);
    return json({ errors: { form: ["Failed to save settings."] } }, { status: 500 });
  }
};

// --- Component ---
export default function SettingsPage() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const { settings = {}, geminiApiKeySet, error: loaderError } = loaderData || {};

  // Ensure initialWhatsAppCreds is an object, even if whatsAppApiCredentialsJson is null/undefined from DB
  const initialWhatsAppCreds = typeof settings.whatsAppApiCredentialsJson === 'object' && settings.whatsAppApiCredentialsJson !== null
    ? settings.whatsAppApiCredentialsJson
    : {};


  if (loaderError) {
    return <Page title="Settings"><Banner title="Error" tone="critical">{loaderError}</Banner></Page>;
  }

  return (
    <Page title="Application Settings">
      <Form method="post">
        <BlockStack gap="600">
          {actionData?.message && <Banner title={actionData.success ? "Success" : "Error"} tone={actionData.success ? "success" : "critical"} onDismiss={() => {}}>{actionData.message}</Banner>}
          {actionData?.errors && <Banner title="Form Error" tone="critical">{actionData.errors.form.join(', ')}</Banner>}

          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">Alert Configuration</Text>
              <FormLayout>
              <TextField
                label="Low Stock Threshold"
                type="number"
                name="lowStockThreshold"
                value={settings.lowStockThreshold?.toString() ?? "10"}
                helpText="Notify when stock quantity for a product in a warehouse falls below this number."
                autoComplete="off"
                error={actionData?.errors?.lowStockThreshold}
              />
            </FormLayout>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">AI Configuration</Text>
              <Text as="p" variant="bodyMd">
              Gemini API Key Status: {geminiApiKeySet ?
                <Text as="span" tone="success">Set via environment variable</Text> :
                <Text as="span" tone="critical">Not Set (AI features may be limited)</Text>}
            </Text>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">Notification Channels</Text>
              <BlockStack gap="400">
              {/* Email */}
              <Checkbox
                label="Enable Email Notifications"
                name="enableEmailNotifications"
                checked={!!settings.emailForNotifications}
                onChange={(checked) => {/* Handle change if needed */}}
              />
              <TextField
                label="Recipient Email Address"
                name="emailForNotifications"
                type="email"
                value={settings.emailForNotifications ?? ""}
                autoComplete="off"
                error={actionData?.errors?.emailForNotifications}
              />
              <Divider />
              {/* Slack */}
              <Checkbox
                label="Enable Slack Notifications"
                name="enableSlackNotifications"
                checked={!!settings.slackWebhookUrl}
                onChange={(checked) => {/* Handle change if needed */}}
              />
              <TextField label="Slack Webhook URL" name="slackWebhookUrl" type="url" value={settings.slackWebhookUrl ?? ""} autoComplete="off" error={actionData?.errors?.slackWebhookUrl} />
              <Divider />
              {/* Telegram */}
              <Checkbox
                label="Enable Telegram Notifications"
                name="enableTelegramNotifications"
                checked={!!initialWhatsAppCreds.providerInfo || !!initialWhatsAppCreds.phoneNumberId || !!initialWhatsAppCreds.accessToken}
                onChange={(checked) => {/* Handle change if needed */}}
              />
              <TextField label="Telegram Bot Token" name="telegramBotToken" value={settings.telegramBotToken ?? ""} autoComplete="off" error={actionData?.errors?.telegramBotToken} />
              <TextField label="Telegram Chat ID" name="telegramChatId" value={settings.telegramChatId ?? ""} autoComplete="off" error={actionData?.errors?.telegramChatId} />
              <Divider />
              {/* WhatsApp */}
              <Checkbox
                label="Enable WhatsApp Notifications"
                name="enableWhatsAppNotifications"
                checked={!!initialWhatsAppCreds.providerInfo || !!initialWhatsAppCreds.phoneNumberId || !!initialWhatsAppCreds.accessToken}
                onChange={(checked) => {/* Handle change if needed */}}
              />
              <TextField label="WhatsApp Provider Info (Optional)" name="whatsAppProviderInfo" value={initialWhatsAppCreds.providerInfo ?? ""} autoComplete="off" error={actionData?.errors?.whatsAppProviderInfo} />
              <TextField label="WhatsApp Phone Number ID" name="whatsAppPhoneNumberId" value={initialWhatsAppCreds.phoneNumberId ?? ""} autoComplete="off" error={actionData?.errors?.whatsAppPhoneNumberId} />
              <TextField label="WhatsApp Access Token" name="whatsAppAccessToken" type="password" value={initialWhatsAppCreds.accessToken ?? ""} autoComplete="off" error={actionData?.errors?.whatsAppAccessToken} />
            </BlockStack>
            </BlockStack>
          </Card>
          
          <Button variant="primary" fullWidth disabled={isSubmitting}>
            Save Settings
          </Button>
        </BlockStack>
      </Form>
    </Page>
  );
}
