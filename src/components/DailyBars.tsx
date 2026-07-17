"use client";

type Daily = {
  day: string;
  pnl: string;
  dailyDrawdownPct: string;
  tradesCount: number;
};

export function DailyBars({ daily }: { daily: Daily[] }) {
  const W = 900;
  const H = 180;
  const P = { l: 40, r: 20, t: 20, b: 30 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  if (!daily.length) {
    return <div className="text-sm text-slate-500">No daily data.</div>;
  }
  const vals = daily.map((d) => Number(d.pnl));
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = Math.max(Math.abs(max), Math.abs(min)) || 1;
  const zero = P.t + ih / 2;
  const bw = iw / daily.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={P.l} x2={W - P.r} y1={zero} y2={zero} stroke="#334155" />
      {daily.map((d, i) => {
        const v = Number(d.pnl);
        const h = (Math.abs(v) / range) * (ih / 2);
        const x = P.l + i * bw + bw * 0.15;
        const w = bw * 0.7;
        const y = v >= 0 ? zero - h : zero;
        const color = v >= 0 ? "#22c55e" : "#ef4444";
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={w} height={h} fill={color} rx="2" opacity="0.85">
              <title>{`${d.day}: $${v.toFixed(2)} (${d.tradesCount} trades)`}</title>
            </rect>
            {i % Math.ceil(daily.length / 8) === 0 && (
              <text
                x={x + w / 2}
                y={H - 10}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
              >
                {d.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
