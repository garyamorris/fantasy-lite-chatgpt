import type { CSSProperties } from "react";

type Series = {
  values: (number | null)[];
  color?: string;
  dashed?: boolean;
};

type SparklineProps = {
  series: Series[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  padding?: number;
  className?: string;
  style?: CSSProperties;
};

function extent(series: Series[]) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const s of series) {
    for (const v of s.values) {
      if (typeof v !== "number") continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }
  return { min, max };
}

function buildPath(values: (number | null)[], min: number, max: number, w: number, h: number, pad: number) {
  const n = values.length;
  if (n === 0) return "";

  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  const denom = Math.max(1e-9, max - min);

  const points: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (typeof v !== "number") continue;
    const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const t = (v - min) / denom;
    const y = pad + (1 - t) * innerH;
    points.push([x, y]);
  }

  if (points.length === 0) return "";
  return points.map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

export function Sparkline({
  series,
  width = 140,
  height = 36,
  strokeWidth = 2,
  padding = 2,
  className,
  style,
}: SparklineProps) {
  const ex = extent(series);
  if (!ex) {
    return <svg className={className} style={style} width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }

  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden="true"
    >
      <path
        d={`M ${padding} ${(height - padding).toFixed(2)} L ${(width - padding).toFixed(2)} ${(height - padding).toFixed(2)}`}
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={1}
        fill="none"
      />
      {series.map((s, idx) => {
        const d = buildPath(s.values, ex.min, ex.max, width, height, padding);
        if (!d) return null;
        return (
          <path
            key={idx}
            d={d}
            stroke={s.color ?? "rgba(255,255,255,0.8)"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.95}
            strokeDasharray={s.dashed ? "4 4" : undefined}
          />
        );
      })}
    </svg>
  );
}

