"use client";

interface RadarChartProps {
  labels: string[];
  values: number[];
  size?: number;
  color?: string;
}

export function RadarChart({
  labels,
  values,
  size = 220,
  color = "#3b82f6",
}: RadarChartProps) {
  const center = size / 2;
  const radius = size * 0.38;
  const count = labels.length;

  const points = values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = radius * Math.max(0.05, v);
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)] as const;
  });

  const polygon = points.map((p) => p.join(",")).join(" ");

  return (
    <svg width={size} height={size} className="mx-auto">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={labels
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
              const r = radius * ring;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}
      <polygon
        points={polygon}
        fill={`${color}33`}
        stroke={color}
        strokeWidth={2}
      />
      {labels.map((label, i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
        const x = center + (radius + 18) * Math.cos(angle);
        const y = center + (radius + 18) * Math.sin(angle);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-400 text-[9px]"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

interface GaugeChartProps {
  value: number;
  label: string;
  size?: number;
  color?: string;
}

export function GaugeChart({
  value,
  label,
  size = 140,
  color = "#10b981",
}: GaugeChartProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 1.4}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeDasharray={`${c * 0.75} ${c}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * 0.75} ${c}`}
          strokeDashoffset={offset * 0.75}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white text-2xl font-bold"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

interface TrendChartProps {
  points: { label: string; value: number }[];
  color?: string;
}

export function TrendChart({ points, color = "#f97316" }: TrendChartProps) {
  const width = 320;
  const height = 120;
  const pad = 24;
  const max = Math.max(...points.map((p) => p.value), 1);

  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - (p.value / max) * (height - pad * 2);
    return { ...p, x, y };
  });

  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="max-w-md">
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {coords.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r={4} fill={color} />
          <text x={c.x} y={height - 4} textAnchor="middle" className="fill-slate-500 text-[9px]">
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
