// Hand-rolled SVG charts. Blue = present/positive, black = absent/negative,
// border color = neutral — the design system forbids every other accent color.

export type DonutSegment = { value: number; tone: "primary" | "absent" | "neutral" };

const TONE_STROKE = {
  primary: "stroke-primary",
  absent: "stroke-absent",
  neutral: "stroke-border",
} as const;

export function Donut({
  segments,
  center,
  label,
  size = 148,
}: {
  segments: DonutSegment[];
  center: string;
  label: string;
  size?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 15.9155; // circumference ≈ 100 in a 42×42 viewBox
  let offset = 25; // start at 12 o'clock

  return (
    <svg
      viewBox="0 0 42 42"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="mx-auto block"
    >
      <circle cx="21" cy="21" r={radius} fill="none" strokeWidth="5" className="stroke-surface" />
      {total > 0
        ? segments.map((segment, index) => {
            const share = (segment.value / total) * 100;
            const dasharray = `${Math.max(0, share)} ${100 - Math.max(0, share)}`;
            const element = (
              <circle
                key={index}
                cx="21"
                cy="21"
                r={radius}
                fill="none"
                strokeWidth="5"
                strokeDasharray={dasharray}
                strokeDashoffset={offset}
                className={TONE_STROKE[segment.tone]}
              />
            );
            offset -= share;
            return element;
          })
        : null}
      <text x="21" y="20" textAnchor="middle" className="fill-ink text-[7px] font-semibold">
        {center}
      </text>
      <text x="21" y="27" textAnchor="middle" className="fill-ink-muted text-[3px]">
        {label}
      </text>
    </svg>
  );
}

export function BarList({
  items,
  label,
}: {
  items: Array<{ label: string; value: number; display?: string }>;
  label: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">No data yet.</p>;
  }
  return (
    <div role="img" aria-label={label} className="space-y-3">
      {items.map((item) => {
        const percent = Math.round(item.value * 10) / 10;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="tabular-nums text-ink-muted">{item.display ?? `${percent}%`}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TrendLine({
  points,
  label,
}: {
  points: Array<{ label: string; value: number }>;
  label: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-ink-muted">No saved sessions yet.</p>;
  }
  if (points.length === 1) {
    return <p className="text-sm text-ink-muted">One saved session at {Math.round(points[0].value)}%.</p>;
  }

  const width = 100;
  const height = 40;
  const pad = 6;
  const step = (width - pad * 2) / (points.length - 1);
  const coords = points.map((point, index) => {
    const x = pad + index * step;
    const y = height - pad - ((Math.min(100, Math.max(0, point.value)) / 100) * (height - pad * 2));
    return `${x},${y}`;
  });
  const area = `M${pad},${height - pad} L${coords.join(" L")} L${width - pad},${height - pad} Z`;
  const last = points[points.length - 1];
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;

  return (
    <div role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" preserveAspectRatio="none">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="stroke-border" strokeWidth="0.5" />
        <line x1={pad} y1={pad} x2={width - pad} y2={pad} className="stroke-border" strokeWidth="0.5" strokeDasharray="2 2" />
        <path d={area} className="fill-primary-soft/50" />
        <polyline points={coords.join(" ")} fill="none" className="stroke-primary" strokeWidth="1.2" strokeLinejoin="round" />
        {coords.map((point, index) => {
          const [x, y] = point.split(",");
          return <circle key={index} cx={x} cy={y} r="1" className="fill-primary" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-ink-muted">
        <span>{points[0].label}</span>
        <span>
          Average {Math.round(average)}% · latest {Math.round(last.value)}% ({last.label})
        </span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}
