import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";

export const loader: LoaderFunction = async () => {
  try {
    // Simple lightweight query
    await prisma.$queryRaw`SELECT 1`;
    return json({ ok: true });
  } catch (error) {
    console.error("Warmup query failed", error);
    return json({ ok: false }, { status: 500 });
  }
};
