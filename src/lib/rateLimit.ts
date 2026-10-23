import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

// Fixed-window limit kept in Postgres, so it holds across serverless instances.
// One atomic upsert per call: true = allowed, false = over the limit.
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const reset = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${reset})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${reset} ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  // Now and then, drop windows that ended over a day ago so the table stays small.
  if (Math.random() < 0.01) await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 86_400_000) } } }).catch(() => {});
  return Number(rows[0]?.count ?? 0) <= max;
}

// The caller's IP. On Vercel the platform sets x-forwarded-for, so clients can't spoof the first hop.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export const tooMany = (what = "That") => Response.json({ error: `${what}: too many tries. Wait a few minutes and try again.` }, { status: 429 });
