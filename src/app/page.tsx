import Dashboard from "@/components/Dashboard";
import { seedIfEmpty } from "@/lib/seed";
import {
  getAccount,
  getAccounts,
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

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await seedIfEmpty();
  const accs = await getAccounts();
  if (accs.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-300">
        No accounts.
      </div>
    );
  }

  const account = accs[0];
  const accountId = account.id;

  const [positions, trades, snapshots, daily, today, bySymbol, byStrategy, alerts] =
    await Promise.all([
      getPositions(accountId),
      getRecentTrades(accountId, 25),
      getEquitySnapshots(accountId, 400),
      getDailyStats(accountId, 30),
      getTodayStats(accountId),
      getSymbolAggregates(accountId),
      getStrategyAggregates(accountId),
      getAlerts(accountId, 12),
    ]);

  const acct = (await getAccount(accountId))!;
  const initialBalance = Number(acct.initialBalance);
  const equity = Number(acct.equity);
  const balance = Number(acct.balance);
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
    profitTargetPct: Number(acct.profitTargetPct),
    dailyLossLimitPct: Number(acct.dailyLossLimitPct),
    maxLossLimitPct: Number(acct.maxLossLimitPct),
    todayStartBalance,
    peakEquity,
  });

  const initialData = {
    account: serialize(acct),
    metrics,
    positions: positions.map(serialize),
    trades: trades.map(serialize),
    snapshots: snapshots.map((s) => ({
      takenAt: s.takenAt.toISOString(),
      equity: s.equity,
      balance: s.balance,
    })),
    daily,
    today,
    bySymbol,
    byStrategy,
    alerts: alerts.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  };

  const accountLite = accs.map((a) => ({
    id: a.id,
    login: a.login,
    propFirm: a.propFirm,
    platform: a.platform,
    phase: a.phase,
    accountType: a.accountType,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Dashboard accounts={accountLite} initialData={initialData as any} />;
}

// Convert Date fields to ISO strings so we can pass to a client component
function serialize<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
