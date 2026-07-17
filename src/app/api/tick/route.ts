import { db } from "@/db";
import { accounts, equitySnapshots, positions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Simulates live MT4/MT5 tick updates for SEEDED (demo) accounts only.
// Real accounts bridged via /api/ingest (source='ea') are left untouched,
// since their data comes from the MT4/MT5 terminal.
export async function POST() {
  const all = await db
    .select()
    .from(accounts)
    .where(eq(accounts.source, "seed"));
  const now = new Date();

  for (const acct of all) {
    const openPositions = await db
      .select()
      .from(positions)
      .where(eq(positions.accountId, acct.id));

    let floating = 0;
    for (const p of openPositions) {
      const openPx = Number(p.openPrice);
      const cur = Number(p.currentPrice);
      // small random price move (~0.01% - 0.05%)
      const drift = openPx * (Math.random() - 0.5) * 0.0006;
      const nextPx = Math.max(0.0001, cur + drift);
      const dir = p.type === "BUY" ? 1 : -1;
      const pipMult = p.symbol === "USDJPY"
        ? 1000
        : p.symbol === "XAUUSD"
          ? 100
          : 100000;
      const vol = Number(p.volume);
      const profit = ((nextPx - openPx) * dir * vol * pipMult) / 10;

      await db
        .update(positions)
        .set({ currentPrice: nextPx.toFixed(5), profit: profit.toFixed(2) })
        .where(eq(positions.id, p.id));

      floating += profit;
    }

    const balance = Number(acct.balance);
    const equity = balance + floating;
    const margin = Number(acct.margin) || 0;
    const freeMargin = equity - margin;
    const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

    await db
      .update(accounts)
      .set({
        equity: equity.toFixed(2),
        freeMargin: freeMargin.toFixed(2),
        marginLevel: marginLevel.toFixed(2),
        updatedAt: now,
      })
      .where(eq(accounts.id, acct.id));

    await db.insert(equitySnapshots).values({
      accountId: acct.id,
      balance: balance.toFixed(2),
      equity: equity.toFixed(2),
      drawdownPct: "0",
      takenAt: now,
    });
  }

  return Response.json({ ok: true, ticked: all.length, at: now.toISOString() });
}

export async function GET() {
  return Response.json({
    hint: "POST to trigger a simulated tick across all accounts.",
  });
}
