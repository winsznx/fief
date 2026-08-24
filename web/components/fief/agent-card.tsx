import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { Agent, DecisionEntry, Listing } from '@/lib/data/types';
import { formatCount, formatOg } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DecisionCadence } from './charts';

const LIFECYCLE_COPY: Record<Agent['lifecycle'], string> = {
  sealed: 'Sealed',
  minted: 'Minted',
  active: 'Active',
  listed: 'Listed',
  rented: 'Rented',
  retired: 'Retired',
};

/**
 * Agent card — chart-forward.
 *
 * This is a data product, so the data is the hero image. The chart occupies the
 * dominant share of the card and the identifying text is demoted underneath it.
 *
 * Two earlier versions were wrong in opposite directions. The first was a 2x2
 * grid of four uppercase-labelled fields — a spreadsheet cell, four facts at
 * equal weight, no focal point. The second removed the chart entirely because the
 * then-current sparkline rendered as a 40-tick green barcode; that fixed the
 * noise but left the card with nothing to look at, so an agent's record — the
 * only thing that distinguishes one agent from another — was reduced to a single
 * integer.
 *
 * What makes the chart work here rather than as decoration:
 *
 *   It is neutral. Green across a grid of cards spent the provenance colour on
 *   ornament, which is what D11 exists to prevent. The one coloured element is
 *   `verified`, which is an actual provenance claim.
 *
 *   It is volume over time, not performance. See <DecisionCadence> — Fief
 *   verifies that decisions happened inside a sealed environment, never that they
 *   were profitable, so an equity-curve-shaped hero image would assert the one
 *   thing this product refuses to assert.
 *
 *   It draws its own empty state. An agent with no entries still renders the
 *   baseline and says so in words, because a card whose chart silently vanishes
 *   reads as a bug.
 */
export function AgentCard({
  agent,
  listing,
  entries,
  className,
}: {
  agent: Agent;
  listing?: Listing | null;
  /** Recent entries for the cadence chart. Omit for a text-only card. */
  entries?: DecisionEntry[];
  className?: string;
}) {
  const hasRecord = agent.decisionCount > 0;

  return (
    <Link
      href={`/agents/${agent.tokenId}`}
      className={cn(
        'surface surface-lift focus-visible:ring-ring/60 group flex h-full flex-col overflow-hidden focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      {/* ── The chart, and the count reading against it ──────────────────── */}
      <div className="relative flex flex-col gap-3 px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="eyebrow">Accepted decisions</span>
            <span className={cn('figure', !hasRecord && 'text-muted-foreground/40')}>
              {hasRecord ? formatCount(agent.decisionCount) : '0'}
            </span>
          </div>
          {hasRecord ? (
            <span className="text-accepted-fg inline-flex shrink-0 items-center gap-1 font-mono text-[0.6875rem]">
              <CheckCircle2 className="size-3 shrink-0" aria-hidden />
              verified
            </span>
          ) : null}
        </div>

        {entries && hasRecord ? (
          <DecisionCadence entries={entries} height={104} />
        ) : (
          <div className="flex h-[104px] flex-col justify-end">
            <p className="text-muted-foreground/70 pb-2 text-[0.6875rem]">No entries recorded yet</p>
            <div className="bg-border h-px w-full" aria-hidden />
          </div>
        )}
      </div>

      {/* ── Identity, demoted ────────────────────────────────────────────── */}
      <div className="border-border mt-4 flex items-center justify-between gap-3 border-t px-5 py-3.5">
        <div className="flex min-w-0 flex-col">
          <h3 className="heading truncate text-[0.9375rem]">{agent.name}</h3>
          <p className="text-muted-foreground truncate text-[0.6875rem]">{agent.domain}</p>
        </div>
        <div className="text-muted-foreground flex shrink-0 flex-col items-end gap-0.5 font-mono text-[0.625rem]">
          <span className="border-border rounded-sm border px-1.5 py-0.5 tracking-[0.12em] uppercase">
            {LIFECYCLE_COPY[agent.lifecycle]}
          </span>
          <span className="tnum">
            {listing?.active ? `${formatOg(listing.feePerDecisionWei)} OG` : 'not listed'}
          </span>
        </div>
      </div>
    </Link>
  );
}
