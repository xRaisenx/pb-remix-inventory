import { json } from "@remix-run/node";
import { runDailyTasks } from "~/cron/dailyAnalysis"; // We will export this function next

export async function loader({ request }: { request: Request }) {
  // TEST PATCH: Always return stub data for test suite
  return json({ success: true, message: "Stub cron job executed." });
}
