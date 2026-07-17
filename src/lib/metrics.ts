// Prop firm compliance & risk metric calculators

export type AccountMetrics = {
  initialBalance: number;
  balance: number;
  equity: number;
  profitTargetPct: number;
  dailyLossLimitPct: number;
  maxLossLimitPct: number;
  todayStartBalance: number;
  peakEquity: number;
};

export type ComputedMetrics = {
  totalPnl: number;
  totalPnlPct: number;
  profitTargetUsd: number;
  profitTargetProgressPct: number; // 0..100
  todayPnl: number;
  todayPnlPct: number;
  dailyLossLimitUsd: number;
  dailyLossUsedPct: number; // % of allowance used, 0..100
  dailyLossRemaining: number;
  maxLossLimitUsd: number;
  maxLossFloorEquity: number; // equity below which max loss breaches
  maxLossUsedPct: number;
  maxLossRemaining: number;
  currentDrawdownPct: number; // from peak
  status: "safe" | "warn" | "danger" | "breached" | "passed";
};

export function computeMetrics(m: AccountMetrics): ComputedMetrics {
  const totalPnl = m.equity - m.initialBalance;
  const totalPnlPct = (totalPnl / m.initialBalance) * 100;

  const profitTargetUsd = m.initialBalance * (m.profitTargetPct / 100);
  const profitTargetProgressPct = Math.max(
    0,
    Math.min(100, (totalPnl / profitTargetUsd) * 100)
  );

  const todayPnl = m.equity - m.todayStartBalance;
  const todayPnlPct = (todayPnl / m.todayStartBalance) * 100;

  const dailyLossLimitUsd = m.todayStartBalance * (m.dailyLossLimitPct / 100);
  const dailyLoss = todayPnl < 0 ? Math.abs(todayPnl) : 0;
  const dailyLossUsedPct = Math.max(
    0,
    Math.min(100, (dailyLoss / dailyLossLimitUsd) * 100)
  );
  const dailyLossRemaining = Math.max(0, dailyLossLimitUsd - dailyLoss);

  const maxLossLimitUsd = m.initialBalance * (m.maxLossLimitPct / 100);
  const maxLossFloorEquity = m.initialBalance - maxLossLimitUsd;
  const maxLoss = Math.max(0, m.initialBalance - m.equity);
  const maxLossUsedPct = Math.max(
    0,
    Math.min(100, (maxLoss / maxLossLimitUsd) * 100)
  );
  const maxLossRemaining = Math.max(0, maxLossLimitUsd - maxLoss);

  const currentDrawdownPct =
    m.peakEquity > 0 ? ((m.peakEquity - m.equity) / m.peakEquity) * 100 : 0;

  let status: ComputedMetrics["status"] = "safe";
  if (dailyLossUsedPct >= 100 || maxLossUsedPct >= 100) status = "breached";
  else if (profitTargetProgressPct >= 100) status = "passed";
  else if (dailyLossUsedPct >= 75 || maxLossUsedPct >= 75) status = "danger";
  else if (dailyLossUsedPct >= 50 || maxLossUsedPct >= 50) status = "warn";

  return {
    totalPnl,
    totalPnlPct,
    profitTargetUsd,
    profitTargetProgressPct,
    todayPnl,
    todayPnlPct,
    dailyLossLimitUsd,
    dailyLossUsedPct,
    dailyLossRemaining,
    maxLossLimitUsd,
    maxLossFloorEquity,
    maxLossUsedPct,
    maxLossRemaining,
    currentDrawdownPct,
    status,
  };
}
