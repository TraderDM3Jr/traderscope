import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ts_session", "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const url = new URL("/login", req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set("ts_session", "", { path: "/", maxAge: 0 });
  return res;
}
