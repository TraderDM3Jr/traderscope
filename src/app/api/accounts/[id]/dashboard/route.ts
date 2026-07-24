import {
  getAccount,
  getAlerts,
  getDailyStats,
  getEquitySnapshots,
  getPositions,
  getRecentTrades,
  getStrategyAggregates,
  getSymbolAggregates,
  getTodayStats,
} from "@/lib/queries";
import { computeMetrics } from "@/lib/metrics";
import { getProtectionState } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "Bad account id" }, { status: 400 });
  }
  const account = await getAccount(accountId);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const [
    positions,
    trades,
    snapshots,
    daily,
    today,
    bySymbol,
    byStrategy,
    alerts,
    protection,
  ] = await Promise.all([
    getPositions(accountId),
    getRecentTrades(accountId, 25),
    getEquitySnapshots(accountId, 400),
    getDailyStats(accountId, 30),
    getTodayStats(accountId),
    getSymbolAggregates(accountId),
    getStrategyAggregates(accountId),
    getAlerts(accountId, 12),
    getProtectionState(accountId),
  ]);

  const initialBalance = Number(account.initialBalance);
  const equity = Number(account.equity);
  const balance = Number(account.balance);
  const peakEquity = Math.max(
    initialBalance,
    ...snapshots.map((s) => Number(s.equity)),
    equity
  );
  const todayStartBalance = today
    ? Number(today.startingBalance)
    : snapshots.length
      ? Number(snapshots[0].balance)
      : initialBalance;

  const metrics = computeMetrics({
    initialBalance,
    balance,
    equity,
    profitTargetPct: Number(account.profitTargetPct),
    dailyLossLimitPct: Number(account.dailyLossLimitPct),
    maxLossLimitPct: Number(account.maxLossLimitPct),
    todayStartBalance,
    peakEquity,
  });

  return Response.json({
    account,
    metrics,
    positions,
    trades,
    snapshots,
    daily,
    today,
    bySymbol,
    byStrategy,
    alerts,
    protection,
  });
}
