# TraderScope — Operations & Maintenance Runbook

How to **keep, control, update and grow** TraderScope.

---

## 1. Saving & version control (permanent home)

The dev sandbox is ephemeral per turn — to keep the work you **must** put it in Git and
push to your own remote (GitHub / GitLab / self-hosted). The project is already
initialised locally in this repo. To push it:

```bash
# (done once) configure an identity
git config user.name "Your Name"
git config user.email "you@example.com"

# add a remote and push
git remote add origin https://github.com/<you>/traderscope.git
git push -u origin main
```

If you want me to push for you in a future session, paste a repo URL and a
GitHub **PAT** (fine-grained, `contents:write`) and I'll run the push.

> `.gitignore` already excludes `.env` and `node_modules` so secrets/builds never get committed.
> Always keep `INGEST_SECRET` in the host's secret store, never in the repo.

---

## 2. Local development loop

```bash
npm install
cp .env.example .env          # set DATABASE_URL + INGEST_SECRET
npx drizzle-kit push          # sync schema (safe, no data loss)
npm run dev
```

After **any** change to `src/db/schema.ts` run `npx drizzle-kit push` again.

### Validation before committing

```bash
npx next typegen
npm exec tsc -- --noEmit
npm run build
```

All three must pass. In this environment the platform also runs `build_and_start`
which boots Postgres, builds, starts and hits `/api/health`.

---

## 3. Deploying (control plane)

### Vercel
- Repo-based deploy; env vars set in *Project → Settings → Environment*.
- Build = `npm run build`, output auto-detected (standalone).
- Auto-deploys on `git push`; preview per PR.
- HTTPS, autoscale, function logs out of the box.

### Docker / VPS
- `docker compose up -d` for an all-in-one app + Postgres stack.
- On a bare VPS: `npm run build && npm run start` behind Caddy/Nginx (TLS).
- Keep it alive: `pm2 start "npm run start"` or a systemd unit.
- Reverse proxy must forward `/api/*` and serve TLS.

### Database
- Use a managed Postgres (Neon/Supabase/RDS) in production.
- `DATABASE_URL` in the host secret store.
- Schema drift handled by `npx drizzle-kit push` (idempotent).

---

## 4. Runtime control & monitoring

| Concern | How |
|---|---|
| **Health** | `GET /api/health` → `{ ok: true }` (wire into UptimeRobot/healthchecks.io) |
| **Logs** | Vercel: *Functions* logs. VPS: `pm2 logs` / `journalctl -u traderscope` |
| **Restart** | Vercel: redeploy. VPS: `pm2 restart traderscope` / `docker compose restart app` |
| **Secret rotation** | Change `INGEST_SECRET` in host env, redeploy, then update the EA's `IngestSecret` input |
| **Stop data ingestion** | Remove the EA from the chart (or set wrong secret). The dashboard keeps last state. |
| **Scale** | Vercel autoscales. VPS: add replicas behind a load balancer + shared Postgres. |
| **Data reset** | `drop schema public cascade;` then `npx drizzle-kit push` and reload to reseed. |

The EA is the **control lever for live data**: attach = streaming on, remove = off.
Switching monitored accounts is done in the dashboard dropdown (each EA pushes its own `login`).

---

## 5. Maintaining & extending the code

- **Add a metric**: compute it in `src/lib/metrics.ts`, expose via
  `src/app/api/accounts/[id]/dashboard/route.ts`, render in `Dashboard.tsx` + `EquityChart` etc.
- **Add a table**: define in `src/db/schema.ts` → `npx drizzle-kit push` → add queries in
  `src/lib/queries.ts` → add an API route → consume on the client.
- **Change rules**: phase rules live in `phases` table + `phases/[id]` transition API.
- **New chart**: drop an SVG component next to `EquityChart.tsx` (no chart lib needed).

Follow the same pattern as existing modules and keep each feature isolated so the
business roadmap below stays incremental.

---

## 6. Business adoption roadmap (incremental)

Each item is a small, additive module — none require a rewrite.

1. **Auth gate** — protect `/` and `/api/*` (NextAuth/Clerk, or a simple cookie passphrase).
   *Why first:* the dashboard currently shows balances to anyone with the URL.
2. **Multi-tenant `userId`** — add `userId` to `accounts`/`journalEntries`/`phases` and scope
   all queries by it. *Why:* lets multiple traders share one deployment.
3. **Alerts off-board** — POST breach events to Telegram/Discord/email (use a server route +
   a token from host env). *Why:* traders get warned even when AFK.
4. **Auto trade-kill** — EA polls `/api/accounts/[id]/dashboard`; if `dailyLossUsedPct >= 90`
   it closes all positions. *Why:* the single highest-value prop-firm safety feature.
5. **Payout tracker** — table for funded-phase withdrawals (amount, %, date, method).
6. **Portfolio view** — aggregate all accounts into one equity curve + combined DD.
7. **Exports** — CSV/PDF of daily stats for payout requests / tax.
8. **SaaS / white-label** — per-tenant branding + subscription (Stripe). Prop firms can offer
   traders a branded challenge room; funded traders pay £10–20/mo for the journal+risk tooling.

Prioritise 1 → 4; they convert a useful dashboard into a defensible, monetisable product.
