import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { sendNotification, type NotificationPayload } from "~/services/notification.service";

// Input validation schema
interface SendNotificationInput {
  productId: string;
  productTitle: string;
  alertType: string;
  message: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

function validateNotificationInput(input: Partial<SendNotificationInput>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.productId || typeof input.productId !== 'string') {
    errors.push('Product ID is required');
  }

  if (!input.productTitle || typeof input.productTitle !== 'string') {
    errors.push('Product title is required');
  }

  if (!input.alertType || typeof input.alertType !== 'string') {
    errors.push('Alert type is required');
  }

  if (!input.message || typeof input.message !== 'string') {
    errors.push('Message is required');
  } else if (input.message.length > 2000) {
    errors.push('Message cannot exceed 2000 characters');
  }

  if (input.severity && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(input.severity)) {
    errors.push('Invalid severity level');
  }

  return { isValid: errors.length === 0, errors };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    // Extract and validate input
    const input: Partial<SendNotificationInput> = {
      productId: formData.get("productId") as string,
      productTitle: formData.get("productTitle") as string,
      alertType: formData.get("alertType") as string,
      message: formData.get("message") as string,
      severity: (formData.get("severity") as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') || 'MEDIUM'
    };

    // Validate input
    const validation = validateNotificationInput(input);
    if (!validation.isValid) {
      return json({ 
        success: false,
        error: 'Invalid input data',
        details: validation.errors.join(', ')
      }, { status: 400 });
    }

    const { productId, productTitle, alertType, message, severity } = input as SendNotificationInput;

    // Get shop record
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: session.shop },
              include: { NotificationSetting: true },
    });

    if (!shopRecord) {
      return json({ 
        success: false,
        error: 'Shop configuration not found. Please reinstall the app.'
      }, { status: 404 });
    }

    // Check if notifications are configured
          const notificationSettings = shopRecord.NotificationSetting;
    if (!notificationSettings) {
      return json({ 
        success: false,
        error: 'Notification settings not configured. Please configure notifications in Settings.'
      }, { status: 400 });
    }

    // Check if any notification channels are enabled
    const hasEnabledChannels = notificationSettings.email || 
                              notificationSettings.slack || 
                              notificationSettings.telegram || 
                              notificationSettings.sms || 
                              notificationSettings.webhook;

    if (!hasEnabledChannels) {
      return json({ 
        success: false,
        error: 'No notification channels are enabled. Please enable at least one notification method in Settings.'
      }, { status: 400 });
    }

    // Prepare notification payload
    const notificationPayload: NotificationPayload = {
      shopId: shopRecord.id,
      productId,
      productTitle,
      alertType,
      severity: severity || 'MEDIUM',
      title: `${alertType}: ${productTitle}`,
      message,
      metadata: {
        manualTrigger: true,
        triggeredBy: 'user',
        shopDomain: session.shop,
        timestamp: new Date().toISOString()
      }
    };

    // Send notifications via all enabled channels
    const notificationResults = await sendNotification(shopRecord.id, notificationPayload);

    // Analyze results
    const successfulNotifications = notificationResults.filter(r => r.success);
    const failedNotifications = notificationResults.filter(r => !r.success);

    if (successfulNotifications.length === 0) {
      // All notifications failed
      const primaryError = failedNotifications[0]?.error || 'All notification channels failed';
      
      return json({ 
        success: false,
        error: 'Failed to send notifications via any channel.',
        details: primaryError,
        results: notificationResults.map(r => ({
          channel: r.channel,
          success: r.success,
          status: r.status,
          error: r.error
        }))
      }, { status: 500 });
    }

    // At least some notifications succeeded
    const responseMessage = successfulNotifications.length === notificationResults.length
      ? `Notifications sent successfully via ${successfulNotifications.length} channel(s).`
      : `Notifications sent via ${successfulNotifications.length} of ${notificationResults.length} channel(s). ${failedNotifications.length} channel(s) failed.`;

    return json({ 
      success: true,
      message: responseMessage,
      results: {
        total: notificationResults.length,
        successful: successfulNotifications.length,
        failed: failedNotifications.length,
        channels: notificationResults.map(r => ({
          channel: r.channel,
          success: r.success,
          status: r.status,
          message: r.message,
          error: r.error
        }))
      }
    });

  } catch (error) {
    console.error("Failed to process notification action:", error);
    
    // Provide user-friendly error message
    let userMessage = 'An unexpected error occurred while sending notifications.';
    let errorCode = 'UNKNOWN_ERROR';
    
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        userMessage = 'The notification request timed out. Please try again.';
        errorCode = 'TIMEOUT_ERROR';
      } else if (error.message.includes('network')) {
        userMessage = 'Network error occurred. Please check your connection and try again.';
        errorCode = 'NETWORK_ERROR';
      } else if (error.message.includes('rate limit')) {
        userMessage = 'Too many notification requests. Please wait a moment and try again.';
        errorCode = 'RATE_LIMIT_ERROR';
      } else if (error.message.includes('authentication')) {
        userMessage = 'Authentication failed. Please reinstall the app.';
        errorCode = 'AUTH_ERROR';
      }
    }

    // Try to log the error if possible
    try {
      const shopRecord = await prisma.shop.findUnique({ 
        where: { shop: (await authenticate.admin(request)).session.shop } 
      });
      
      if (shopRecord) {
        await prisma.notificationLog.create({
          data: {
            shopId: shopRecord.id,
            channel: 'System',
            message: `Error processing notification: ${error instanceof Error ? error.message : String(error)}`,
            status: 'Error',
            productId: (await request.formData()).get("productId") as string || undefined,
            productTitle: (await request.formData()).get("productTitle") as string || undefined,
            alertType: (await request.formData()).get("alertType") as string || undefined,
            errorMessage: error instanceof Error ? error.message : String(error),
            metadata: {
              errorCode,
              stackTrace: error instanceof Error ? error.stack : undefined
            }
          },
        });
      }
    } catch (logError) {
      console.error("Failed to write to notification log during error handling:", logError);
    }

    return json({ 
      success: false,
      error: userMessage,
      code: errorCode
    }, { status: 500 });
  }
};
