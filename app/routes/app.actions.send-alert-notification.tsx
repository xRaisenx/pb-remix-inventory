import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const productId = formData.get("productId") as string;
  const productTitle = formData.get("productTitle") as string;
  const alertType = formData.get("alertType") as string;
  const message = formData.get("message") as string;

  if (!productId || !productTitle || !alertType || !message) {
    return json({ error: "Missing required parameters for notification." }, { status: 400 });
  }

  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: session.shop },
      include: { NotificationSettings: true },
    });

    if (!shopRecord) {
      return json({ error: "Shop not found." }, { status: 404 });
    }

    const notificationSettings = shopRecord.notificationSettings;
    let notificationSentViaChannel = false;
    let logStatus = "Failed";
    let logRecipient = null;

    if (notificationSettings?.email && notificationSettings.emailAddress) {
      console.log(
        `Simulating email to ${notificationSettings.emailAddress} for product ${productTitle} (ID: ${productId}) regarding ${alertType}: ${message}`
      );
      notificationSentViaChannel = true;
      logStatus = "Simulated";
      logRecipient = notificationSettings.emailAddress;
      await prisma.notificationLog.create({
        data: {
          shopId: shopRecord.id,
          channel: "Email",
          recipient: logRecipient,
          message: message,
          status: logStatus,
          productId: productId,
          productTitle: productTitle,
          alertType: alertType,
        },
      });
    }

    if (notificationSettings?.slack && notificationSettings.slackWebhookUrl) {
      console.log(
        `TODO: Send Slack notification for product ${productTitle} (ID: ${productId}) regarding ${alertType}: ${message} to ${notificationSettings.slackWebhookUrl}`
      );
      notificationSentViaChannel = true;
      // In a real app, status might be "Sent" after successful API call
      await prisma.notificationLog.create({
        data: {
          shopId: shopRecord.id,
          channel: "Slack",
          recipient: notificationSettings.slackWebhookUrl, // Or a channel ID if known
          message: message,
          status: "Simulated", // Or "Sent"
          productId: productId,
          productTitle: productTitle,
          alertType: alertType,
        },
      });
    }

    // Add other notification channels here (Telegram, Mobile Push) with similar console logs and logging

    if (!notificationSentViaChannel) {
      // Log a general failure if no channels were even attempted
      await prisma.notificationLog.create({
        data: {
          shopId: shopRecord.id,
          channel: "System",
          message: `No notification channels configured or enabled for alert type: ${alertType} for product: ${productTitle}`,
          status: "FailedConfiguration",
          productId: productId,
          productTitle: productTitle,
          alertType: alertType,
        },
      });
      return json({ error: "No notification channels configured or enabled for this alert type." }, { status: 400 });
    }

    return json({ success: true, message: "Notifications dispatched (simulated) and logged." });

  } catch (error) {
    console.error("Failed to process notification action:", error);
    // Log error to notification log as well, if possible (shopId might not be available if error is early)
    // This part might need more robust error handling for shopId
    try {
      const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
      if (shop) {
        await prisma.notificationLog.create({
          data: {
            shopId: shop.id,
            channel: "System",
            message: `Error processing notification: ${error instanceof Error ? error.message : String(error)}`,
            status: "Error",
            productId: productId,
            productTitle: productTitle,
            alertType: alertType,
          },
        });
      }
    } catch (logError) {
      console.error("Failed to write to notification log during error handling:", logError);
    }
    return json({ error: "Failed to send notifications due to a server error." }, { status: 500 });
  }
};
