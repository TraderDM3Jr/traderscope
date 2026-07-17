import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  let body: Partial<{
    title: string;
    journalBody: string | null;
    tags: string | null;
    mood: string | null;
    rating: number;
    result: string | null;
    pnl: number | null;
  }>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  await db
    .update(journalEntries)
    .set({
      ...(body.title !== undefined ? { title: body.title.slice(0, 200) } : {}),
      ...(body.journalBody !== undefined ? { body: body.journalBody } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.mood !== undefined ? { mood: body.mood } : {}),
      ...(body.rating !== undefined
        ? { rating: Math.min(5, Math.max(1, body.rating)) }
        : {}),
      ...(body.result !== undefined ? { result: body.result } : {}),
      ...(body.pnl !== undefined ? { pnl: body.pnl != null ? String(body.pnl) : null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(journalEntries.id, entryId));
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  await db.delete(journalEntries).where(eq(journalEntries.id, entryId));
  return Response.json({ ok: true });
}
