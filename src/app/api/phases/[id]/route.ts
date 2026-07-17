import { db } from "@/db";
import { accounts, phases } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * PATCH: transition a phase status.
 * Body: { status: "active" | "passed" | "failed" | "locked" }
 *
 * When a phase passes: it completes, the next phase (if any) activates and
 * the account's rule set + phase label are updated to match it.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const phaseId = Number(id);
  if (!Number.isFinite(phaseId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const allowed = ["active", "passed", "failed", "locked"];
  if (!body.status || !allowed.includes(body.status)) {
    return Response.json({ error: "status must be one of " + allowed.join(", ") }, { status: 400 });
  }

  const [phase] = await db
    .select()
    .from(phases)
    .where(eq(phases.id, phaseId))
    .limit(1);
  if (!phase) return Response.json({ error: "phase not found" }, { status: 404 });

  const now = new Date();

  await db
    .update(phases)
    .set({
      status: body.status,
      ...(body.status === "active" ? { startedAt: now } : {}),
      ...(body.status === "passed" || body.status === "failed"
        ? { completedAt: now }
        : {}),
    })
    .where(eq(phases.id, phaseId));

  let nextPhaseId: number | null = null;

  if (body.status === "passed") {
    const [next] = await db
      .select()
      .from(phases)
      .where(and(eq(phases.accountId, phase.accountId), eq(phases.sequence, phase.sequence + 1)))
      .limit(1);
    if (next) {
      nextPhaseId = next.id;
      await db
        .update(phases)
        .set({ status: "active", startedAt: now })
        .where(eq(phases.id, next.id));

      // Account rolls into the next phase: new rules + baseline = current balance
      const [acct] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, phase.accountId))
        .limit(1);
      if (acct) {
        await db
          .update(accounts)
          .set({
            phase: next.name,
            initialBalance: acct.balance,
            profitTargetPct: next.profitTargetPct,
            dailyLossLimitPct: next.dailyLossLimitPct,
            maxLossLimitPct: next.maxLossLimitPct,
            minTradingDays: next.minTradingDays,
            tradingDaysCompleted: 0,
            status: "active",
          })
          .where(eq(accounts.id, phase.accountId));
      }
    } else {
      // Last phase passed → fully funded/complete
      await db
        .update(accounts)
        .set({ status: "passed" })
        .where(eq(accounts.id, phase.accountId));
    }
  }

  if (body.status === "failed") {
    await db
      .update(accounts)
      .set({ status: "breached" })
      .where(eq(accounts.id, phase.accountId));
  }

  if (body.status === "active") {
    // Re-activating: lock other non-completed phases
    const others = await db
      .select()
      .from(phases)
      .where(eq(phases.accountId, phase.accountId));
    for (const o of others) {
      if (o.id === phaseId) continue;
      if (o.sequence < phase.sequence) {
        await db.update(phases).set({ status: "passed" }).where(eq(phases.id, o.id));
      } else if (o.sequence > phase.sequence) {
        await db.update(phases).set({ status: "locked" }).where(eq(phases.id, o.id));
      }
    }
    await db
      .update(accounts)
      .set({
        phase: phase.name,
        profitTargetPct: phase.profitTargetPct,
        dailyLossLimitPct: phase.dailyLossLimitPct,
        maxLossLimitPct: phase.maxLossLimitPct,
        minTradingDays: phase.minTradingDays,
        status: "active",
      })
      .where(eq(accounts.id, phase.accountId));
  }

  return Response.json({ ok: true, nextPhaseId });
}
