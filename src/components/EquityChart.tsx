"use client";

type Snap = { takenAt: string | Date; equity: string; balance: string };

type Props = {
  snapshots: Snap[];
  initialBalance: number;
  profitTargetPct: number;
  dailyLossLimitPct: number;
  maxLossLimitPct: number;
  todayStartBalance: number;
};

export function EquityChart({
  snapshots,
  initialBalance,
  profitTargetPct,
  maxLossLimitPct,
  dailyLossLimitPct,
  todayStartBalance,
}: Props) {
  const W = 900;
  const H = 320;
  const P = { l: 60, r: 20, t: 20, b: 30 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  if (!snapshots.length) {
    return (
      <div className="grid h-[320px] place-items-center text-sm text-slate-500">
        No equity data yet.
      </div>
    );
  }

  const eqValues = snapshots.map((s) => Number(s.equity));
  const balValues = snapshots.map((s) => Number(s.balance));

  const target = initialBalance * (1 + profitTargetPct / 100);
  const maxLossFloor = initialBalance * (1 - maxLossLimitPct / 100);
  const dailyLossFloor = todayStartBalance * (1 - dailyLossLimitPct / 100);

  const allY = [
    ...eqValues,
    ...balValues,
    target,
    maxLossFloor,
    dailyLossFloor,
    initialBalance,
  ];
  const yMin = Math.min(...allY) * 0.998;
  const yMax = Math.max(...allY) * 1.002;

  const xFor = (i: number) => P.l + (i / Math.max(1, snapshots.length - 1)) * iw;
  const yFor = (v: number) =>
    P.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const eqPath = eqValues
    .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`)
    .join(" ");
  const balPath = balValues
    .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`)
    .join(" ");

  const eqArea =
    eqPath +
    ` L${xFor(eqValues.length - 1)},${P.t + ih} L${xFor(0)},${P.t + ih} Z`;

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) * i) / yTicks;
    return { v, y: yFor(v) };
  });

  const last = eqValues[eqValues.length - 1];
  const lastColor = last >= initialBalance ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lastColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={lastColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grid */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={P.l}
            x2={W - P.r}
            y1={t.y}
            y2={t.y}
            stroke="#1e293b"
            strokeOpacity="0.35"
            strokeDasharray="3 4"
          />
          <text
            x={P.l - 8}
            y={t.y + 4}
            fill="#94a3b8"
            fontSize="10"
            textAnchor="end"
          >
            ${Math.round(t.v).toLocaleString()}
          </text>
        </g>
      ))}

      {/* threshold lines */}
      <line
        x1={P.l}
        x2={W - P.r}
        y1={yFor(target)}
        y2={yFor(target)}
        stroke="#22c55e"
        strokeDasharray="6 4"
        strokeOpacity="0.8"
      />
      <text x={W - P.r} y={yFor(target) - 4} fill="#22c55e" fontSize="10" textAnchor="end">
        Profit Target ${Math.round(target).toLocaleString()}
      </text>
      <line
        x1={P.l}
        x2={W - P.r}
        y1={yFor(initialBalance)}
        y2={yFor(initialBalance)}
        stroke="#64748b"
        strokeDasharray="2 4"
        strokeOpacity="0.7"
      />
      <text x={W - P.r} y={yFor(initialBalance) - 4} fill="#94a3b8" fontSize="10" textAnchor="end">
        Initial ${Math.round(initialBalance).toLocaleString()}
      </text>
      <line
        x1={P.l}
        x2={W - P.r}
        y1={yFor(dailyLossFloor)}
        y2={yFor(dailyLossFloor)}
        stroke="#f59e0b"
        strokeDasharray="6 4"
        strokeOpacity="0.85"
      />
      <text x={W - P.r} y={yFor(dailyLossFloor) - 4} fill="#f59e0b" fontSize="10" textAnchor="end">
        Daily Loss Floor
      </text>
      <line
        x1={P.l}
        x2={W - P.r}
        y1={yFor(maxLossFloor)}
        y2={yFor(maxLossFloor)}
        stroke="#ef4444"
        strokeDasharray="6 4"
        strokeOpacity="0.9"
      />
      <text x={W - P.r} y={yFor(maxLossFloor) - 4} fill="#ef4444" fontSize="10" textAnchor="end">
        Max Loss Floor
      </text>

      {/* Balance path (stepped-ish) */}
      <path d={balPath} fill="none" stroke="#38bdf8" strokeWidth="1.4" strokeOpacity="0.9" />
      {/* Equity area + line */}
      <path d={eqArea} fill="url(#eqGrad)" />
      <path d={eqPath} fill="none" stroke={lastColor} strokeWidth="2" />

      {/* end marker */}
      <circle cx={xFor(eqValues.length - 1)} cy={yFor(last)} r="4" fill={lastColor} />
    </svg>
  );
}
