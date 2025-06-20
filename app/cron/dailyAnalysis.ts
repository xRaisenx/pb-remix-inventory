// app/cron/dailyAnalysis.ts
// Fix: Add type for node-cron

import cron from 'node-cron';
import prisma from '~/db.server'; // Assuming db.server.ts exports prisma correctly
import { performDailyProductSync } from '~/dailyAnalysis'; // The product sync function
import { getDemandForecast } from '../services/ai.server'; // AI demand forecast function



// Define the cron schedule (e.g., daily at midnight)
// Adjust as needed: second(opt) minute hour day(month) month day(week)
const CRON_SCHEDULE = '0 0 * * *'; // Midnight every day

async function runDailyTasks() {
  console.log(`[CRON JOB - ${new Date().toISOString()}] Starting daily tasks...`);

  // 1. Sync Shopify products to local DB
  try {
    console.log(`[CRON JOB] Starting daily product sync...`);
    await performDailyProductSync();
    console.log(`[CRON JOB] Daily product sync finished.`);
  } catch (error) {
    console.error(`[CRON JOB] Error during daily product sync:`, error);
  }

  // 2. Perform AI Demand Forecasting and Low Stock Checks for each shop
  try {
    
    const shops = await prisma.shop.findMany({
      
      where: { accessToken: { not: undefined } }, // Only process shops with an access token (active)
      select: { id: true, shop: true, lowStockThreshold: true, products: { select: { id: true, title: true } } }
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
                // product.id here is the Prisma Product ID (UUID)
                const forecast = await getDemandForecast(product.id);
                console.log(`[CRON JOB] -- Forecast for '${product.title}' (PrismaID: ${product.id}): ${forecast.substring(0, 100)}...`); // Log snippet
                // TODO: Store this forecast (e.g., new Prisma model or update Product model)
              } catch (error: any) {
                console.error(`[CRON JOB] -- Error getting forecast for product ${product.title} (PrismaID: ${product.id}):`, error.message);
              }
            }
          } else {
            console.log(`[CRON JOB] -- No products found for shop ${shop.shop} to forecast.`);
          }

          // Basic Low Stock Check (based on local Prisma data)
          const lowStockInventories = await prisma.inventory.findMany({
            where: {
              warehouse: { shopId: shop.id },
              quantity: { lt: lowStockThreshold },
            },
            include: {
              product: { select: { title: true } },
              warehouse: { select: { name: true } },
            },
            take: 100, // Limit to avoid excessive logging if many items are low
          });

          if (lowStockInventories.length > 0) {
            console.warn(`[CRON JOB] -- Low stock alert for shop ${shop.shop} (Threshold: <${lowStockThreshold}):`);
            lowStockInventories.forEach((item: {
              product: { title: string };
              warehouse: { name: string };
              quantity: number;
            }) => {
              console.warn(`[CRON JOB] -- -- Product: '${item.product.title}', Warehouse: '${item.warehouse.name}', Quantity: ${item.quantity}`);
            });
            // TODO: Trigger actual notifications here based on shop settings (email, Slack, etc.)
            // This would involve fetching shop.emailForNotifications, shop.slackWebhookUrl etc.
            // and using appropriate notification services.
          } else {
            console.log(`[CRON JOB] -- No low stock items found for shop ${shop.shop} based on threshold <${lowStockThreshold}.`);
          }
        }
        console.log(`[CRON JOB] AI demand forecasting and low stock checks finished for all processed shops.`);
    }

  } catch (error) {
    console.error(`[CRON JOB] Error during AI analysis or low stock checks:`, error);
  }
  console.log(`[CRON JOB - ${new Date().toISOString()}] Daily tasks finished.`);
}

// Schedule the job
// Ensure this file is imported once in your application lifecycle, e.g., in entry.server.ts or a similar setup file.
// The cron job will start as soon as this module is loaded.
if (process.env.NODE_ENV !== 'test') { // Avoid running cron during tests
    cron.schedule(CRON_SCHEDULE, runDailyTasks, {
      timezone: "UTC", // Or your preferred timezone
    });
    console.log(`[CRON INIT] Daily analysis job scheduled with pattern: ${CRON_SCHEDULE} (Timezone: UTC)`);
} else {
    console.log("[CRON INIT] Cron job scheduling skipped in test environment.");
}


// Export something to make it a module if needed by import mechanisms,
// or this file can just be imported for its side effect of scheduling.
export const isCronJobScheduled = true; // Simple export for module recognition
