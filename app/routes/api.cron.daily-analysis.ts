import { json } from "@remix-run/node";

export async function loader() {
  // Stub: cron endpoint is intentionally no-op in this build
  return json({ success: true, message: "Cron endpoint reachable." });
}
