import type { DecisionEntry } from '@/lib/data/types';
import { cn } from '@/lib/utils';

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

/**
 * <DecisionCadence> — the dominant visual on an agent card.
 *
 * Columns of ACCEPTED DECISION VOLUME over time. Deliberately not a performance
 * or P&L chart, and deliberately not labelled as one: Fief records that a
 * decision was made inside a sealed environment and committed on-chain. It makes
 * no claim about whether the decision was profitable. A rising equity curve as
 * the hero image of an agent card would imply a verified return, which is the
 * single claim this product refuses to make (D11), so the chart shows the thing
 * that IS verified — how much record exists, and when it was built.
 *
 * Neutral by construction. Green would spend the provenance colour on decoration
 * across a whole grid of cards.
 *
 * Degenerate cases are drawn, not hidden: an agent with no entries renders an
 * empty track with a baseline rather than collapsing to nothing, because a card
 * that silently loses its chart reads as broken.
 */
export function DecisionCadence({
  entries,
  className,
  height = 132,
  buckets = 32,
}: {
  entries: DecisionEntry[];
  className?: string;
  height?: number;
  buckets?: number;
}) {
  const accepted = entries.filter((e) => e.status === 'accepted');

  const width = 320;
  const gap = 2;
  const colWidth = (width - gap * (buckets - 1)) / buckets;
  const baseline = height - 1;

  // Bucket by time so the x-axis means something. With fewer entries than
  // buckets this still reads correctly — sparse columns over a stated extent.
  const counts = new Array<number>(buckets).fill(0);
  if (accepted.length > 0) {
    const times = accepted.map((e) => new Date(e.blockTime).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = max - min || 1;
    for (const t of times) {
      const i = Math.min(buckets - 1, Math.floor(((t - min) / span) * buckets));
      counts[i] += 1;
    }
  }
  const peak = Math.max(...counts, 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn('block', className)}
      role="img"
      aria-label={
        accepted.length === 0
          ? 'No accepted entries recorded yet'
          : `Accepted decision volume over time: ${accepted.length} ${
              accepted.length === 1 ? 'entry' : 'entries'
            } across ${buckets} intervals`
      }
    >
      {counts.map((c, i) => {
        if (c === 0) return null;
        const h = Math.max(2, (c / peak) * (height - 6));
        return (
          <rect
            key={i}
            x={i * (colWidth + gap)}
            y={baseline - h}
            width={colWidth}
            height={h}
            fill="currentColor"
            className="text-foreground/25"
          />
        );
      })}
      {/* Baseline. States the extent even when there is nothing above it. */}
      <rect x="0" y={baseline} width={width} height="1" fill="currentColor" className="text-border" />
    </svg>
  );
}
