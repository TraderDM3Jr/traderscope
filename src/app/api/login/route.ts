import { NextResponse } from "next/server";
import crypto from "crypto";

const PEPPER = process.env.APP_PEPPER ?? "traderscope-static-pepper";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let password = "";
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = crypto
    .createHash("sha256")
    .update(password + PEPPER)
    .digest("hex");

  const res = NextResponse.json({ ok: true });
  res.cookies.set("ts_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
