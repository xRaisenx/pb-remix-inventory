import cron from 'node-cron';
import prisma from '~/db.server';
import { performDailyProductSync } from '~/dailyAnalysis';
import { getDemandForecast } from '../services/ai.server';
import { Session } from "@shopify/shopify-api";

// ... (sendEmailNotification function remains the same)

const CRON_SCHEDULE = '0 0 * * *'; // Midnight every day

async function runDailyTasks() {
  console.log(`[CRON JOB - ${new Date().toISOString()}] Starting daily tasks routine...`);

  const shops = await prisma.shop.findMany({
    where: { accessToken: { not: null } },
    include: { notificationSettings: true },
  });

  if (shops.length === 0) {
    console.log("[CRON JOB] No active shops found.");
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
    } catch (error) {
      console.error(`[CRON JOB] Error during product sync for ${shop.shop}:`, error);
    }

    // ... (rest of the AI forecasting and low stock check logic remains the same)
  }
  console.log(`[CRON JOB - ${new Date().toISOString()}] Daily tasks routine finished.`);
}

if (process.env.NODE_ENV !== 'test') {
  cron.schedule(CRON_SCHEDULE, runDailyTasks, { timezone: "UTC" });
  console.log(`[CRON INIT] Daily analysis job scheduled: "${CRON_SCHEDULE}"`);
}
