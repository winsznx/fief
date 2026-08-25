import { CheckCircle2, CircleDashed, CircleSlash, Lock } from 'lucide-react';

import type { EpochSummary } from '@/lib/data/types';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Epoch completeness — the number v1 could not produce (PRD v2 §5 EpochBook).
 *
 * v1 could say "every published decision is authentic". It could not say
 * "and nothing was dropped", because the runtime was free to discard a
 * decision before consuming a nonce. An operator could run N inferences, see
 * which were wrong, and publish only the winners.
 *
 * So this component's whole job is to make the DENOMINATOR visible. The bar is
 * a proportion of `slotCount`, the schedule fixed on-chain before any outcome
 * was knowable, not a proportion of what the operator chose to publish. A
 * missing slot takes space in the bar rather than disappearing from it, which
 * is the entire difference between the two versions of the product.
 *
 * Deliberately no single headline percentage without its counts beside it: a
 * bare "99.3%" invites the reader to assume the missing 0.7% is rounding.
 */

const SEGMENTS = [
  {
    key: 'revealed' as const,
    label: 'revealed',
    icon: CheckCircle2,
    bar: 'bg-accepted',
    text: 'text-accepted-fg',
    hint: 'opened after the horizon and verified byte-exact on-chain',
  },
  {
    key: 'committed' as const,
    label: 'sealed',
    icon: Lock,
    bar: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
    hint: 'committed before the deadline, still inside its disclosure window',
  },
  {
    key: 'invalid' as const,
    label: 'invalid',
    icon: CircleSlash,
    bar: 'bg-rejected',
    text: 'text-rejected-fg',
    hint: 'committed, but nobody could open the commitment in time',
  },
  {
    key: 'missed' as const,
    label: 'missed',
    icon: CircleDashed,
    bar: 'bg-border',
    text: 'text-muted-foreground',
    hint: 'scheduled and never committed — a decision the agent did not make in time',
  },
];

export function CompletenessBar({
  epoch,
  className,
}: {
  epoch: EpochSummary;
  className?: string;
}) {
  // `committed` from the chain counts every slot that got a commitment,
  // including the ones later revealed. Split it so the segments sum to
  // slotCount rather than double-counting.
  const sealed = Math.max(0, epoch.committed - epoch.revealed - epoch.invalid);
  const counts = {
    revealed: epoch.revealed,
    committed: sealed,
    invalid: epoch.invalid,
    missed: epoch.missed,
  };

  const total = epoch.slotCount || 1;
  const pct = (n: number) => (n / total) * 100;
  const complete = (epoch.completenessBps / 100).toFixed(epoch.completenessBps % 100 === 0 ? 0 : 2);

  return (
    <section className={cn('surface flex flex-col gap-4 p-5', className)} aria-label="Epoch completeness">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold tracking-tight">Forward record</h2>
          <span className="eyebrow">epoch {epoch.epochId}</span>
        </div>
        <p className="tnum text-muted-foreground font-mono text-xs">
          {epoch.market} · every {epoch.cadenceSeconds}s · {epoch.horizonSeconds}s horizon
        </p>
      </header>

      <div className="flex items-baseline gap-2">
        <span className="tnum font-mono text-3xl font-semibold tracking-tight">{complete}%</span>
        <span className="text-muted-foreground text-sm">
          {formatCount(epoch.revealed)} of {formatCount(epoch.slotCount)} scheduled slots proven
        </span>
      </div>

      {/*
        role=img with a single label: a screen reader gets the whole picture in
        one utterance instead of four unlabelled divs.
      */}
      <div
        role="img"
        aria-label={`${epoch.revealed} revealed, ${sealed} sealed, ${epoch.invalid} invalid, ${epoch.missed} missed, of ${epoch.slotCount} scheduled slots`}
        className="bg-border/40 flex h-2.5 w-full overflow-hidden rounded-full"
      >
        {SEGMENTS.map((s) =>
          counts[s.key] > 0 ? (
            <div
              key={s.key}
              className={cn('h-full', s.bar)}
              style={{ width: `${pct(counts[s.key])}%` }}
            />
          ) : null,
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Icon className={cn('size-3.5 shrink-0', s.text)} aria-hidden />
                {s.label}
              </dt>
              <dd className="tnum font-mono text-lg font-medium">{formatCount(counts[s.key])}</dd>
              <p className="text-muted-foreground text-[0.6875rem] leading-snug">{s.hint}</p>
            </div>
          );
        })}
      </dl>

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        The schedule was fixed on-chain at{' '}
        <time dateTime={epoch.startTime} className="tnum font-mono">
          {new Date(epoch.startTime).toISOString().replace('T', ' ').slice(0, 19)} UTC
        </time>{' '}
        before any of these slots existed, and each one had{' '}
        <span className="tnum font-mono">{epoch.maxCommitDelay}s</span> to be committed. A slot the
        agent did not commit in time stays counted as missed, so the denominator cannot be edited
        after the fact.
      </p>
    </section>
  );
}
