import PhasesClient from "@/components/PhasesClient";
import { seedIfEmpty } from "@/lib/seed";
import { getAccount, getAccounts, getPhases, getTodayStats } from "@/lib/queries";
import { computeMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function PhasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await seedIfEmpty();
  const sp = await searchParams;
  const accs = await getAccounts();
  const requested = Number(sp.account);
  const account = accs.find((a) => a.id === requested) ?? accs[0];
  if (!account) return <div className="grid min-h-screen place-items-center">No accounts.</div>;

  const [phaseRows, today] = await Promise.all([
    getPhases(account.id),
    getTodayStats(account.id),
  ]);

  const active = phaseRows.find((p) => p.status === "active") ?? null;
  let progress = null;
  if (active) {
    const acct = (await getAccount(account.id))!;
    const initial = Number(active.initialBalance);
    const equity = Number(acct.equity);
    const m = computeMetrics({
      initialBalance: initial,
      balance: Number(acct.balance),
      equity,
      profitTargetPct: Number(active.profitTargetPct),
      dailyLossLimitPct: Number(active.dailyLossLimitPct),
      maxLossLimitPct: Number(active.maxLossLimitPct),
      todayStartBalance: today ? Number(today.startingBalance) : initial,
      peakEquity: Math.max(initial, equity),
    });
    progress = {
      phaseId: active.id,
      profitTargetProgressPct: m.profitTargetProgressPct,
      dailyLossUsedPct: m.dailyLossUsedPct,
      maxLossUsedPct: m.maxLossUsedPct,
      status: m.status,
      tradingDaysCompleted: acct.tradingDaysCompleted,
      minTradingDays: active.minTradingDays,
      equity,
    };
  }

  const lite = accs.map((a) => ({
    id: a.id,
    login: a.login,
    propFirm: a.propFirm,
    platform: a.platform,
    accountType: a.accountType,
    phase: a.phase,
    status: a.status,
  }));

  const serPhases = phaseRows.map((p) => ({
    ...p,
    startedAt: p.startedAt ? p.startedAt.toISOString() : null,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <PhasesClient
      accounts={lite}
      activeAccountId={account.id}
      currency={account.currency}
      accountStatus={account.status}
      currentPhaseName={account.phase}
      phases={serPhases}
      progress={progress}
    />
  );
}
