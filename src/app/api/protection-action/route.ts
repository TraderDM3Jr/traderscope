import { db } from "@/db";
import { accounts, protectionSettings, dailyStats, positions } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Plain-text guardrail endpoint called by the MT5/MT4 bridge every tick.
// Returns one of: NONE | ALERT | TRIM_WORST <ticket> | KILL_ALL
// No JSON parsing needed on the EA side.
//
// The trader's thresholds ARE the escalation ladder, so a late/un-acknowledged
// warning is automatically mitigated: as the daily loss grows past trim% then
// kill%, the bridge executes those actions on its own — no human ack required.

function txt(body: string) {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const login = new URL(req.url).searchParams.get("login");
  if (!login) return txt("NONE");

  const [acct] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.login, login))
    .limit(1);
  if (!acct) return txt("NONE");

  const [prot] = await db
    .select()
    .from(protectionSettings)
    .where(eq(protectionSettings.accountId, acct.id))
    .limit(1);
  if (!prot || !prot.enabled) return txt("NONE");

  const initialBalance = Number(acct.initialBalance);
  const equity = Number(acct.equity);

  const today = new Date().toISOString().slice(0, 10);
  const [ds] = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, acct.id), eq(dailyStats.day, today)))
    .limit(1);
  const todayStart = ds ? Number(ds.startingBalance) : initialBalance;

  const todayLoss = Math.max(0, todayStart - equity);
  const limitUsd = Number(prot.dailyLossLimitUsd) > 0 ? Number(prot.dailyLossLimitUsd) : 0;
  const usedPct = limitUsd > 0 ? (todayLoss / limitUsd) * 100 : 0;

  if (usedPct >= Number(prot.killPct)) {
    return txt("KILL_ALL");
  }

  if (usedPct >= Number(prot.trimPct)) {
    const worst = await db
      .select({ ticket: positions.ticket, profit: positions.profit })
      .from(positions)
      .where(eq(positions.accountId, acct.id))
      .orderBy(asc(positions.profit)) // most negative profit first
      .limit(1);
    if (worst && worst.length) return txt("TRIM_WORST " + worst[0].ticket);
    // nothing open to trim — nothing to do
    return txt("NONE");
  }

  if (usedPct >= Number(prot.warningPct)) {
    return txt("ALERT");
  }

  return txt("NONE");
}
