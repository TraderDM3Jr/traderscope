"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EquityChart } from "./EquityChart";
import { RadialGauge } from "./RadialGauge";
import { DailyBars } from "./DailyBars";
import type { ComputedMetrics } from "@/lib/metrics";
import { fmtMoney, fmtNum, fmtPct, fmtPrice, fmtTime } from "@/lib/format";

type Account = {
  id: number;
  login: string;
  broker: string;
  server: string;
  platform: string;
  propFirm: string;
  phase: string;
  currency: string;
  accountType?: string;
  leverage: number;
  initialBalance: string;
  balance: string;
  equity: string;
  margin: string;
  freeMargin: string;
  marginLevel: string;
  profitTargetPct: string;
  dailyLossLimitPct: string;
  maxLossLimitPct: string;
  minTradingDays: number;
  tradingDaysCompleted: number;
  status: string;
  updatedAt: string;
};

type Position = {
  id: number;
  ticket: string;
  symbol: string;
  type: string;
  volume: string;
  openPrice: string;
  currentPrice: string;
  sl: string | null;
  tp: string | null;
  swap: string;
  commission: string;
  profit: string;
  comment: string | null;
  openedAt: string;
};

type Trade = {
  id: number;
  ticket: string;
  symbol: string;
  type: string;
  volume: string;
  openPrice: string;
  closePrice: string;
  profit: string;
  strategy: string | null;
  openedAt: string;
  closedAt: string;
};

type Snap = { takenAt: string; equity: string; balance: string };
type Daily = {
  day: string;
  startingBalance: string;
  endingBalance: string;
  pnl: string;
  dailyDrawdownPct: string;
  tradesCount: number;
  wins: number;
  losses: number;
  volumeTraded: string;
  breachedDailyLimit: boolean;
};
type SymAgg = {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: string;
  volume: string;
};
type StratAgg = { strategy: string | null; trades: number; wins: number; pnl: string };
type Alert = {
  id: number;
  severity: string;
  ruleType: string;
  message: string;
  createdAt: string;
};

type DashboardData = {
  account: Account;
  metrics: ComputedMetrics;
  positions: Position[];
  trades: Trade[];
  snapshots: Snap[];
  daily: Daily[];
  today: Daily | null;
  bySymbol: SymAgg[];
  byStrategy: StratAgg[];
  alerts: Alert[];
};

type AccountLite = Pick<Account, "id" | "login" | "propFirm" | "platform" | "phase" | "accountType">;

const statusStyles: Record<string, string> = {
  safe: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  danger: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  breached: "bg-red-500/15 text-red-400 border-red-500/30",
  passed: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export default function Dashboard({
  accounts,
  initialData,
}: {
  accounts: AccountLite[];
  initialData: DashboardData;
}) {
  const [accountId, setAccountId] = useState(initialData.account.id);
  const [data, setData] = useState<DashboardData>(initialData);
  const [live, setLive] = useState(true);
  const [lastTick, setLastTick] = useState<Date>(new Date());
  const [pulseKey, setPulseKey] = useState(0);
  const busy = useRef(false);

  const refresh = useCallback(async (id: number) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(`/api/accounts/${id}/dashboard`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as DashboardData;
        setData(j);
        setLastTick(new Date());
        setPulseKey((k) => k + 1);
      }
    } finally {
      busy.current = false;
    }
  }, []);

  // Poll ticker + refresh dashboard every 3s
  useEffect(() => {
    if (!live) return;
    const int = setInterval(async () => {
      await fetch("/api/tick", { method: "POST", cache: "no-store" });
      await refresh(accountId);
    }, 3000);
    return () => clearInterval(int);
  }, [live, accountId, refresh]);

  // When account changes, immediately refresh
  useEffect(() => {
    refresh(accountId);
  }, [accountId, refresh]);

  const a = data.account;
  const m = data.metrics;
  const currency = a.currency;
  const initialBalance = Number(a.initialBalance);
  const todayStartBalance = data.today
    ? Number(data.today.startingBalance)
    : initialBalance;

  const floating = useMemo(
    () => data.positions.reduce((s, p) => s + Number(p.profit), 0),
    [data.positions]
  );

  const closedStats = useMemo(() => {
    const wins = data.trades.filter((t) => Number(t.profit) > 0);
    const losses = data.trades.filter((t) => Number(t.profit) <= 0);
    const grossWin = wins.reduce((s, t) => s + Number(t.profit), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.profit), 0));
    const wr = data.trades.length ? (wins.length / data.trades.length) * 100 : 0;
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? -grossLoss / losses.length : 0;
    return { wr, pf, avgWin, avgLoss, wins: wins.length, losses: losses.length };
  }, [data.trades]);

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-[#0b1220]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 font-bold text-white">
              TS
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">TraderScope</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">
                Prop-firm compliance monitor
              </div>
            </div>
          </div>

          <nav className="ml-4 hidden items-center gap-1 text-xs md:flex">
            <a href="/" className="rounded-md bg-slate-800/60 px-3 py-1.5 font-medium text-slate-200">Dashboard</a>
            <a href="/journal" className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200">Journal</a>
            <a href="/risk-calculator" className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200">Risk Calculator</a>
            <a href="/phases" className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200">Phases</a>
            <a href="/connect" className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200">Connect EA</a>
          </nav>

          <div className="ml-4 flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-cyan-500"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  #{acc.login} · {acc.propFirm} · {acc.platform} · {acc.phase} · {(acc.accountType ?? "demo").toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[m.status]}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${m.status === "safe" ? "bg-emerald-400" : m.status === "warn" ? "bg-amber-400" : m.status === "danger" ? "bg-orange-400" : m.status === "breached" ? "bg-red-400" : "bg-cyan-400"} animate-pulse`}
              />
              {m.status.toUpperCase()}
            </span>
            <a
              href="/connect"
              className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20"
            >
              Connect EA
            </a>
            <button
              onClick={() => setLive((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${live ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-400"}`}
            >
              <span
                className={`mr-1 inline-block h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-slate-500"}`}
              />
              {live ? "LIVE" : "PAUSED"}
            </button>
            <span className="text-xs text-slate-500">
              {fmtTime(lastTick)}
            </span>
          </div>
        </div>

        {/* Account meta strip */}
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-800/70 px-6 py-2 text-xs text-slate-400">
          <span><span className="text-slate-500">Broker:</span> {a.broker}</span>
          <span><span className="text-slate-500">Server:</span> {a.server}</span>
          <span><span className="text-slate-500">Leverage:</span> 1:{a.leverage}</span>
          <span><span className="text-slate-500">Initial:</span> {fmtMoney(initialBalance, currency)}</span>
          <span><span className="text-slate-500">Trading days:</span> {a.tradingDaysCompleted}/{a.minTradingDays}</span>
          <span><span className="text-slate-500">Profit target:</span> {a.profitTargetPct}%</span>
          <span><span className="text-slate-500">Daily loss:</span> {a.dailyLossLimitPct}%</span>
          <span><span className="text-slate-500">Max loss:</span> {a.maxLossLimitPct}%</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {/* KPI cards */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6" key={pulseKey}>
          <Kpi
            label="Balance"
            value={fmtMoney(Number(a.balance), currency)}
            sub={`Initial ${fmtMoney(initialBalance, currency)}`}
            tone="neutral"
          />
          <Kpi
            label="Equity"
            value={fmtMoney(Number(a.equity), currency)}
            sub={`Floating ${fmtMoney(floating, currency)}`}
            tone={floating >= 0 ? "up" : "down"}
            pulse
          />
          <Kpi
            label="Total P/L"
            value={fmtMoney(m.totalPnl, currency)}
            sub={fmtPct(m.totalPnlPct)}
            tone={m.totalPnl >= 0 ? "up" : "down"}
          />
          <Kpi
            label="Today P/L"
            value={fmtMoney(m.todayPnl, currency)}
            sub={fmtPct(m.todayPnlPct)}
            tone={m.todayPnl >= 0 ? "up" : "down"}
          />
          <Kpi
            label="Free Margin"
            value={fmtMoney(Number(a.freeMargin), currency)}
            sub={`Used ${fmtMoney(Number(a.margin), currency)}`}
            tone="neutral"
          />
          <Kpi
            label="Margin Level"
            value={`${fmtNum(Number(a.marginLevel), 1)}%`}
            sub={`ML floor 100%`}
            tone={Number(a.marginLevel) > 300 ? "up" : Number(a.marginLevel) > 150 ? "neutral" : "down"}
          />
        </section>

        {/* Compliance + gauges + equity */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Compliance gauges */}
          <div className="lg:col-span-1 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Prop Firm Compliance</h3>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">
                {a.propFirm}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <RadialGauge
                value={m.profitTargetProgressPct}
                label="Profit Target"
                sublabel={`${fmtMoney(m.profitTargetUsd, currency)}`}
                color="#22c55e"
              />
              <RadialGauge
                value={m.dailyLossUsedPct}
                label="Daily Loss"
                sublabel={`${fmtMoney(m.dailyLossRemaining, currency)} left`}
                danger
              />
              <RadialGauge
                value={m.maxLossUsedPct}
                label="Max Loss"
                sublabel={`${fmtMoney(m.maxLossRemaining, currency)} left`}
                danger
              />
            </div>
            <div className="mt-5 space-y-3 text-xs">
              <RuleRow
                label="Profit Target"
                ok={m.profitTargetProgressPct >= 100}
                detail={`${fmtPct(m.profitTargetProgressPct)} of ${fmtMoney(m.profitTargetUsd, currency)}`}
              />
              <RuleRow
                label="Daily Loss Limit"
                ok={m.dailyLossUsedPct < 100}
                detail={`${fmtPct(m.dailyLossUsedPct)} used`}
                danger={m.dailyLossUsedPct >= 100}
              />
              <RuleRow
                label="Max Loss Limit"
                ok={m.maxLossUsedPct < 100}
                detail={`Floor ${fmtMoney(m.maxLossFloorEquity, currency)}`}
                danger={m.maxLossUsedPct >= 100}
              />
              <RuleRow
                label="Min Trading Days"
                ok={a.tradingDaysCompleted >= a.minTradingDays}
                detail={`${a.tradingDaysCompleted}/${a.minTradingDays}`}
              />
            </div>
          </div>

          {/* Equity curve */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Equity & Balance Curve</h3>
                <p className="text-xs text-slate-500">
                  Live from {a.platform} bridge · last {data.snapshots.length} ticks
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <LegendDot color="#22c55e" /> Equity
                <LegendDot color="#38bdf8" /> Balance
                <LegendDot color="#f59e0b" /> Daily Floor
                <LegendDot color="#ef4444" /> Max Floor
              </div>
            </div>
            <EquityChart
              snapshots={data.snapshots}
              initialBalance={initialBalance}
              profitTargetPct={Number(a.profitTargetPct)}
              dailyLossLimitPct={Number(a.dailyLossLimitPct)}
              maxLossLimitPct={Number(a.maxLossLimitPct)}
              todayStartBalance={todayStartBalance}
            />
          </div>
        </section>

        {/* Daily bars + Trade stats */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Daily P/L (30d)</h3>
              <div className="text-xs text-slate-500">
                Green = profitable day · Red = losing day
              </div>
            </div>
            <DailyBars daily={data.daily} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Trade Statistics</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Total Trades" value={String(data.trades.length + data.positions.length)} />
              <Stat label="Open" value={String(data.positions.length)} />
              <Stat label="Win Rate" value={`${fmtNum(closedStats.wr, 1)}%`} tone={closedStats.wr >= 50 ? "up" : "down"} />
              <Stat label="Profit Factor" value={fmtNum(closedStats.pf, 2)} tone={closedStats.pf >= 1.2 ? "up" : "down"} />
              <Stat label="Wins" value={String(closedStats.wins)} tone="up" />
              <Stat label="Losses" value={String(closedStats.losses)} tone="down" />
              <Stat label="Avg Win" value={fmtMoney(closedStats.avgWin, currency)} tone="up" />
              <Stat label="Avg Loss" value={fmtMoney(closedStats.avgLoss, currency)} tone="down" />
              <Stat label="Peak DD" value={`${fmtNum(m.currentDrawdownPct, 2)}%`} tone={m.currentDrawdownPct > 5 ? "down" : "neutral"} />
              <Stat label="Total P/L" value={fmtMoney(m.totalPnl, currency)} tone={m.totalPnl >= 0 ? "up" : "down"} />
            </div>
          </div>
        </section>

        {/* Open positions */}
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Open Positions <span className="text-slate-500">({data.positions.length})</span>
            </h3>
            <div className="text-xs text-slate-400">
              Floating P/L:{" "}
              <span className={floating >= 0 ? "text-emerald-400" : "text-red-400"}>
                {fmtMoney(floating, currency)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Ticket</th>
                  <th className="px-4 py-2">Symbol</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Volume</th>
                  <th className="px-4 py-2 text-right">Open</th>
                  <th className="px-4 py-2 text-right">Current</th>
                  <th className="px-4 py-2 text-right">SL</th>
                  <th className="px-4 py-2 text-right">TP</th>
                  <th className="px-4 py-2 text-right">Swap</th>
                  <th className="px-4 py-2 text-right">Commission</th>
                  <th className="px-4 py-2 text-right">Profit</th>
                  <th className="px-4 py-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {data.positions.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-center text-slate-500">
                      No open positions.
                    </td>
                  </tr>
                )}
                {data.positions.map((p) => {
                  const pnl = Number(p.profit);
                  const dp = p.symbol === "USDJPY" || p.symbol === "XAUUSD" ? 3 : 5;
                  return (
                    <tr key={p.id} className="border-t border-slate-800/70 hover:bg-slate-800/30">
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">#{p.ticket}</td>
                      <td className="px-4 py-2 font-semibold">{p.symbol}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${p.type === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}
                        >
                          {p.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{fmtNum(Number(p.volume), 2)}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-400">
                        {fmtPrice(Number(p.openPrice), dp)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {fmtPrice(Number(p.currentPrice), dp)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-red-400/70">
                        {p.sl ? fmtPrice(Number(p.sl), dp) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-400/70">
                        {p.tp ? fmtPrice(Number(p.tp), dp) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                        {fmtNum(Number(p.swap), 2)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                        {fmtNum(Number(p.commission), 2)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {fmtMoney(pnl, currency)}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{p.comment}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Symbols matrix & Strategies */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-200">Currency / Symbol Matrix</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-4 py-2 text-right">Trades</th>
                    <th className="px-4 py-2 text-right">Win Rate</th>
                    <th className="px-4 py-2 text-right">Volume</th>
                    <th className="px-4 py-2 text-right">Net P/L</th>
                    <th className="px-4 py-2">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySymbol.map((s) => {
                    const wr = s.trades ? (s.wins / s.trades) * 100 : 0;
                    const pnl = Number(s.pnl);
                    const maxAbs = Math.max(
                      ...data.bySymbol.map((x) => Math.abs(Number(x.pnl))),
                      1
                    );
                    const pct = (Math.abs(pnl) / maxAbs) * 100;
                    return (
                      <tr key={s.symbol} className="border-t border-slate-800/70">
                        <td className="px-4 py-2 font-semibold">{s.symbol}</td>
                        <td className="px-4 py-2 text-right font-mono">{s.trades}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmtNum(wr, 1)}%</td>
                        <td className="px-4 py-2 text-right font-mono">{fmtNum(Number(s.volume), 2)}</td>
                        <td
                          className={`px-4 py-2 text-right font-mono font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {fmtMoney(pnl, currency)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                            <div
                              className={`h-full ${pnl >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-200">Strategy / EA Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Strategy</th>
                    <th className="px-4 py-2 text-right">Trades</th>
                    <th className="px-4 py-2 text-right">Win Rate</th>
                    <th className="px-4 py-2 text-right">Net P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStrategy.map((s) => {
                    const wr = s.trades ? (s.wins / s.trades) * 100 : 0;
                    const pnl = Number(s.pnl);
                    return (
                      <tr key={s.strategy ?? "unknown"} className="border-t border-slate-800/70">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`grid h-6 w-6 place-items-center rounded text-[10px] font-bold ${s.strategy === "Manual" ? "bg-slate-700 text-slate-200" : "bg-cyan-500/20 text-cyan-300"}`}
                            >
                              {s.strategy === "Manual" ? "M" : "EA"}
                            </span>
                            <span>{s.strategy ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{s.trades}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmtNum(wr, 1)}%</td>
                        <td
                          className={`px-4 py-2 text-right font-mono font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {fmtMoney(pnl, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Trade history + alerts */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 lg:col-span-2">
            <div className="border-b border-slate-800 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-200">Recent Trade History</h3>
            </div>
            <div className="max-h-[380px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/95 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Ticket</th>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Vol</th>
                    <th className="px-4 py-2 text-right">Open</th>
                    <th className="px-4 py-2 text-right">Close</th>
                    <th className="px-4 py-2 text-right">P/L</th>
                    <th className="px-4 py-2">Strategy</th>
                    <th className="px-4 py-2">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((t) => {
                    const pnl = Number(t.profit);
                    const dp = t.symbol === "USDJPY" || t.symbol === "XAUUSD" ? 3 : 5;
                    return (
                      <tr key={t.id} className="border-t border-slate-800/70">
                        <td className="px-4 py-1.5 font-mono text-xs text-slate-400">#{t.ticket}</td>
                        <td className="px-4 py-1.5">{t.symbol}</td>
                        <td className="px-4 py-1.5">
                          <span
                            className={`rounded px-1.5 text-xs ${t.type === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono">{fmtNum(Number(t.volume), 2)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-slate-400">
                          {fmtPrice(Number(t.openPrice), dp)}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-slate-400">
                          {fmtPrice(Number(t.closePrice), dp)}
                        </td>
                        <td
                          className={`px-4 py-1.5 text-right font-mono font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {fmtMoney(pnl, currency)}
                        </td>
                        <td className="px-4 py-1.5 text-xs text-slate-400">{t.strategy}</td>
                        <td className="px-4 py-1.5 text-xs text-slate-500">
                          {new Date(t.closedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-200">Alerts & Events</h3>
            </div>
            <ul className="max-h-[380px] divide-y divide-slate-800/70 overflow-y-auto">
              {data.alerts.map((al) => (
                <li key={al.id} className="px-5 py-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${al.severity === "critical" ? "bg-red-500" : al.severity === "warn" ? "bg-amber-400" : "bg-cyan-400"}`}
                    />
                    <div className="flex-1">
                      <div className="text-slate-200">{al.message}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {al.ruleType.replace("_", " ")} ·{" "}
                        {new Date(al.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {data.alerts.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-slate-500">
                  No alerts.
                </li>
              )}
            </ul>
          </div>
        </section>

        <footer className="mt-8 pb-8 text-center text-xs text-slate-600">
          PropDesk ·{" "}
          <a href="/connect" className="text-cyan-400 hover:underline">
            Connect your MT4/MT5 terminal
          </a>{" "}
          to stream live data via{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">/api/ingest</code>{" "}
          · Demo accounts tick every 3s
        </footer>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "up" | "down" | "neutral";
  pulse?: boolean;
}) {
  const c =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
        ? "text-red-400"
        : "text-slate-100";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${c} ${pulse ? "animate-[fade_0.6s_ease]" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  const c =
    tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function RuleRow({
  label,
  ok,
  detail,
  danger,
}: {
  label: string;
  ok: boolean;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800/70 bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${danger ? "bg-red-500/20 text-red-400" : ok ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-300"}`}
        >
          {danger ? "!" : ok ? "✓" : "•"}
        </span>
        <span className="text-slate-300">{label}</span>
      </div>
      <span className={`text-xs ${danger ? "text-red-400" : "text-slate-400"}`}>{detail}</span>
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: color }}
    />
  );
}
