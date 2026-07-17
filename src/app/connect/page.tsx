export const dynamic = "force-dynamic";

const steps = [
  {
    n: 1,
    title: "Download the bridge EA",
    body: (
      <>
        Download <b>MT5</b>:{" "}
        <a
          href="/downloads/PropDeskBridge.mq5"
          className="text-cyan-400 underline underline-offset-2"
        >
          PropDeskBridge.mq5
        </a>{" "}
        or <b>MT4</b>:{" "}
        <a
          href="/downloads/TraderScopeBridgeMT4.mq4"
          className="text-cyan-400 underline underline-offset-2"
        >
          TraderScopeBridgeMT4.mq4
        </a>{" "}
        and copy it into your MetaTrader data folder (
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">MQL5/Experts/</code> or{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">MQL4/Experts/</code>
        ). Open in MetaEditor and press <b>F7</b> to compile. Works on any broker, demo or
        live.
      </>
    ),
  },
  {
    n: 2,
    title: "Allow WebRequest for your dashboard URL",
    body: (
      <>
        In MT5 go to{" "}
        <b>Tools → Options → Expert Advisors</b>, tick{" "}
        <i>&quot;Allow WebRequest for listed URL&quot;</i> and add your dashboard base URL,
        e.g.{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
          https://your-app-domain.com
        </code>
        .
      </>
    ),
  },
  {
    n: 3,
    title: "Configure the EA inputs",
    body: (
      <>
        Set{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">IngestUrl</code> to your{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">/api/ingest</code> URL and{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">IngestSecret</code> to the{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">INGEST_SECRET</code> from your{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">.env</code>. Choose the push
        interval (default 3s) and whether to include recently closed deals.
      </>
    ),
  },
  {
    n: 4,
    title: "Attach the EA and watch the dashboard",
    body: (
      <>
        Drag <b>PropDeskBridge</b> onto any chart of the account you want to monitor. Within
        a few seconds the account appears in the dashboard account dropdown with live
        balance, equity, floating P/L, positions, compliance gauges and alerts. Attach one
        EA per terminal/account.
      </>
    ),
  },
];

export default function ConnectPage() {
  const secret = process.env.INGEST_SECRET ?? "propdesk_bridge_9f2e7a1c4d";
  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <a href="/" className="text-sm text-cyan-400 hover:underline">
          ← Back to dashboard
        </a>
        <h1 className="mt-4 text-3xl font-bold">Connect MT4 / MT5 — any broker, demo or live</h1>
        <p className="mt-2 text-slate-400">
          PropDesk receives live trading data from a lightweight Expert Advisor that posts
          account + position snapshots to{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            /api/ingest
          </code>{" "}
          over HTTP. No DLLs, no third-party services — everything flows straight into your
          PostgreSQL database.
        </p>

        <div className="mt-8 space-y-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-500/15 text-sm font-bold text-cyan-300">
                  {s.n}
                </span>
                <div>
                  <h3 className="font-semibold text-slate-100">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="font-semibold text-slate-100">Test the endpoint manually</h3>
          <p className="mt-1 text-sm text-slate-400">
            You can verify ingestion from any machine with curl before writing your own
            bridge:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
{`curl -X POST https://your-app-domain.com/api/ingest \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "account": {
      "login": "700012345",
      "broker": "FundedNext Markets",
      "server": "FundedNext-Server01",
      "platform": "MT5",
      "propFirm": "FundedNext",
      "phase": "Phase 1",
      "initialBalance": 100000,
      "profitTargetPct": 8,
      "dailyLossLimitPct": 5,
      "maxLossLimitPct": 10,
      "balance": 101250.40,
      "equity": 101812.10,
      "margin": 540.00,
      "freeMargin": 101272.10,
      "marginLevel": 18854.1
    },
    "positions": [
      {
        "ticket": "812341", "symbol": "EURUSD", "type": "BUY",
        "volume": 0.5, "openPrice": 1.08540, "currentPrice": 1.08612,
        "sl": 1.08100, "tp": 1.09200, "profit": 36.00,
        "comment": "London Breakout EA"
      }
    ]
  }'`}
          </pre>
        </div>

        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200/90">
          <b>Tip:</b> the demo tick simulator only touches seeded accounts. Accounts pushed
          by a real EA (<code className="rounded bg-slate-800 px-1 py-0.5">source = ea</code>)
          are never overwritten by the simulator, so real and demo accounts can safely
          coexist in the account dropdown.
        </div>
      </div>
    </div>
  );
}
