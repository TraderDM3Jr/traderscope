import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraderScope · Prop Firm Trading Monitor",
  description:
    "Live MT4/MT5 monitoring for demo & live accounts on any broker — balance, equity, drawdown, compliance phases, trading journal & risk calculator.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0b1220] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
