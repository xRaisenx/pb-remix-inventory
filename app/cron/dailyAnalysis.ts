import prisma from '~/db.server';
import { performDailyProductSync } from '~/dailyAnalysis';
import { getDemandForecast } from '../services/ai.server';
import { Session } from "@shopify/shopify-api";

// ... (sendEmailNotification function remains the same)

// The CRON_SCHEDULE constant is no longer needed.

// Export the function so it can be called by the new API route.
export async function runDailyTasks() {
  console.log(`[CRON JOB - ${new Date().toISOString()}] Starting daily tasks routine...`);

  const shops = await prisma.shop.findMany({
    // where: { accessToken: { not: null } }, // Original condition
    where: { initialSyncCompleted: true }, // Only run for shops that have completed the initial sync.
    include: { notificationSettings: true },
  });

  if (shops.length === 0) {
    // console.log("[CRON JOB] No active shops found."); // Original message
    console.log("[CRON JOB] No active shops found with initial sync completed.");
    return;
  }

  for (const shop of shops) {
    console.log(`[CRON JOB] Processing shop: ${shop.shop}`);

    // Fetch a valid offline session to perform API calls
    const offlineSessionRecord = await prisma.session.findFirst({
      where: { shop: shop.shop, isOnline: false, accessToken: { not: null } },
      orderBy: { expires: 'desc' },
    });

    if (!offlineSessionRecord?.accessToken) {
      console.warn(`[CRON JOB] No valid offline session found for ${shop.shop}. Skipping sync.`);
      continue;
    }

    // Reconstruct a session object for the API client
    const session = new Session({
      id: offlineSessionRecord.id,
      shop: offlineSessionRecord.shop,
      state: offlineSessionRecord.state,
      isOnline: offlineSessionRecord.isOnline,
      accessToken: offlineSessionRecord.accessToken,
      scope: offlineSessionRecord.scope || '',
    });

    try {
      // Pass the authenticated session to the sync function
      await performDailyProductSync(shop.shop, session);
      console.log(`[CRON JOB] Product sync completed for ${shop.shop}.`);

      // AI Demand Forecasting for a subset of products
      console.log(`[CRON JOB] Starting AI demand forecasting for shop: ${shop.shop}`);
      try {
        // Fetch a few products to forecast (e.g., recently updated, high value, or specific status)
        // For demonstration, let's pick up to 3 products that might be 'Low' or 'Critical' or 'Trending'
        const productsToForecast = await prisma.product.findMany({
          where: {
            shopId: shop.id,
            OR: [
              { status: 'Low' },
              { status: 'Critical' },
              { trending: true },
            ],
          },
          take: 3, // Limit the number of products for forecasting in this cron job example
          orderBy: {
            updatedAt: 'desc', // Prioritize recently updated ones
          },
        });

        if (productsToForecast.length === 0) {
          console.log(`[CRON JOB] No specific products found for AI demand forecasting for shop: ${shop.shop}.`);
        } else {
          for (const product of productsToForecast) {
            try {
              console.log(`[CRON JOB] Requesting demand forecast for product: ${product.title} (ID: ${product.id})`);
              const forecast = await getDemandForecast(product.id);
              console.log(`[CRON JOB] AI Demand Forecast for ${product.title}: ${forecast}`);
              // Here you might store the forecast, log it to a specific system, or use it to trigger other actions.
              // For example, updating the product record with the forecast:
              // await prisma.product.update({ where: { id: product.id }, data: { aiForecast: forecast } });
            } catch (forecastError) {
              console.error(`[CRON JOB] Error generating demand forecast for product ${product.id} (${product.title}):`, forecastError);
            }
          }
        }
      } catch (aiError) {
        console.error(`[CRON JOB] Error during AI demand forecasting phase for shop ${shop.shop}:`, aiError);
      }

    } catch (error) {
      console.error(`[CRON JOB] Error during product sync for ${shop.shop}:`, error);
    }

    // ... (rest of the AI forecasting and low stock check logic remains the same)
    // Note: The original placeholder "... (rest of the AI forecasting and low stock check logic remains the same)"
    // might imply there was other logic here. The added block is new.
  }
  console.log(`[CRON JOB - ${new Date().toISOString()}] Daily tasks routine finished.`);
}

// The cron.schedule call is removed.
