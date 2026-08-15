interface SparklineProps {
  points: number[];
  color?: string;
  className?: string;
}

export function Sparkline({
  points,
  color = "#3b82f6",
  className = "h-10 w-full",
}: SparklineProps) {
  const series = points.some((value) => value > 0)
    ? points
    : [0, 0, 0, 0, 0, 0, 1];

  const max = Math.max(...series, 1);
  const min = Math.min(...series);
  const range = Math.max(max - min, 1);

  const coords = series.map((value, index) => {
    const x = (index / (series.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 80 - 10;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 100 100" className={className} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}
