"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtMoney, fmtNum } from "@/lib/format";

type AccountLite = {
  id: number;
  login: string;
  propFirm: string;
  platform: string;
  accountType: string;
  equity: string;
  dailyLossRemaining: number | null;
};

type Spec = {
  pipSize: number;
  quoteValue: number; // pip value per standard lot, in QUOTE currency
  convRate: number; // quote → USD conversion (1 for USD quote)
  label: string;
  editableConv: boolean;
};

const SPECS: Record<string, Spec> = {
  EURUSD: { pipSize: 0.0001, quoteValue: 10, convRate: 1, label: "EUR/USD", editableConv: false },
  GBPUSD: { pipSize: 0.0001, quoteValue: 10, convRate: 1, label: "GBP/USD", editableConv: false },
  AUDUSD: { pipSize: 0.0001, quoteValue: 10, convRate: 1, label: "AUD/USD", editableConv: false },
  NZDUSD: { pipSize: 0.0001, quoteValue: 10, convRate: 1, label: "NZD/USD", editableConv: false },
  USDJPY: { pipSize: 0.01, quoteValue: 1000, convRate: 155.4, label: "USD/JPY", editableConv: true },
  USDCHF: { pipSize: 0.0001, quoteValue: 10, convRate: 0.9, label: "USD/CHF", editableConv: true },
  USDCAD: { pipSize: 0.0001, quoteValue: 10, convRate: 1.37, label: "USD/CAD", editableConv: true },
  EURGBP: { pipSize: 0.0001, quoteValue: 10, convRate: 1.27, label: "EUR/GBP (GBPUSD rate)", editableConv: true },
  EURJPY: { pipSize: 0.01, quoteValue: 1000, convRate: 166.0, label: "EUR/JPY (USDJPY rate)", editableConv: true },
  GBPJPY: { pipSize: 0.01, quoteValue: 1000, convRate: 197.5, label: "GBP/JPY (USDJPY rate)", editableConv: true },
  XAUUSD: { pipSize: 0.1, quoteValue: 10, convRate: 1, label: "Gold (XAU/USD)", editableConv: false },
};

const DIRECT_QUOTE = new Set(["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "XAUUSD"]);
const USD_BASE = new Set(["USDJPY", "USDCHF", "USDCAD"]);

export default function RiskCalculator({ accounts }: { accounts: AccountLite[] }) {
  const [symbol, setSymbol] = useState("EURUSD");
  const [accountId, setAccountId] = useState<string>("manual");
  const [manualEquity, setManualEquity] = useState("100000");
  const [liveEquity, setLiveEquity] = useState<number | null>(null);
  const [dailyLossRemaining, setDailyLossRemaining] = useState<number | null>(null);
  const [maxLossRemaining, setMaxLossRemaining] = useState<number | null>(null);
  const [riskPct, setRiskPct] = useState("1");
  const [slPips, setSlPips] = useState("25");
  const [convRate, setConvRate] = useState(SPECS["EURUSD"].convRate);
  const [leverage, setLeverage] = useState("100");

  // when symbol changes, reset conv rate to spec default
  useEffect(() => {
    setConvRate(SPECS[symbol].convRate);
  }, [symbol]);

  // fetch live equity + remaining allowances when an account is selected
  useEffect(() => {
    if (accountId === "manual") {
      setLiveEquity(null);
      setDailyLossRemaining(null);
      setMaxLossRemaining(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/accounts/${accountId}/dashboard`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (cancelled) return;
        setLiveEquity(Number(j.account.equity));
        setDailyLossRemaining(j.metrics.dailyLossRemaining);
        setMaxLossRemaining(j.metrics.maxLossRemaining);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const equity = accountId === "manual" ? parseFloat(manualEquity) || 0 : liveEquity ?? 0;
  const risk = Math.max(0, parseFloat(riskPct) || 0);
  const sl = Math.max(0.1, parseFloat(slPips) || 0);
  const lev = Math.max(1, parseFloat(leverage) || 1);

  const result = useMemo(() => {
    if (equity <= 0) return null;
    const riskUsd = equity * (risk / 100);
    const spec = SPECS[symbol];
    // pip value in USD per standard lot
    let pipValueUsd: number;
    if (DIRECT_QUOTE.has(symbol)) pipValueUsd = spec.quoteValue;
    else if (USD_BASE.has(symbol)) pipValueUsd = spec.quoteValue / convRate;
    else pipValueUsd = spec.quoteValue * convRate; // crosses: quote→USD via rate

    const riskPerLot = sl * pipValueUsd;
    const lots = riskPerLot > 0 ? riskUsd / riskPerLot : 0;
    const units = lots * 100000;
    const approxPrice = DIRECT_QUOTE.has(symbol) ? 1 : convRate;
    const notional = lots * 100000 * (spec.pipSize === 0.1 ? 100 * 2350 / 1000 : approxPrice); // ~ exposure
    const margin = notional / lev;
    return { riskUsd, pipValueUsd, riskPerLot, lots, units, notional, margin };
  }, [equity, risk, sl, symbol, convRate, lev]);

  const dailyUsedPct =
    result && dailyLossRemaining != null && dailyLossRemaining > 0
      ? (result.riskUsd / dailyLossRemaining) * 100
      : null;

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Risk Calculator</h1>
        <p className="mt-2 text-slate-400">
          Calculate the exact lot size for a trade given your equity, risk tolerance and stop
          loss — with prop-firm safety checks against your remaining daily & max loss
          allowances.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {/* Input card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-200">Inputs</h3>
            <div className="space-y-4 text-sm">
              <Field label="Instrument">
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                >
                  {Object.entries(SPECS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} — {v.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Equity source">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                >
                  <option value="manual">Manual entry</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      #{a.login} · {a.propFirm} · {a.accountType.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>

              {accountId === "manual" ? (
                <Field label="Account equity (USD)">
                  <input
                    value={manualEquity}
                    onChange={(e) => setManualEquity(e.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                  />
                </Field>
              ) : (
                <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
                  Live equity:{" "}
                  <span className="font-semibold text-emerald-400">
                    {liveEquity != null ? fmtMoney(liveEquity) : "loading…"}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Risk % per trade">
                  <input
                    value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                  />
                </Field>
                <Field label="Stop loss (pips)">
                  <input
                    value={slPips}
                    onChange={(e) => setSlPips(e.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                {[0.5, 1, 2, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => setRiskPct(String(p))}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition ${parseFloat(riskPct) === p ? "border-cyan-500 bg-cyan-500/15 text-cyan-300" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                  >
                    {p}%
                  </button>
                ))}
              </div>

              {SPECS[symbol].editableConv && (
                <Field label={`Conversion rate (${SPECS[symbol].label})`}>
                  <input
                    value={convRate}
                    onChange={(e) => setConvRate(parseFloat(e.target.value) || 1)}
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                  />
                </Field>
              )}

              <Field label="Leverage 1:x">
                <input
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                />
              </Field>
            </div>
          </div>

          {/* Output card */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Position Size</h3>
              {result ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-end justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
                    <span className="text-xs uppercase tracking-widest text-slate-400">
                      Recommended lot size
                    </span>
                    <span className="text-3xl font-bold text-cyan-300 tabular-nums">
                      {fmtNum(result.lots, 2)}
                      <span className="ml-1 text-sm font-normal text-slate-400">lots</span>
                    </span>
                  </div>
                  <Row label="Money at risk" value={fmtMoney(result.riskUsd)} tone="warn" />
                  <Row label="Pip value (per 1.0 lot)" value={fmtMoney(result.pipValueUsd, "USD")} />
                  <Row label="Risk per lot (SL × pip value)" value={fmtMoney(result.riskPerLot)} />
                  <Row label="Units" value={Math.round(result.units).toLocaleString()} />
                  <Row label="≈ Notional exposure" value={fmtMoney(result.notional)} />
                  <Row label="Margin required" value={fmtMoney(result.margin)} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Enter equity to see sizing.</p>
              )}
            </div>

            {/* Prop-firm safety checks */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">
                Prop-firm safety check
              </h3>
              {dailyUsedPct != null && result ? (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-400">
                      <span>Of remaining daily loss allowance</span>
                      <span>{dailyUsedPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                      <div
                        className={`h-full ${dailyUsedPct >= 50 ? "bg-red-500" : dailyUsedPct >= 25 ? "bg-amber-400" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, dailyUsedPct)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    A stop-out would use <b>{fmtMoney(result.riskUsd)}</b> of your{" "}
                    <b>{fmtMoney(dailyLossRemaining ?? 0)}</b> daily allowance
                    {dailyUsedPct >= 50 && (
                      <span className="mt-1 block font-medium text-red-400">
                        ⚠ Too aggressive for a funded/challenge account — reduce % or widen
                        structure.
                      </span>
                    )}
                  </div>
                  {maxLossRemaining != null && (
                    <div className="text-xs text-slate-500">
                      Max-loss headroom remaining: {fmtMoney(maxLossRemaining)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Select a connected account to compare this risk against your live daily-loss
                  and max-loss allowances. Rule of thumb: risk ≤ 1% per trade and keep total
                  open risk under 2% on challenges.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-500">
              Formula: lots = risk$ ÷ (SL pips × pip value per lot). Pip values assume
              standard 100k lots in a USD account; crosses use your editable conversion rate.
              Works the same for demo and live accounts on any broker — verify contract size
              for gold/indices with your broker.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex justify-between border-b border-slate-800/60 pb-2">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold tabular-nums ${tone === "warn" ? "text-amber-300" : "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}
