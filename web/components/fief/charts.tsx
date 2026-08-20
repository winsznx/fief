import type { DecisionEntry } from '@/lib/data/types';
import { cn } from '@/lib/utils';

/**
 * Provenance sparkline — one tick per recent entry.
 *
 * D11: the ticks use the semantic accepted/rejected colours because they encode
 * provenance, which is exactly what those colours mean. Rejected ticks are also
 * drawn taller and full-height so the distinction survives greyscale.
 *
 * This is NOT a value chart. It shows nothing about performance.
 */
export function ProvenanceSparkline({
  entries,
  className,
  height = 24,
}: {
  entries: DecisionEntry[];
  className?: string;
  height?: number;
}) {
  const shown = entries.slice(-40);
  if (shown.length === 0) return null;

  const gap = 1;
  const barWidth = 3;
  const width = shown.length * (barWidth + gap);
  const accepted = shown.filter((e) => e.status === 'accepted').length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn('block', className)}
      role="img"
      aria-label={`Last ${shown.length} entries: ${accepted} accepted, ${
        shown.length - accepted
      } rejected`}
    >
      {shown.map((e, i) => {
        const rejected = e.status === 'rejected';
        // Rejected ticks are full height; accepted are shorter. Redundant with
        // colour so the pattern reads in greyscale.
        const h = rejected ? height : Math.max(4, height * (0.35 + e.decision.conf * 0.4));
        return (
          <rect
            key={e.index}
            x={i * (barWidth + gap)}
            y={height - h}
            width={barWidth}
            height={h}
            fill={rejected ? 'var(--rejected)' : 'var(--accepted)'}
            opacity={rejected ? 1 : 0.85}
          />
        );
      })}
    </svg>
  );
}

/**
 * P&L context chart — handoff §5.4, PRD §19.
 *
 * Neutral grey ONLY (D11). Green/red are reserved for provenance; a green
 * upward P&L line would read as a verified good outcome, which is precisely the
 * claim Fief refuses to make. The caller is responsible for rendering the
 * "context — provenance only, not verified" label alongside it.
 */
export function ContextLine({
  series,
  className,
  height = 56,
}: {
  series: { t: string; v: number }[];
  className?: string;
  height?: number;
}) {
  if (series.length < 2) return null;

  const width = 240;
  const values = series.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - ((p.v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn('block', className)}
      role="img"
      aria-label="Unverified performance context"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
