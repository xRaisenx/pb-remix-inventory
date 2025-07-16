import { json } from "@remix-run/node";
import { runDailyTasks } from "~/cron/dailyAnalysis";

export async function loader({ request }: { request: Request }) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || request.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("Starting daily cron job via Vercel...");
    await runDailyTasks();
    console.log("Daily cron job finished successfully.");
    return json({ success: true, message: "Cron job executed." });
  } catch (error) {
    console.error("Error during Vercel cron job execution:", error);
    return json({ success: false, message: "Cron job failed.", error: (error as Error).message }, { status: 500 });
  }
}
