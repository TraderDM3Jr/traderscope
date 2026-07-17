import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = Number(searchParams.get("accountId"));
  if (!Number.isFinite(accountId)) {
    return Response.json({ error: "accountId required" }, { status: 400 });
  }
  const rows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.accountId, accountId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(200);
  return Response.json(rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
}

export async function POST(req: Request) {
  let body: {
    accountId?: number;
    tradeId?: number | null;
    ticket?: string | null;
    symbol?: string | null;
    title?: string;
    journalBody?: string | null;
    tags?: string | null;
    mood?: string | null;
    rating?: number;
    result?: string | null;
    pnl?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.accountId || !body.title?.trim()) {
    return Response.json({ error: "accountId and title required" }, { status: 400 });
  }
  const now = new Date();
  const [row] = await db
    .insert(journalEntries)
    .values({
      accountId: body.accountId,
      tradeId: body.tradeId ?? null,
      ticket: body.ticket ?? null,
      symbol: body.symbol ?? null,
      title: body.title.trim().slice(0, 200),
      body: body.journalBody?.trim() || null,
      tags: body.tags?.trim() || null,
      mood: body.mood ?? null,
      rating: Math.min(5, Math.max(1, body.rating ?? 3)),
      result: body.result ?? null,
      pnl: body.pnl != null ? String(body.pnl) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return Response.json({ ok: true, entry: row });
}
