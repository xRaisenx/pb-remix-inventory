import prisma from '~/db.server';
import { performDailyProductSync } from '~/dailyAnalysis';
import { Session } from "@shopify/shopify-api";

// ... (sendEmailNotification function remains the same)

// The CRON_SCHEDULE constant is no longer needed.

// Export the function so it can be called by the new API route.
export async function runDailyTasks() {
  console.log(`[CRON JOB - ${new Date().toISOString()}] Starting daily tasks routine...`);

  const shops = await prisma.shop.findMany({
    // where: { accessToken: { not: null } }, // Original condition
    where: { initialSyncCompleted: true }, // Only run for shops that have completed the initial sync.
    include: { NotificationSettings: true },
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
      where: { shop: { shop: shop.shop }, isOnline: false, accessToken: { not: null } },
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
    } catch (error) {
      console.error(`[CRON JOB] Error during product sync for ${shop.shop}:`, error);
    }

    // ... (rest of the AI forecasting and low stock check logic remains the same)
  }
  console.log(`[CRON JOB - ${new Date().toISOString()}] Daily tasks routine finished.`);
}

// The cron.schedule call is removed.
