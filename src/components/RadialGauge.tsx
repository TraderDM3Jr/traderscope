"use client";

type Props = {
  value: number; // 0..100
  label: string;
  sublabel?: string;
  color?: string;
  danger?: boolean;
};

export function RadialGauge({ value, label, sublabel, color, danger }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  const stroke2 =
    color ??
    (danger
      ? pct >= 90
        ? "#ef4444"
        : pct >= 70
          ? "#f59e0b"
          : "#22c55e"
      : pct >= 90
        ? "#22c55e"
        : pct >= 40
          ? "#38bdf8"
          : "#64748b");

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#1e293b"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={stroke2}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 400ms ease" }}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          className="fill-white"
          fontSize="20"
          fontWeight="700"
        >
          {pct.toFixed(1)}%
        </text>
      </svg>
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
          {label}
        </div>
        {sublabel && <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>}
      </div>
    </div>
  );
}
