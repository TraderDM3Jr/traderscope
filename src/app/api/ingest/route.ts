import { db } from "@/db";
import {
  accounts,
  alerts,
  dailyStats,
  equitySnapshots,
  positions,
  trades,
} from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { computeMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingest
 * Authorization: Bearer <INGEST_SECRET>
 *
 * Body (JSON):
 * {
 *   "account": {
 *     "login": "700012345", "broker": "FundedNext Markets", "server": "FN-Live01",
 *     "platform": "MT5", "propFirm": "FundedNext", "phase": "Phase 1",
 *     "currency": "USD", "leverage": 100,
 *     "initialBalance": 100000, "profitTargetPct": 8,
 *     "dailyLossLimitPct": 5, "maxLossLimitPct": 10, "minTradingDays": 5,
 *     "balance": 101250.40, "equity": 101812.10,
 *     "margin": 540.00, "freeMargin": 101272.10, "marginLevel": 18854.1
 *   },
 *   "positions": [
 *     { "ticket": "812341", "symbol": "EURUSD", "type": "BUY", "volume": 0.5,
 *       "openPrice": 1.08540, "currentPrice": 1.08612, "sl": 1.08100, "tp": 1.09200,
 *       "swap": -0.42, "commission": -1.75, "profit": 36.00,
 *       "magicNumber": 77121, "comment": "London Breakout EA",
 *       "openedAt": "2026-02-20T09:14:00Z" }
 *   ],
 *   "trades": [ { ...closed trade, plus "closePrice", "closedAt", "strategy" } ]
 * }
 */

type IngestAccount = {
  login: string;
  broker?: string;
  server?: string;
  platform?: string;
  propFirm?: string;
  phase?: string;
  accountType?: string; // "demo" | "live" — defaults to demo
  currency?: string;
  leverage?: number;
  initialBalance?: number;
  profitTargetPct?: number;
  dailyLossLimitPct?: number;
  maxLossLimitPct?: number;
  minTradingDays?: number;
  balance: number;
  equity: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
};

type IngestPosition = {
  ticket: string;
  symbol: string;
  type: string; // BUY | SELL
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number | null;
  tp?: number | null;
  swap?: number;
  commission?: number;
  profit: number;
  magicNumber?: number;
  comment?: string | null;
  openedAt?: string;
};

type IngestTrade = IngestPosition & {
  closePrice: number;
  closedAt: string;
  strategy?: string | null;
};

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return Response.json({ error: "INGEST_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return unauthorized();

  let payload: {
    account: IngestAccount;
    positions?: IngestPosition[];
    trades?: IngestTrade[];
  };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const a = payload.account;
  if (!a?.login || typeof a.balance !== "number" || typeof a.equity !== "number") {
    return Response.json(
      { error: "account.login, account.balance and account.equity are required" },
      { status: 400 }
    );
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  // 1) Upsert account by login
  const existing = await db
    .select()
    .from(accounts)
    .where(eq(accounts.login, a.login))
    .limit(1);

  let accountId: number;
  if (existing.length) {
    accountId = existing[0].id;
    await db
      .update(accounts)
      .set({
        broker: a.broker ?? existing[0].broker,
        server: a.server ?? existing[0].server,
        platform: (a.platform ?? existing[0].platform) as string,
        propFirm: a.propFirm ?? existing[0].propFirm,
        phase: a.phase ?? existing[0].phase,
        accountType: a.accountType ?? existing[0].accountType,
        currency: a.currency ?? existing[0].currency,
        leverage: a.leverage ?? existing[0].leverage,
        balance: a.balance.toFixed(2),
        equity: a.equity.toFixed(2),
        margin: (a.margin ?? 0).toFixed(2),
        freeMargin: (a.freeMargin ?? 0).toFixed(2),
        marginLevel: (a.marginLevel ?? 0).toFixed(2),
        updatedAt: now,
      })
      .where(eq(accounts.id, accountId));
  } else {
    const inserted = await db
      .insert(accounts)
      .values({
        login: a.login,
        broker: a.broker ?? "Unknown Broker",
        server: a.server ?? "",
        platform: (a.platform ?? "MT5") as string,
        propFirm: a.propFirm ?? "Custom",
        phase: a.phase ?? "Phase 1",
        accountType: a.accountType === "live" ? "live" : "demo",
        currency: a.currency ?? "USD",
        leverage: a.leverage ?? 100,
        initialBalance: (a.initialBalance ?? a.balance).toFixed(2),
        balance: a.balance.toFixed(2),
        equity: a.equity.toFixed(2),
        margin: (a.margin ?? 0).toFixed(2),
        freeMargin: (a.freeMargin ?? a.equity).toFixed(2),
        marginLevel: (a.marginLevel ?? 0).toFixed(2),
        profitTargetPct: (a.profitTargetPct ?? 8).toFixed(2),
        dailyLossLimitPct: (a.dailyLossLimitPct ?? 5).toFixed(2),
        maxLossLimitPct: (a.maxLossLimitPct ?? 10).toFixed(2),
        minTradingDays: a.minTradingDays ?? 5,
        tradingDaysCompleted: 0,
        source: "ea",
      })
      .returning({ id: accounts.id });
    accountId = inserted[0].id;
  }

  // 2) Replace open positions snapshot
  await db.delete(positions).where(eq(positions.accountId, accountId));
  for (const p of payload.positions ?? []) {
    await db.insert(positions).values({
      accountId,
      ticket: String(p.ticket),
      symbol: p.symbol,
      type: p.type,
      volume: p.volume.toFixed(2),
      openPrice: p.openPrice.toFixed(5),
      currentPrice: p.currentPrice.toFixed(5),
      sl: p.sl != null ? p.sl.toFixed(5) : null,
      tp: p.tp != null ? p.tp.toFixed(5) : null,
      swap: (p.swap ?? 0).toFixed(2),
      commission: (p.commission ?? 0).toFixed(2),
      profit: p.profit.toFixed(2),
      magicNumber: p.magicNumber ?? 0,
      comment: p.comment ?? null,
      openedAt: p.openedAt ? new Date(p.openedAt) : now,
    });
  }

  // 3) Insert any newly reported closed trades (dedupe by accountId+ticket)
  let insertedTrades = 0;
  for (const t of payload.trades ?? []) {
    const dup = await db
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.accountId, accountId), eq(trades.ticket, String(t.ticket))))
      .limit(1);
    if (dup.length) continue;
    await db.insert(trades).values({
      accountId,
      ticket: String(t.ticket),
      symbol: t.symbol,
      type: t.type,
      volume: t.volume.toFixed(2),
      openPrice: t.openPrice.toFixed(5),
      closePrice: t.closePrice.toFixed(5),
      sl: t.sl != null ? t.sl.toFixed(5) : null,
      tp: t.tp != null ? t.tp.toFixed(5) : null,
      swap: (t.swap ?? 0).toFixed(2),
      commission: (t.commission ?? 0).toFixed(2),
      profit: t.profit.toFixed(2),
      magicNumber: t.magicNumber ?? 0,
      strategy: t.strategy ?? t.comment ?? null,
      openedAt: t.openedAt ? new Date(t.openedAt) : now,
      closedAt: new Date(t.closedAt),
    });
    insertedTrades++;
  }

  // 4) Append equity snapshot
  await db.insert(equitySnapshots).values({
    accountId,
    balance: a.balance.toFixed(2),
    equity: a.equity.toFixed(2),
    drawdownPct: "0",
    takenAt: now,
  });

  // 5) Upsert today's daily stats
  const todayRow = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), eq(dailyStats.day, day)))
    .limit(1);

  if (todayRow.length) {
    const row = todayRow[0];
    await db
      .update(dailyStats)
      .set({
        endingBalance: a.balance.toFixed(2),
        highestEquity: Math.max(Number(row.highestEquity), a.equity).toFixed(2),
        lowestEquity: Math.min(Number(row.lowestEquity), a.equity).toFixed(2),
        pnl: (a.equity - Number(row.startingBalance)).toFixed(2),
        dailyDrawdownPct: Math.max(
          0,
          ((Number(row.startingBalance) - Number(row.lowestEquity)) /
            Number(row.startingBalance)) *
            100
        ).toFixed(4),
        tradesCount: Number(row.tradesCount) + insertedTrades,
        volumeTraded: (
          Number(row.volumeTraded) +
          (payload.trades ?? []).reduce((s, t) => s + t.volume, 0)
        ).toFixed(2),
      })
      .where(eq(dailyStats.id, row.id));
  } else {
    await db.insert(dailyStats).values({
      accountId,
      day,
      startingBalance: a.balance.toFixed(2),
      endingBalance: a.balance.toFixed(2),
      highestEquity: a.equity.toFixed(2),
      lowestEquity: a.equity.toFixed(2),
      pnl: "0",
      dailyDrawdownPct: "0",
      tradesCount: insertedTrades,
      wins: (payload.trades ?? []).filter((t) => t.profit > 0).length,
      losses: (payload.trades ?? []).filter((t) => t.profit <= 0).length,
      volumeTraded: (payload.trades ?? [])
        .reduce((s, t) => s + t.volume, 0)
        .toFixed(2),
    });
  }

  // 6) Auto-alert on compliance thresholds (max once per 10 min per rule)
  const initial = existing.length
    ? Number(existing[0].initialBalance)
    : (a.initialBalance ?? a.balance);
  const todayStart = todayRow.length
    ? Number(todayRow[0].startingBalance)
    : a.balance;

  const m = computeMetrics({
    initialBalance: initial,
    balance: a.balance,
    equity: a.equity,
    profitTargetPct: a.profitTargetPct ?? Number(existing[0]?.profitTargetPct ?? 8),
    dailyLossLimitPct:
      a.dailyLossLimitPct ?? Number(existing[0]?.dailyLossLimitPct ?? 5),
    maxLossLimitPct: a.maxLossLimitPct ?? Number(existing[0]?.maxLossLimitPct ?? 10),
    todayStartBalance: todayStart,
    peakEquity: Math.max(initial, a.equity),
  });

  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

  async function alertMaybe(rule: string, severity: string, message: string) {
    const recent = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.accountId, accountId),
          eq(alerts.ruleType, rule),
          gte(alerts.createdAt, tenMinAgo)
        )
      )
      .limit(1);
    if (recent.length === 0) {
      await db.insert(alerts).values({
        accountId,
        severity,
        ruleType: rule,
        message,
      });
    }
  }

  if (m.dailyLossUsedPct >= 100) {
    await alertMaybe(
      "daily_loss",
      "critical",
      `Daily loss limit BREACHED on ${a.login} — used ${m.dailyLossUsedPct.toFixed(1)}%.`
    );
  } else if (m.dailyLossUsedPct >= 80) {
    await alertMaybe(
      "daily_loss",
      "warn",
      `Daily loss at ${m.dailyLossUsedPct.toFixed(1)}% of limit on ${a.login}.`
    );
  }
  if (m.maxLossUsedPct >= 100) {
    await alertMaybe(
      "max_loss",
      "critical",
      `Max loss limit BREACHED on ${a.login} — equity below floor.`
    );
  } else if (m.maxLossUsedPct >= 80) {
    await alertMaybe(
      "max_loss",
      "warn",
      `Max loss at ${m.maxLossUsedPct.toFixed(1)}% of limit on ${a.login}.`
    );
  }
  if (m.profitTargetProgressPct >= 100) {
    await alertMaybe(
      "profit_target",
      "info",
      `Profit target reached on ${a.login} (${m.profitTargetProgressPct.toFixed(1)}%).`
    );
  }

  return Response.json({
    ok: true,
    accountId,
    positions: (payload.positions ?? []).length,
    tradesInserted: insertedTrades,
    status: m.status,
  });
}

export async function GET() {
  return Response.json({
    usage:
      "POST JSON with Authorization: Bearer <INGEST_SECRET>. Body: { account: {...}, positions: [...], trades?: [...] }",
  });
}
