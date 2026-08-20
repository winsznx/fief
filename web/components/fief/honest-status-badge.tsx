'use client';

import { getDataMode } from '@/lib/data/source';
import { HONEST_STATUS } from '@/lib/copy';
import { formatCount, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Honest-status badge — handoff §4, amended by D4.
 *
 * Handoff §4 specifies the literal string
 *   "Live on 0G mainnet · N decisions · 100% brain-bound"
 * but rendering that over MockDataSource — the default, and what anyone sees
 * before PRD phase P4 — is a false claim, and directly contradicts the honesty
 * discipline in the README and PRD §8. So the badge reads its own provenance:
 * it only claims live mainnet activity when NEXT_PUBLIC_DATA_MODE=live.
 */
export function HonestStatusBadge({
  decisions,
  brainBoundPct,
  className,
}: {
  decisions?: number;
  brainBoundPct?: number;
  className?: string;
}) {
  const mode = getDataMode();
  const live = mode === 'live';

  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border px-2.5 py-1 font-mono text-[0.6875rem] tracking-tight',
        live
          ? 'border-accepted-border bg-accepted-surface text-accepted-fg'
          : 'border-border-strong bg-muted/50 text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          live ? 'bg-accepted' : 'bg-muted-foreground',
        )}
      />
      {live ? (
        <>
          <span>{HONEST_STATUS.liveLabel}</span>
          {decisions !== undefined ? (
            <>
              <span aria-hidden>·</span>
              <span className="tnum">{formatCount(decisions)} decisions</span>
            </>
          ) : null}
          {brainBoundPct !== undefined ? (
            <>
              <span aria-hidden>·</span>
              <span className="tnum">{formatPct(brainBoundPct)}% brain-bound</span>
            </>
          ) : null}
        </>
      ) : (
        <span>{HONEST_STATUS.mockPrimary}</span>
      )}
    </span>
  );
}
