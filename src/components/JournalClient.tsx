"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/format";

type AccountLite = {
  id: number;
  login: string;
  propFirm: string;
  platform: string;
  accountType: string;
};

type Entry = {
  id: number;
  accountId: number;
  tradeId: number | null;
  ticket: string | null;
  symbol: string | null;
  title: string;
  body: string | null;
  tags: string | null;
  mood: string | null;
  rating: number;
  result: string | null;
  pnl: string | null;
  createdAt: string;
};

type TradeOpt = {
  id: number;
  ticket: string;
  symbol: string;
  type: string;
  profit: string;
  strategy: string | null;
  closedAt: string;
};

const MOODS = ["confident", "neutral", "anxious", "fomo", "revenge"] as const;
const RESULTS = ["win", "loss", "breakeven", "open"] as const;

const moodColor: Record<string, string> = {
  confident: "bg-emerald-500/15 text-emerald-300",
  neutral: "bg-slate-600/40 text-slate-300",
  anxious: "bg-amber-500/15 text-amber-300",
  fomo: "bg-purple-500/15 text-purple-300",
  revenge: "bg-red-500/15 text-red-300",
};
const resultColor: Record<string, string> = {
  win: "bg-emerald-500/15 text-emerald-300",
  loss: "bg-red-500/15 text-red-300",
  breakeven: "bg-sky-500/15 text-sky-300",
  open: "bg-slate-600/40 text-slate-300",
};

export default function JournalClient({
  accounts,
  activeAccountId,
  currency,
  initialEntries,
  trades,
}: {
  accounts: AccountLite[];
  activeAccountId: number;
  currency: string;
  initialEntries: Entry[];
  trades: TradeOpt[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [busy, setBusy] = useState(false);

  // form
  const [form, setForm] = useState({
    tradeId: "",
    title: "",
    journalBody: "",
    tags: "",
    mood: "neutral",
    rating: 3,
    result: "open",
  });

  const filtered = useMemo(() => {
    return initialEntries.filter((e) => {
      if (moodFilter && e.mood !== moodFilter) return false;
      if (resultFilter && e.result !== resultFilter) return false;
      if (q) {
        const hay = `${e.title} ${e.body ?? ""} ${e.tags ?? ""} ${e.symbol ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [initialEntries, q, moodFilter, resultFilter]);

  const analysis = useMemo(() => {
    const byMood: Record<string, { n: number; pnl: number; wins: number }> = {};
    const byTag: Record<string, { n: number; pnl: number }> = {};
    let wins = 0, closed = 0, ratingSum = 0;
    for (const e of initialEntries) {
      const pnl = e.pnl != null ? Number(e.pnl) : null;
      const isWin = pnl != null ? pnl > 0 : e.result === "win";
      const isClosed = pnl != null || (e.result === "win" || e.result === "loss");
      if (isClosed) {
        closed++;
        if (isWin) wins++;
      }
      ratingSum += e.rating;
      if (e.mood) {
        byMood[e.mood] ??= { n: 0, pnl: 0, wins: 0 };
        byMood[e.mood].n++;
        byMood[e.mood].pnl += pnl ?? 0;
        if (isWin && isClosed) byMood[e.mood].wins++;
      }
      for (const raw of (e.tags ?? "").split(",")) {
        const tag = raw.trim().toLowerCase();
        if (!tag) continue;
        byTag[tag] ??= { n: 0, pnl: 0 };
        byTag[tag].n++;
        byTag[tag].pnl += pnl ?? 0;
      }
    }
    const moodRows = MOODS.filter((m) => byMood[m]).map((m) => ({
      mood: m,
      ...byMood[m],
      wr: byMood[m].n ? (byMood[m].wins / byMood[m].n) * 100 : 0,
    }));
    const tagRows = Object.entries(byTag)
      .map(([tag, v]) => ({ tag, ...v }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
    return {
      total: initialEntries.length,
      journaledWr: closed ? (wins / closed) * 100 : 0,
      avgRating: initialEntries.length ? ratingSum / initialEntries.length : 0,
      moodRows,
      tagRows,
    };
  }, [initialEntries]);

  function pickTrade(tradeId: string) {
    const t = trades.find((x) => String(x.id) === tradeId);
    setForm((f) => ({
      ...f,
      tradeId,
      title: t ? `${t.symbol} ${t.type} — review` : f.title,
      result: t ? (Number(t.profit) > 0 ? "win" : "loss") : f.result,
    }));
  }

  async function submit() {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    try {
      const t = trades.find((x) => String(x.id) === form.tradeId);
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeAccountId,
          tradeId: t ? t.id : null,
          ticket: t?.ticket ?? null,
          symbol: t?.symbol ?? null,
          title: form.title,
          journalBody: form.journalBody,
          tags: form.tags,
          mood: form.mood,
          rating: form.rating,
          result: form.result,
          pnl: t ? Number(t.profit) : null,
        }),
      });
      if (res.ok) {
        setForm({ tradeId: "", title: "", journalBody: "", tags: "", mood: "neutral", rating: 3, result: "open" });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/journal/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-[1400px] px-6 py-10">
        <Link href="/" className="text-sm text-cyan-400 hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Trading Journal</h1>
            <p className="mt-1 text-slate-400">
              Log entries against real trades, track mindset and find the setups that
              actually make you money.
            </p>
          </div>
          <select
            value={activeAccountId}
            onChange={(e) => router.push(`/journal?account=${e.target.value}`)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.login} · {a.propFirm} · {a.accountType.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Analysis strip */}
        <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-3">
          <StatCard label="Entries" value={String(analysis.total)} />
          <StatCard
            label="Journaled win rate"
            value={`${analysis.journaledWr.toFixed(1)}%`}
            tone={analysis.journaledWr >= 50 ? "up" : "down"}
          />
          <StatCard label="Avg self-rating" value={`${analysis.avgRating.toFixed(1)}/5`} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Entries */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <input
                placeholder="Search title, notes, tags, symbol…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-w-56 flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-500"
              />
              <select
                value={moodFilter}
                onChange={(e) => setMoodFilter(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-2 text-sm"
              >
                <option value="">All moods</option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-2 text-sm"
              >
                <option value="">All results</option>
                {RESULTS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 space-y-3">
              {filtered.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
                  {initialEntries.length === 0
                    ? "No entries yet — log your first trade review on the right."
                    : "No entries match your filters."}
                </div>
              )}
              {filtered.map((e) => {
                const pnl = e.pnl != null ? Number(e.pnl) : null;
                return (
                  <article key={e.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-100">{e.title}</h3>
                        {e.symbol && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
                            {e.symbol}
                          </span>
                        )}
                        {e.mood && (
                          <span className={`rounded px-1.5 py-0.5 text-xs ${moodColor[e.mood] ?? "bg-slate-700"}`}>
                            {e.mood}
                          </span>
                        )}
                        {e.result && (
                          <span className={`rounded px-1.5 py-0.5 text-xs ${resultColor[e.result] ?? "bg-slate-700"}`}>
                            {e.result}
                          </span>
                        )}
                        <span className="text-amber-300" title={`Self rating ${e.rating}/5`}>
                          {"★".repeat(e.rating)}
                          <span className="text-slate-600">{"★".repeat(5 - e.rating)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {pnl != null && (
                          <span className={`font-mono text-sm font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtMoney(pnl, currency)}
                          </span>
                        )}
                        <button
                          onClick={() => remove(e.id)}
                          className="text-xs text-slate-600 hover:text-red-400"
                          title="Delete entry"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {e.body && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{e.body}</p>}
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex flex-wrap gap-1">
                        {(e.tags ?? "").split(",").filter(Boolean).map((t) => (
                          <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5">#{t.trim()}</span>
                        ))}
                        {e.ticket && <span className="rounded bg-slate-800 px-1.5 py-0.5">ticket #{e.ticket}</span>}
                      </div>
                      <span>{new Date(e.createdAt).toLocaleString()}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">New journal entry</h3>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">
                    Link a trade (optional)
                  </span>
                  <select
                    value={form.tradeId}
                    onChange={(e) => pickTrade(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                  >
                    <option value="">— manual entry —</option>
                    {trades.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.ticket} {t.symbol} {t.type} {fmtMoney(Number(t.profit), currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  placeholder="Title (e.g. EURUSD breakout — followed plan)"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                />
                <textarea
                  placeholder="What was the setup? Did you follow your rules? What will you repeat / avoid?"
                  rows={4}
                  value={form.journalBody}
                  onChange={(e) => setForm({ ...form, journalBody: e.target.value })}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                />
                <input
                  placeholder="Tags: london, breakout, a-setup"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-500"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={form.mood}
                    onChange={(e) => setForm({ ...form, mood: e.target.value })}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2"
                  >
                    {MOODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={form.result}
                    onChange={(e) => setForm({ ...form, result: e.target.value })}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2"
                  >
                    {RESULTS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <select
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2"
                  >
                    {[1, 2, 3, 4, 5].map((r) => (
                      <option key={r} value={r}>{r}★</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={submit}
                  disabled={busy || !form.title.trim()}
                  className="w-full rounded-md bg-cyan-500 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Log entry"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">Mindset analysis</h3>
              {analysis.moodRows.length === 0 && (
                <p className="text-xs text-slate-500">No mood-tagged entries yet.</p>
              )}
              <div className="space-y-2 text-sm">
                {analysis.moodRows.map((m) => (
                  <div key={m.mood} className="flex items-center justify-between">
                    <span className={`rounded px-2 py-0.5 text-xs ${moodColor[m.mood]}`}>{m.mood}</span>
                    <span className="text-xs text-slate-400">
                      {m.n} entries · WR {m.wr.toFixed(0)}% ·{" "}
                      <span className={m.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmtMoney(m.pnl, currency)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">Top setup tags</h3>
              {analysis.tagRows.length === 0 && (
                <p className="text-xs text-slate-500">No tags yet.</p>
              )}
              <div className="space-y-1.5 text-sm">
                {analysis.tagRows.map((t) => (
                  <div key={t.tag} className="flex items-center justify-between text-xs">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5">#{t.tag}</span>
                    <span className="text-slate-400">
                      ×{t.n}{" "}
                      <span className={t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmtMoney(t.pnl, currency)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-slate-100"}`}
      >
        {value}
      </div>
    </div>
  );
}
