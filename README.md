# TraderScope — Prop-Firm Trading Monitor

A fullstack monitoring dashboard for prop-firm traders. It connects your **MT4 / MT5**
terminal (MetaTrader on any broker, demo **or** live) and shows live:

- Balance, Equity, Floating P/L, Free Margin, Margin Level
- Prop-firm **compliance gauges**: Profit Target, Daily Loss, Max Loss, Min Trading Days
- Equity & Balance curve with target / loss-floor threshold lines
- Daily P/L bars, trade statistics (win rate, profit factor, avg win/loss)
- Open positions, recent trade history, **currency/symbol matrix**, **strategy/EA analytics**
- **Trading Journal** (linked to real trades, mindset tags, setup analysis)
- **Risk Calculator** (lot sizing with live allowance safety checks)
- **Phase System** (multi-level challenge ladder that auto-rolls on pass)

Stack: **Next.js 16 (App Router) · React 19 · Drizzle ORM · PostgreSQL · Tailwind v4**.
No external chart libraries — all charts are hand-built SVG.

---

## Quick start (local)

```bash
npm install
cp .env.example .env          # fill DATABASE_URL + INGEST_SECRET
# start a local Postgres and create the `app_db` database, then:
npx drizzle-kit push          # create tables
npm run dev                   # http://localhost:3000  (auto-seeds on first load)
```

The app auto-seeds three demo accounts (FundedNext / FTMO / The5ers) on first visit.
Demo accounts tick every 3s; real EA-fed accounts are never overwritten by the simulator.

---

## Project structure

```
src/
  app/
    page.tsx                      # main live dashboard (server)
    journal/                      # Trading Journal
    risk-calculator/              # Lot-size / risk tool
    phases/                       # Challenge phase ladder
    connect/                      # EA install guide + download links
    api/
      health/                     # GET  -> { ok }
      seed/                       # POST -> idempotent seed
      tick/                       # POST -> simulated tick (demo accounts only)
      ingest/                     # POST -> EA bridge (Bearer auth)
      accounts/[id]/dashboard/    # GET  -> full dashboard payload
      journal/  journal/[id]/     # CRUD journal entries
      phases/   phases/[id]/      # CRUD + transition phases
  components/                     # Dashboard, RiskCalculator, JournalClient, PhasesClient, charts
  db/ schema.ts index.ts          # Drizzle tables + pool
  lib/ metrics.ts format.ts queries.ts seed.ts
public/downloads/                 # PropDeskBridge.mq5 + TraderScopeBridgeMT4.mq4
```

---

## Connect your broker (MT4 / MT5, any broker)

1. Open `/connect` in the app and download the bridge for your terminal:
   - **MT5** → `PropDeskBridge.mq5`
   - **MT4** → `TraderScopeBridgeMT4.mq4`
2. Compile in MetaEditor (<kbd>F7</kbd>), then in MT4/MT5:
   *Tools → Options → Expert Advisors → Allow WebRequest* and whitelist your app URL.
3. Set EA inputs `IngestUrl = https://<your-app>/api/ingest` and
   `IngestSecret = <your INGEST_SECRET>`.
4. Enable AutoTrading and attach the EA to any chart.
5. Within seconds the account appears in the dashboard dropdown with live data.
   `IsDemo()` is detected automatically and shown as `DEMO`/`LIVE`.

The terminal POSTs `{ account, positions, trades }` JSON to `/api/ingest` every few
seconds. No DLLs, no third-party services — straight into your Postgres.

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `INGEST_SECRET` | yes | Bearer token the EA must present |
| `APP_PASSWORD` | yes* | Dashboard login password (the gate) — *required once auth is enabled |
| `APP_PEPPER` | no | Extra salt for the session cookie |
| `TELEGRAM_BOT_TOKEN` | no | Telegram bot token for breach alerts |
| `TELEGRAM_CHAT_ID` | no | Telegram chat/group id for alerts |
| `DISCORD_WEBHOOK_URL` | no | Discord (or Slack) webhook for alerts |
| `NEXT_PUBLIC_APP_URL` | no | Base URL for docs/webhook hints |

---

## Deploy

### Option A — Vercel (easiest, HTTPS + autoscale)

1. Push the repo to GitHub (see `OPERATIONS.md`).
2. *New Project* → import repo → Framework *Next.js* (auto-detected).
3. Add env vars `DATABASE_URL` and `INGEST_SECRET` in *Project → Settings → Environment*.
4. Add a hosted Postgres (Neon / Supabase) and paste its URL as `DATABASE_URL`.
5. **Create the production tables once** (the app auto-*seeds* data but does not
   auto-create tables). From your local machine, point `drizzle-kit` at the prod DB:
   ```bash
   DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB npx drizzle-kit push
   ```
   `drizzle-kit push` is idempotent — run it once per database, it won't drop data.
6. Deploy. On first load the app seeds itself.
7. In MT4/MT5, whitelist the Vercel URL and point the EA at `/api/ingest`.

### Option B — Self-hosted (Docker / VPS)

```bash
docker compose up -d          # app + Postgres, http://localhost:3000
# or build & run the image directly:
docker build -t traderscope .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e INGEST_SECRET=... \
  traderscope
```

For a VPS without Docker, use `npm run build && npm run start` behind a reverse
proxy (Caddy/Nginx) with TLS, and manage the process with `pm2` or systemd.

See `OPERATIONS.md` for monitoring, secret rotation, restart and scaling.

---

## Business adoption (see OPERATIONS.md → "Roadmap")

The repo is structured so the next steps are additive, not rewrites:
auth gate → multi-tenant `userId` → Telegram/email alerts → auto trade-kill →
payout tracker → white-label SaaS. Each is a small, isolated module.

---

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (standalone) |
| `npm run start` | Run the built server |
| `npx drizzle-kit push` | Apply schema changes to the DB |
| `npx next typegen` | Regenerate route types |

---

## License

Internal / commercial use by the owner. Add a LICENSE file before open-sourcing.
