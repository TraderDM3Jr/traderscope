"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setErr("Incorrect password");
        setBusy(false);
      }
    } catch {
      setErr("Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#0b1220] px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl"
      >
        <div className="text-sm uppercase tracking-[0.08em] text-slate-500">TraderScope</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100">Enter password</h1>
        <p className="mt-1 text-sm text-slate-500">This dashboard is private.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          placeholder="Password"
          className="mt-5 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
        />
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <button
          disabled={busy}
          className="mt-5 w-full rounded-md bg-cyan-500 py-2 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
