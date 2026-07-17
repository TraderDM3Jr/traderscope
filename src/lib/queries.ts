import { db } from "@/db";
import {
  accounts,
  positions,
  trades,
  equitySnapshots,
  dailyStats,
  alerts,
  phases,
  journalEntries,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export async function getAccounts() {
  return db.select().from(accounts).orderBy(accounts.id);
}

export async function getAccount(id: number) {
  const rows = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPositions(accountId: number) {
  return db
    .select()
    .from(positions)
    .where(eq(positions.accountId, accountId))
    .orderBy(desc(positions.openedAt));
}

export async function getRecentTrades(accountId: number, limit = 25) {
  return db
    .select()
    .from(trades)
    .where(eq(trades.accountId, accountId))
    .orderBy(desc(trades.closedAt))
    .limit(limit);
}

export async function getEquitySnapshots(accountId: number, limit = 400) {
  const rows = await db
    .select()
    .from(equitySnapshots)
    .where(eq(equitySnapshots.accountId, accountId))
    .orderBy(desc(equitySnapshots.takenAt))
    .limit(limit);
  return rows.reverse();
}

export async function getDailyStats(accountId: number, limit = 30) {
  const rows = await db
    .select()
    .from(dailyStats)
    .where(eq(dailyStats.accountId, accountId))
    .orderBy(desc(dailyStats.day))
    .limit(limit);
  return rows.reverse();
}

export async function getTodayStats(accountId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), eq(dailyStats.day, today)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSymbolAggregates(accountId: number) {
  const rows = await db.execute<{
    symbol: string;
    trades: number;
    wins: number;
    losses: number;
    pnl: string;
    volume: string;
  }>(sql`
    select
      symbol,
      count(*)::int as trades,
      sum(case when profit >= 0 then 1 else 0 end)::int as wins,
      sum(case when profit < 0 then 1 else 0 end)::int as losses,
      sum(profit)::text as pnl,
      sum(volume)::text as volume
    from trades
    where account_id = ${accountId}
    group by symbol
    order by sum(profit) desc
  `);
  return rows.rows;
}

export async function getStrategyAggregates(accountId: number) {
  const rows = await db.execute<{
    strategy: string | null;
    trades: number;
    wins: number;
    pnl: string;
  }>(sql`
    select
      strategy,
      count(*)::int as trades,
      sum(case when profit >= 0 then 1 else 0 end)::int as wins,
      sum(profit)::text as pnl
    from trades
    where account_id = ${accountId}
    group by strategy
    order by sum(profit) desc
  `);
  return rows.rows;
}

export async function getAlerts(accountId: number, limit = 15) {
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.accountId, accountId))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}

export async function getJournalEntries(accountId: number, limit = 150) {
  return db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.accountId, accountId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit);
}

export async function getPhases(accountId: number) {
  return db
    .select()
    .from(phases)
    .where(eq(phases.accountId, accountId))
    .orderBy(phases.sequence);
}
