"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtMoney } from "@/lib/format";

type AccountLite = {
  id: number;
  login: string;
  propFirm: string;
  platform: string;
  accountType: string;
  phase: string;
  status: string;
};

type Phase = {
  id: number;
  sequence: number;
  name: string;
  status: string;
  initialBalance: string;
  profitTargetPct: string;
  dailyLossLimitPct: string;
  maxLossLimitPct: string;
  minTradingDays: number;
  startedAt: string | null;
  completedAt: string | null;
};

type Progress = {
  phaseId: number;
  profitTargetProgressPct: number;
  dailyLossUsedPct: number;
  maxLossUsedPct: number;
  status: string;
  tradingDaysCompleted: number;
  minTradingDays: number;
  equity: number;
} | null;

const statusStyle: Record<string, { dot: string; badge: string; ring: string }> = {
  active: {
    dot: "bg-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    ring: "border-cyan-500/40",
  },
  passed: {
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    ring: "border-emerald-500/30",
  },
  failed: {
    dot: "bg-red-400",
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
    ring: "border-red-500/30",
  },
  locked: {
    dot: "bg-slate-600",
    badge: "bg-slate-700/40 text-slate-400 border-slate-600/40",
    ring: "border-slate-800",
  },
};

export default function PhasesClient({
  accounts,
  activeAccountId,
  currency,
  accountStatus,
  phases,
  progress,
}: {
  accounts: AccountLite[];
  activeAccountId: number;
  currency: string;
  accountStatus: string;
  currentPhaseName: string;
  phases: Phase[];
  progress: Progress;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createLadder(preset: "standard" | "aggressive") {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: activeAccountId, preset }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: number, status: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/phases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resetLadder() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/phases?accountId=${activeAccountId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const done = phases.filter((p) => p.status === "passed").length;

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Challenge Phase System</h1>
            <p className="mt-1 text-slate-400">
              Track multi-level prop-firm challenges. Passing a phase automatically rolls
              the account into the next one with its own rules.
            </p>
          </div>
          <select
            value={activeAccountId}
            onChange={(e) => router.push(`/phases?account=${e.target.value}`)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.login} · {a.propFirm} · {a.accountType.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Ladder progress header */}
        {phases.length > 0 && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                {phases.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2">
                    {i > 0 && <span className="h-px w-6 bg-slate-700" />}
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${statusStyle[p.status]?.badge ?? ""} border`}
                    >
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-sm text-slate-400">
                {done}/{phases.length} phases complete
              </div>
              <div className="ml-auto">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${accountStatus === "passed" ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300" : accountStatus === "breached" ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-slate-700 text-slate-400"}`}
                >
                  Account: {accountStatus.toUpperCase()}
                </span>
                <button
                  onClick={resetLadder}
                  disabled={busy}
                  className="ml-3 rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-red-500/40 hover:text-red-300"
                >
                  Reset ladder
                </button>
              </div>
            </div>
          </div>
        )}

        {phases.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center">
            <div className="text-4xl">🏁</div>
            <h3 className="mt-3 text-lg font-semibold">No challenge ladder yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              Create a multi-level challenge for this account. Rules from the active phase
              are mirrored into the live dashboard and risk calculator automatically.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => createLadder("standard")}
                disabled={busy}
                className="rounded-md bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
              >
                Standard 3-phase · 8% / 5% / Funded
              </button>
              <button
                onClick={() => createLadder("aggressive")}
                disabled={busy}
                className="rounded-md border border-cyan-500/50 px-5 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
              >
                Aggressive · 10% / 8% / Funded
              </button>
            </div>
          </div>
        )}

        {/* Phase cards */}
        <div className="mt-6 space-y-4">
          {phases.map((p) => {
            const st = statusStyle[p.status] ?? statusStyle.locked;
            const isActive = p.status === "active";
            const prog = isActive && progress && progress.phaseId === p.id ? progress : null;
            const targetUsd =
              (Number(p.initialBalance) * Number(p.profitTargetPct)) / 100;
            return (
              <div
                key={p.id}
                className={`rounded-xl border bg-slate-900/60 p-5 ${st.ring} ${p.status === "locked" ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${st.dot} ${isActive ? "animate-pulse" : ""}`} />
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.badge}`}>
                      {p.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Balance baseline {fmtMoney(Number(p.initialBalance), currency)}</span>
                    {p.startedAt && <span>· started {new Date(p.startedAt).toLocaleDateString()}</span>}
                    {p.completedAt && <span>· done {new Date(p.completedAt).toLocaleDateString()}</span>}
                  </div>
                </div>

                {/* Rule chips */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <RuleChip label="Profit target" value={`${p.profitTargetPct}% (${fmtMoney(targetUsd, currency)})`} />
                  <RuleChip label="Daily loss limit" value={`${p.dailyLossLimitPct}%`} danger />
                  <RuleChip label="Max loss limit" value={`${p.maxLossLimitPct}%`} danger />
                  <RuleChip label="Min trading days" value={String(p.minTradingDays)} />
                </div>

                {/* Active progress bars */}
                {prog && (
                  <div className="mt-4 space-y-3">
                    <Bar
                      label={`Profit target progress (${prog.profitTargetProgressPct.toFixed(1)}%)`}
                      pct={prog.profitTargetProgressPct}
                      color="#22c55e"
                    />
                    <Bar
                      label={`Daily loss used (${prog.dailyLossUsedPct.toFixed(1)}%)`}
                      pct={prog.dailyLossUsedPct}
                      color={prog.dailyLossUsedPct >= 75 ? "#ef4444" : "#f59e0b"}
                    />
                    <Bar
                      label={`Max loss used (${prog.maxLossUsedPct.toFixed(1)}%)`}
                      pct={prog.maxLossUsedPct}
                      color={prog.maxLossUsedPct >= 75 ? "#ef4444" : "#fb923c"}
                    />
                    <div className="text-xs text-slate-400">
                      Trading days: {prog.tradingDaysCompleted}/{prog.minTradingDays} · Live
                      equity: <b className="text-slate-200">{fmtMoney(prog.equity, currency)}</b>{" "}
                      · Verdict:{" "}
                      <b className={prog.status === "safe" ? "text-emerald-400" : prog.status === "warn" ? "text-amber-400" : "text-red-400"}>
                        {prog.status.toUpperCase()}
                      </b>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {isActive && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => transition(p.id, "passed")}
                      disabled={busy}
                      className="rounded-md bg-emerald-500/90 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                    >
                      Mark passed → next phase
                    </button>
                    <button
                      onClick={() => transition(p.id, "failed")}
                      disabled={busy}
                      className="rounded-md border border-red-500/50 px-4 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      Mark failed
                    </button>
                  </div>
                )}
                {p.status === "failed" && (
                  <div className="mt-4">
                    <button
                      onClick={() => transition(p.id, "active")}
                      disabled={busy}
                      className="rounded-md border border-cyan-500/50 px-4 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
                    >
                      Retry this phase (activate again)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-500">
          How it works: the <b>active</b> phase&apos;s rules feed the dashboard gauges and the
          risk calculator in real time (demo and live accounts alike). Marking a phase{" "}
          <b>passed</b> automatically activates the next one and rebases the account rules to
          it — exactly like FundedNext/FTMO roll over after verification.
        </div>
      </div>
    </div>
  );
}

function RuleChip({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-semibold ${danger ? "text-amber-300" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
        />
      </div>
    </div>
  );
}
