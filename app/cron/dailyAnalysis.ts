import prisma from '~/db.server';
import { performDailyProductSync } from '~/dailyAnalysis';
import { runPredictiveAnalysis } from '~/services/predictive-velocity.service';
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
      where: { shop: shop.shop, isOnline: false, accessToken: { not: "" } },
      orderBy: { expires: 'desc' },
    });

    if (!offlineSessionRecord?.accessToken) {
      console.warn(`[CRON JOB] No valid offline session found for ${shop.shop}. Skipping sync.`);
      continue;
    }

    // Reconstruct a session object for the API client
    const session = new Session({
      id: offlineSessionRecord.id,
      shop: shop.shop,
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

    // NEW: Run predictive sales velocity analysis
    if (shop.aiPredictionsEnabled) {
      try {
        console.log(`[CRON JOB] Running predictive velocity analysis for ${shop.shop}...`);
        const analysisResult = await runPredictiveAnalysis(shop.id);
        
        if (analysisResult.success) {
          console.log(`[CRON JOB] Predictive analysis completed for ${shop.shop}:`);
          console.log(`  - Products analyzed: ${analysisResult.productsAnalyzed}`);
          console.log(`  - Alerts generated: ${analysisResult.alertsGenerated}`);
          console.log(`  - Critical alerts: ${analysisResult.criticalAlerts}`);
          console.log(`  - Fast-selling products: ${analysisResult.summary.fastSellingProducts}`);
          console.log(`  - Imminent stockouts: ${analysisResult.summary.imminentStockouts}`);
          console.log(`  - Velocity spikes: ${analysisResult.summary.velocitySpikes}`);
        } else {
          console.error(`[CRON JOB] Predictive analysis failed for ${shop.shop}: ${analysisResult.error}`);
        }
      } catch (error) {
        console.error(`[CRON JOB] Error during predictive analysis for ${shop.shop}:`, error);
      }
    } else {
      console.log(`[CRON JOB] AI predictions disabled for ${shop.shop}, skipping predictive analysis.`);
    }

    // ... (rest of the AI forecasting and low stock check logic remains the same)
  }
  console.log(`[CRON JOB - ${new Date().toISOString()}] Daily tasks routine finished.`);
}

// The cron.schedule call is removed.
