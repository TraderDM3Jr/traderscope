import { db } from "@/db";
import { protectionSettings, riskEvents, alerts } from "@/db/schema";
import { and, eq, gte, isNull, desc } from "drizzle-orm";
import { sendAlert } from "@/lib/notify";

export type Action = "NONE" | "WARNING" | "TRIM_WORST" | "KILL_ALL";

type Settings = {
  dailyLossLimitUsd: number;
  warningPct: number;
  trimPct: number;
  killPct: number;
  ackTimeoutSeconds: number;
};

export type RiskResult = {
  enabled: boolean;
  dailyLossUsd: number;
  dailyLossPct: number; // % of the dollar limit
  level: "none" | "warning" | "trim" | "kill";
  action: Action;
  ticket: string | null; // worst-losing open position ticket (for TRIM_WORST)
  deadline: string | null; // ISO of ack deadline if a warning is open
};

const DEFAULT: Settings = {
  dailyLossLimitUsd: 0,
  warningPct: 60,
  trimPct: 80,
  killPct: 95,
  ackTimeoutSeconds: 300,
};

/**
 * Evaluate the account's auto-protection state on each ingest tick.
 *
 * Logic:
 *  - Compute daily loss ($ and % of the trader's dollar limit).
 *  - Determine the level (none/warning/trim/kill).
 *  - Warning fires a Discord alert and starts a grace timer (ackTimeoutSeconds).
 *  - If the trader does NOT acknowledge the warning in time, the system
 *    AUTO-EXECUTES: trim the worst trade at trim%, kill all at kill%.
 *  - The returned `action` is read by the EA, which actually closes trades.
 */
export async function evaluateRisk(params: {
  accountId: number;
  equity: number;
  todayStartBalance: number;
  openPositions: { ticket: string; profit: string }[];
}): Promise<RiskResult> {
  const { accountId, equity, todayStartBalance, openPositions } = params;

  const rows = await db
    .select()
    .from(protectionSettings)
    .where(eq(protectionSettings.accountId, accountId))
    .limit(1);
  const s: Settings = rows.length
    ? {
        dailyLossLimitUsd: Number(rows[0].dailyLossLimitUsd),
        warningPct: Number(rows[0].warningPct),
        trimPct: Number(rows[0].trimPct),
        killPct: Number(rows[0].killPct),
        ackTimeoutSeconds: rows[0].ackTimeoutSeconds,
      }
    : DEFAULT;

  const base: RiskResult = {
    enabled: rows.length ? rows[0].enabled : false,
    dailyLossUsd: 0,
    dailyLossPct: 0,
    level: "none",
    action: "NONE",
    ticket: null,
    deadline: null,
  };

  if (!base.enabled || s.dailyLossLimitUsd <= 0) return base;

  const dailyLossUsd = Math.max(0, todayStartBalance - equity);
  const dailyLossPct = (dailyLossUsd / s.dailyLossLimitUsd) * 100;
  base.dailyLossUsd = dailyLossUsd;
  base.dailyLossPct = dailyLossPct;

  let level: RiskResult["level"] = "none";
  if (dailyLossPct >= s.killPct) level = "kill";
  else if (dailyLossPct >= s.trimPct) level = "trim";
  else if (dailyLossPct >= s.warningPct) level = "warning";
  base.level = level;

  const now = new Date();

  // Find an open warning event (awaiting acknowledgement)
  const open = await db
    .select()
    .from(riskEvents)
    .where(
      and(
        eq(riskEvents.accountId, accountId),
        eq(riskEvents.status, "open")
      )
    )
    .orderBy(desc(riskEvents.firedAt))
    .limit(1);
  const openEvent = open[0] ?? null;

  // --- Kill takes priority, always ---
  if (level === "kill") {
    base.action = "KILL_ALL";
    if (openEvent) {
      await db.update(riskEvents).set({ status: "executed", actionTaken: "KILL_ALL", auto: true }).where(eq(riskEvents.id, openEvent.id));
    }
    await sendAlert(`🛑 KILL ALL triggered on account ${accountId}: daily loss ${dailyLossPct.toFixed(1)}% of limit $${s.dailyLossLimitUsd}. All positions closed.`);
    return base;
  }

  // --- Trim level ---
  if (level === "trim") {
    const worst = [...openPositions].sort((a, b) => Number(a.profit) - Number(b.profit))[0];
    base.ticket = worst ? worst.ticket : null;
    base.action = "TRIM_WORST";
    if (openEvent) {
      await db.update(riskEvents).set({ status: "executed", actionTaken: "TRIM_WORST", auto: true }).where(eq(riskEvents.id, openEvent.id));
    }
    await sendAlert(`✂️ AUTO-TRIM on account ${accountId}: daily loss ${dailyLossPct.toFixed(1)}% of $${s.dailyLossLimitUsd}. Worst losing position closed.`);
    return base;
  }

  // --- Warning level ---
  if (level === "warning") {
    if (!openEvent) {
      const deadline = new Date(now.getTime() + s.ackTimeoutSeconds * 1000);
      const [ev] = await db
        .insert(riskEvents)
        .values({
          accountId,
          level: "warning",
          status: "open",
          ackDeadline: deadline,
        })
        .returning({ id: riskEvents.id });
      base.deadline = deadline.toISOString();
      await sendAlert(`⚠️ WARNING on account ${accountId}: daily loss ${dailyLossPct.toFixed(1)}% of $${s.dailyLossLimitUsd} (>= ${s.warningPct}%). Acknowledge in the dashboard within ${s.ackTimeoutSeconds}s or the auto-protection will engage.`);
    } else {
      base.deadline = openEvent.ackDeadline ? openEvent.ackDeadline.toISOString() : null;
      // Timeout: auto-escalate to TRIM if exceeded
      const exceeded = openEvent.ackDeadline && new Date(openEvent.ackDeadline) <= now;
      if (exceeded) {
        const worst = [...openPositions].sort((a, b) => Number(a.profit) - Number(b.profit))[0];
        base.ticket = worst ? worst.ticket : null;
        base.action = "TRIM_WORST";
        await db.update(riskEvents).set({ status: "executed", actionTaken: "TRIM_WORST", auto: true }).where(eq(riskEvents.id, openEvent.id));
        await sendAlert(`⏱️ Grace period expired on account ${accountId}: no acknowledgement. AUTO-TRIM engaged (worst losing position closed).`);
      }
    }
    return base;
  }

  // --- Below warning: nothing to do, close any stale open warning ---
  if (openEvent) {
    await db.update(riskEvents).set({ status: "expired" }).where(eq(riskEvents.id, openEvent.id));
  }
  return base;
}

export async function getProtectionState(accountId: number) {
  const rows = await db
    .select()
    .from(protectionSettings)
    .where(eq(protectionSettings.accountId, accountId))
    .limit(1);
  const events = await db
    .select()
    .from(riskEvents)
    .where(eq(riskEvents.accountId, accountId))
    .orderBy(desc(riskEvents.firedAt))
    .limit(10);
  return {
    settings: rows[0]
      ? {
          enabled: rows[0].enabled,
          dailyLossLimitUsd: Number(rows[0].dailyLossLimitUsd),
          warningPct: Number(rows[0].warningPct),
          trimPct: Number(rows[0].trimPct),
          killPct: Number(rows[0].killPct),
          ackTimeoutSeconds: rows[0].ackTimeoutSeconds,
        }
      : null,
    events: events.map((e) => ({
      id: e.id,
      level: e.level,
      status: e.status,
      firedAt: e.firedAt.toISOString(),
      ackDeadline: e.ackDeadline ? e.ackDeadline.toISOString() : null,
      actionTaken: e.actionTaken,
      auto: e.auto,
    })),
  };
}

export async function acknowledgeRisk(accountId: number) {
  await db
    .update(riskEvents)
    .set({ status: "acknowledged", ackedAt: new Date() })
    .where(and(eq(riskEvents.accountId, accountId), eq(riskEvents.status, "open")));
  return { ok: true };
}
