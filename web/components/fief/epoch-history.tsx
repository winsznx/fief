import type { EpochSummary } from '@/lib/data/types';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Every epoch the agent has ever opened.
 *
 * This exists to answer the sharpest objection the design faces: an operator
 * whose epoch is going badly can simply stop and open a fresh one, and nothing
 * on-chain prevents that. Fief's answer is not prevention, it is that the
 * abandoned epoch stays here forever with its real completeness, next to the
 * clean one. A single 100% epoch means something very different when there are
 * four abandoned runs underneath it.
 *
 * Rendered only when there is more than one, because a lone epoch is already
 * fully described by the completeness bar above.
 */
export function EpochHistory({
  epochs,
  currentId,
  className,
}: {
  epochs: EpochSummary[];
  currentId: number;
  className?: string;
}) {
  if (epochs.length < 2) return null;

  const lifetimeRevealed = epochs.reduce((n, e) => n + e.revealed, 0);
  const lifetimeScheduled = epochs.reduce((n, e) => n + e.slotCount, 0);
  const lifetime = lifetimeScheduled === 0 ? 0 : (lifetimeRevealed / lifetimeScheduled) * 100;

  return (
    <section className={cn('surface flex flex-col gap-4 p-5', className)} aria-label="Epoch history">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight">Every epoch, including the bad ones</h2>
        <p className="tnum text-muted-foreground font-mono text-xs">
          lifetime {lifetime.toFixed(2)}% · {formatCount(lifetimeRevealed)} of{' '}
          {formatCount(lifetimeScheduled)}
        </p>
      </header>

      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {epochs.map((e) => {
          const pct = e.slotCount === 0 ? 0 : (e.revealed / e.slotCount) * 100;
          return (
            <li
              key={e.epochId}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="tnum w-16 font-mono text-sm">epoch {e.epochId}</span>
              <span className="tnum font-mono text-sm font-medium">{pct.toFixed(2)}%</span>
              <span className="text-muted-foreground text-xs">
                {formatCount(e.revealed)} of {formatCount(e.slotCount)} scheduled
              </span>
              {e.epochId === currentId ? <span className="eyebrow">current</span> : null}
              {e.pending > 0 ? (
                <span className="eyebrow">running</span>
              ) : e.missed > 0 ? (
                <span className="eyebrow">{formatCount(e.missed)} missed</span>
              ) : null}
              <span className="tnum text-muted-foreground ml-auto font-mono text-xs">
                {e.startTime.replace('T', ' ').slice(0, 16)} UTC
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        Nothing here can be closed, hidden or renumbered. An operator can always abandon an epoch
        that is going badly and open a clean one, and Fief does not stop them. It records them side
        by side, so a fresh 100% has to be read next to whatever it was started to escape.
      </p>
    </section>
  );
}
