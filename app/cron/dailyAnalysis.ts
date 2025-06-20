// app/cron/dailyAnalysis.ts

import cron from 'node-cron';
import prisma from '~/db.server';
import { performDailyProductSync } from '~/dailyAnalysis';
import { getDemandForecast } from '../services/ai.server';

async function sendEmailNotification(to: string, subject: string, body: string) {
  console.log("--- SIMULATING EMAIL SEND ---");
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);
  console.log("--- END OF SIMULATED EMAIL ---");
  // In a real implementation, this would use an email library like Nodemailer.
  // For now, it just logs to the console.
  return Promise.resolve();
}

// Define the cron schedule (e.g., daily at midnight)
// Adjust as needed: second(opt) minute hour day(month) month day(week)
const CRON_SCHEDULE = '0 0 * * *'; // Midnight every day

// In-memory cache for rate limiting notifications across all shops within a single cron run.
// Key: shopId-productId, Value: timestamp of last notification logged.
const lowStockNotificationTimestamps: Record<string, number> = {};
const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

/**
 * @function runDailyTasks
 * @description Main function executed by the cron job. It performs daily synchronization of Shopify products,
 * fetches AI demand forecasts, stores them, checks for low stock items, and simulates sending notifications.
 */
async function runDailyTasks() {
  console.log(`[CRON JOB - ${new Date().toISOString()}] Starting daily tasks routine...`);

  // Section 1: Synchronize Shopify products with the local database.
  // This step ensures that local product data is up-to-date before performing analysis.
  console.log("[CRON JOB] Initiating daily product synchronization...");
  try {
    await performDailyProductSync();
    console.log("[CRON JOB] Daily product synchronization completed successfully.");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[CRON JOB] Critical error during daily product sync: ${errorMessage}`, error);
    // Depending on severity, might decide to return or throw to stop further execution.
    // For now, it logs and continues to other tasks.
  }

  // Section 2: Perform AI Demand Forecasting and Low Stock Checks for each active shop.
  console.log("[CRON JOB] Starting AI demand forecasting and low stock checks for all relevant shops...");
  try {
    const shops = await prisma.shop.findMany({
      where: { accessToken: { not: undefined } }, // Only process shops with an access token (active)
      select: {
        id: true,
        shop: true,
        lowStockThreshold: true,
        emailForNotifications: true,
        slackWebhookUrl: true,
        // Assuming telegramBotToken and telegramChatId are for Telegram, not explicitly asked but good to fetch
        // whatsAppApiCredentialsJson for WhatsApp, not explicitly asked
        notificationSettings: { // Fetch related notification settings
          select: {
            email: true,
            emailAddress: true, // Ensure this line is added/present
            slack: true,
            telegram: true, // Example: if you plan to support it
            // mobilePush: true, // Example
            // frequency: true, // Might be useful for more advanced rate limiting or scheduling
          }
        },
        // products field is not directly needed here for the shop query itself,
        // as individual products are fetched later per shop.
        // products: { select: { id: true, title: true } } // Removed to avoid overfetching if not used at this level
      }
    });

    if (shops.length === 0) {
      console.log("[CRON JOB] No active shops found to process for AI analysis.");
      // No return here, let it finish the "Daily tasks finished" log.
    } else {
        console.log(`[CRON JOB] Starting AI demand forecasting and low stock checks for ${shops.length} shops.`);

        for (const shop of shops) {
          console.log(`[CRON JOB] Processing shop: ${shop.shop} (ID: ${shop.id})`);
          const lowStockThreshold = shop.lowStockThreshold ?? 10;

          // AI Demand Forecasting for products of the current shop
          const shopProducts = await prisma.product.findMany({
            where: { shopId: shop.id },
            take: 100,
            select: { id: true, title: true }
          });
          
          if (shopProducts.length > 0) {
            console.log(`[CRON JOB] -- Fetching AI demand forecasts for up to ${shopProducts.length} products in ${shop.shop}...`);
            
            for (const product of shopProducts) {
              try {
                const forecastString = await getDemandForecast(product.id);
                const parsedDemand = parseFloat(forecastString);

                if (isNaN(parsedDemand)) {
                  console.error(`[CRON JOB] -- Failed to parse forecast string to number for product ${product.id}: "${forecastString}"`);
                  continue;
                }

                console.log(`[CRON JOB] -- Parsed forecast for '${product.title}' (PrismaID: ${product.id}): Demand=${parsedDemand}`);

                await prisma.demandForecast.create({
                  data: {
                    productId: product.id,
                    predictedDemand: parsedDemand, // Use parsedDemand directly
                    periodDays: 30,
                    confidenceScore: 0.5, // Default confidence score
                  },
                });
                console.log(`[CRON JOB] -- Successfully stored AI demand forecast for product '${product.title}' (PrismaID: ${product.id}).`);

              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[CRON JOB] -- Error processing or storing forecast for product ${product.title} (PrismaID: ${product.id}): ${errorMessage}`, error);
              }
            }
          } else {
            console.log(`[CRON JOB] -- No products found for shop ${shop.shop} (ID: ${shop.id}) to perform AI forecasting.`);
          }

          // Perform Low Stock Check based on local Prisma data.
          // This uses the shop's configured lowStockThreshold.
          const lowStockInventories = await prisma.inventory.findMany({
            where: {
              warehouse: { shopId: shop.id },
              quantity: { lt: lowStockThreshold }, // Items with quantity less than threshold
            },
            include: {
              product: { select: { id: true, title: true } }, // Ensure product ID is fetched for notification key
              warehouse: { select: { name: true } },
            },
            take: 100, // Limit to prevent excessive processing/logging if many items are low
          });

          if (lowStockInventories.length > 0) {
            console.warn(`[CRON JOB] -- Low stock alert for shop ${shop.shop} (ID: ${shop.id}). Threshold: <${lowStockThreshold}. Found ${lowStockInventories.length} items.`);

            // Iterate over low stock items and simulate notifications.
            // Implements rate limiting to avoid spamming.
            for (const item of lowStockInventories) {
              const { product, warehouse, quantity } = item;
              const notificationKey = `${shop.id}-${product.id}`; // Unique key for rate limiting: shopId-productId
              const now = Date.now();

              console.warn(`[CRON JOB] -- -- Low Stock Item: Product '${product.title}' (ID: ${product.id}), Warehouse: '${warehouse.name}', Quantity: ${quantity}`);

              // Rate Limiting Check: Skip if a notification for this item was logged recently.
              const lastNotificationTime = lowStockNotificationTimestamps[notificationKey];
              if (lastNotificationTime && (now - lastNotificationTime < TWENTY_FOUR_HOURS_IN_MS)) {
                console.log(`[INFO] Low stock notification for product '${product.title}' (ID: ${product.id}) in shop ${shop.shop} would be rate limited (last sent: ${new Date(lastNotificationTime).toISOString()}).`);
                continue;
              }

              const settings = shop.notificationSettings;
              if (!settings) {
                console.warn(`[CRON JOB] -- -- No notification settings found for shop ${shop.shop} (ID: ${shop.id}). Skipping notification dispatch for this item.`);
                continue;
              }

              let notificationSentOrAttempted = false;

              // Simulate Email Notification (Updated Logic)
              if (settings.email) {
                notificationSentOrAttempted = true;
                const recipientEmail = settings.emailAddress || shop.emailForNotifications;

                if (recipientEmail) {
                  const subject = `Low Stock Alert: ${product.title}`;
                  const body = `Hello,
This is an automated alert from Planet Beauty AI Inventory.
The product '${product.title}' (ID: ${product.id}) is low on stock at warehouse '${warehouse.name}'.
Current quantity: ${quantity}.
Low stock threshold: <${lowStockThreshold}.

Please review your inventory.

Thank you,
Planet Beauty AI Inventory App`;

                  await sendEmailNotification(recipientEmail, subject, body);
                  // Log success of simulated send if desired, e.g.:
                  console.log(`[INFO] Simulated email notification sent to ${recipientEmail} for low stock of '${product.title}'.`);
                } else {
                  console.warn(`[WARN] Email notification enabled for shop ${shop.shop} (ID: ${shop.id}), but no email address is configured in NotificationSettings or Shop settings.`);
                }
              }

              // Simulate Slack Notification
              if (settings.slack) {
                notificationSentOrAttempted = true;
                if (shop.slackWebhookUrl) {
                  console.log(`[INFO] [Notification Simulation] Would send SLACK via webhook ${shop.slackWebhookUrl} for low stock of '${product.title}' (ID: ${product.id}, Qty: ${quantity}) at warehouse '${warehouse.name}' in shop ${shop.shop}.`);
                } else {
                  console.warn(`[WARN] Slack notification enabled for shop ${shop.shop} (ID: ${shop.id}), but no 'slackWebhookUrl' is configured.`);
                }
              }

              // Placeholder for other notification channels (e.g., Telegram, WhatsApp)
              // if (settings.telegram && shop.telegramBotToken && shop.telegramChatId) { ... }

              // Update timestamp for rate limiting if a notification was relevant for this item.
              if (notificationSentOrAttempted) {
                lowStockNotificationTimestamps[notificationKey] = now;
              }
            }
          } else {
            console.log(`[CRON JOB] -- No low stock items found for shop ${shop.shop} (ID: ${shop.id}) based on threshold <${lowStockThreshold}.`);
          }
        }
        console.log("[CRON JOB] AI demand forecasting and low stock checks finished for all processed shops.");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[CRON JOB] Error during AI analysis or low stock checks phase: ${errorMessage}`, error);
  }
  console.log(`[CRON JOB - ${new Date().toISOString()}] Daily tasks routine finished.`);
}

// Cron Job Scheduling:
// This section schedules the `runDailyTasks` function to execute based on CRON_SCHEDULE.
// It only runs if the environment is not 'test'.
// The cron job is configured to run in the UTC timezone.
if (process.env.NODE_ENV !== 'test') {
  cron.schedule(CRON_SCHEDULE, runDailyTasks, {
    timezone: "UTC",
  });
  console.log(`[CRON INIT] Daily analysis job scheduled with pattern: "${CRON_SCHEDULE}" (Timezone: UTC)`);
} else {
  console.log("[CRON INIT] Cron job scheduling skipped in test environment (NODE_ENV=test).");
}

// Exporting a constant to indicate cron job setup status, mainly for import side effects or testing.
export const isCronJobScheduled = process.env.NODE_ENV !== 'test';
