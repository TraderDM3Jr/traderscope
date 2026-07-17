import { db } from "@/db";
import { accounts, phases } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = Number(searchParams.get("accountId"));
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "accountId required" }, { status: 400 });
  }
  const rows = await db
    .select()
    .from(phases)
    .where(eq(phases.accountId, accountId))
    .orderBy(asc(phases.sequence));
  return Response.json(rows);
}

/**
 * POST: create a default 3-level challenge ladder for an account.
 * Body: { accountId, preset?: "standard" | "aggressive", initialBalance? }
 */
export async function POST(req: Request) {
  let body: {
    accountId?: number;
    preset?: string;
    initialBalance?: number;
    custom?: Array<{
      name: string;
      profitTargetPct: number;
      dailyLossLimitPct: number;
      maxLossLimitPct: number;
      minTradingDays: number;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const accountId = body.accountId;
  if (!accountId) return Response.json({ error: "accountId required" }, { status: 400 });

  const [acct] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!acct) return Response.json({ error: "account not found" }, { status: 404 });

  // Replace any existing ladder
  await db.delete(phases).where(eq(phases.accountId, accountId));
  const initialBalance = body.initialBalance ?? Number(acct.initialBalance);
  const presets: Record<string, Array<{ name: string; profitTargetPct: number; dailyLossLimitPct: number; maxLossLimitPct: number; minTradingDays: number }>> = {
    standard: [
      { name: "Phase 1", profitTargetPct: 8, dailyLossLimitPct: 5, maxLossLimitPct: 10, minTradingDays: 5 },
      { name: "Phase 2", profitTargetPct: 5, dailyLossLimitPct: 5, maxLossLimitPct: 10, minTradingDays: 5 },
      { name: "Funded", profitTargetPct: 0, dailyLossLimitPct: 5, maxLossLimitPct: 10, minTradingDays: 0 },
    ],
    aggressive: [
      { name: "Phase 1", profitTargetPct: 10, dailyLossLimitPct: 4, maxLossLimitPct: 8, minTradingDays: 3 },
      { name: "Phase 2", profitTargetPct: 8, dailyLossLimitPct: 4, maxLossLimitPct: 8, minTradingDays: 3 },
      { name: "Funded", profitTargetPct: 0, dailyLossLimitPct: 4, maxLossLimitPct: 8, minTradingDays: 0 },
    ],
  };
  const ladder = body.custom ?? presets[body.preset === "aggressive" ? "aggressive" : "standard"];

  const now = new Date();
  const createdIds: number[] = [];
  for (let i = 0; i < ladder.length; i++) {
    const p = ladder[i];
    const isFunded = p.name.toLowerCase().includes("funded");
    const [row] = await db
      .insert(phases)
      .values({
        accountId,
        sequence: i,
        name: p.name,
        status: i === 0 ? "active" : "locked",
        initialBalance: initialBalance.toFixed(2),
        profitTargetPct: p.profitTargetPct.toFixed(2),
        dailyLossLimitPct: p.dailyLossLimitPct.toFixed(2),
        maxLossLimitPct: p.maxLossLimitPct.toFixed(2),
        minTradingDays: p.minTradingDays,
        startedAt: i === 0 ? now : null,
      })
      .returning({ id: phases.id });
    createdIds.push(row.id);
    void isFunded;
  }

  // Mirror rules of the active phase + current balance into the account row
  const first = ladder[0];
  await db
    .update(accounts)
    .set({
      phase: first.name,
      initialBalance: initialBalance.toFixed(2),
      profitTargetPct: first.profitTargetPct.toFixed(2),
      dailyLossLimitPct: first.dailyLossLimitPct.toFixed(2),
      maxLossLimitPct: first.maxLossLimitPct.toFixed(2),
      minTradingDays: first.minTradingDays,
      tradingDaysCompleted: 0,
      status: "active",
    })
    .where(eq(accounts.id, accountId));

  return Response.json({ ok: true, created: createdIds.length });
}

/** DELETE ?accountId= : remove the whole ladder */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = Number(searchParams.get("accountId"));
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "accountId required" }, { status: 400 });
  }
  await db.delete(phases).where(eq(phases.accountId, accountId));
  return Response.json({ ok: true });
}
