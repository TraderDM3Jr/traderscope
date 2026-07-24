import { db } from "@/db";
import { protectionSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProtectionState, acknowledgeRisk } from "@/lib/risk";

export const dynamic = "force-dynamic";

// GET: current protection settings + recent risk events
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  return Response.json(await getProtectionState(accountId));
}

// POST: create or update this account's protection thresholds
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  let b: {
    enabled?: boolean;
    dailyLossLimitUsd?: number;
    warningPct?: number;
    trimPct?: number;
    killPct?: number;
    ackTimeoutSeconds?: number;
  };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(protectionSettings)
    .where(eq(protectionSettings.accountId, accountId))
    .limit(1);

  const values = {
    enabled: b.enabled ?? existing[0]?.enabled ?? false,
    dailyLossLimitUsd: String(b.dailyLossLimitUsd ?? existing[0]?.dailyLossLimitUsd ?? 0),
    warningPct: String(b.warningPct ?? existing[0]?.warningPct ?? 60),
    trimPct: String(b.trimPct ?? existing[0]?.trimPct ?? 80),
    killPct: String(b.killPct ?? existing[0]?.killPct ?? 95),
    ackTimeoutSeconds: b.ackTimeoutSeconds ?? existing[0]?.ackTimeoutSeconds ?? 300,
    updatedAt: new Date(),
  };

  if (existing.length) {
    await db.update(protectionSettings).set(values).where(eq(protectionSettings.accountId, accountId));
  } else {
    await db
      .insert(protectionSettings)
      .values({ accountId, ...values, createdAt: new Date() });
  }
  return Response.json({ ok: true, settings: values });
}

// POST /ack: acknowledge the open warning (cancels auto-escalation)
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  return Response.json(await acknowledgeRisk(accountId));
}
