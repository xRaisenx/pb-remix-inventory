import { json } from "@remix-run/node";
import { healthCheck, checkSessionTable } from "~/db.server";
import { validateEnvironmentVariables } from "~/utils/env-validation";

export async function loader() {
  const env = validateEnvironmentVariables();
  let db = { healthy: false as boolean, latency: 0 as number | undefined, error: undefined as string | undefined };
  let sessionsOk = false;

  try {
    const res = await healthCheck();
    db.healthy = res.healthy;
    db.latency = res.latency;
  } catch (e: any) {
    db.error = e?.message || String(e);
  }

  try {
    sessionsOk = await checkSessionTable();
  } catch {
    sessionsOk = false;
  }

  const embedded = (process.env.EMBEDDED_APP || 'true').toLowerCase() === 'true';

  return json({
    ok: env.isValid && db.healthy,
    env: { valid: env.isValid, errors: env.errors, warnings: env.warnings },
    db,
    sessions: { ok: sessionsOk },
    mode: { embedded },
    timestamp: new Date().toISOString(),
  });
}