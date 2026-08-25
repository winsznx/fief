import { Lock, Radio, ShieldCheck, Timer } from 'lucide-react';

import type { DecisionEntry } from '@/lib/data/types';
import { cn } from '@/lib/utils';

/**
 * The commit/reveal timeline for a single slot (PRD v2 §4.2).
 *
 * This exists because the product's central claim is about ORDER, and order is
 * the one thing a list of transactions does not show. A reader looking at two
 * ChainScan links has no way to see that the sealed commitment landed before
 * the market resolved. Laid out on an axis, it is the first thing they see.
 *
 * The deadline marker matters as much as the commit marker. "Committed at
 * 12:05:12" means nothing on its own; "committed at 12:05:12, deadline
 * 12:05:30" is the claim, because it shows the operator had no room to wait
 * and see.
 */

function ts(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

/** Fraction of the axis, clamped so a late or early value stays on screen. */
function at(value: number, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.min(100, Math.max(0, ((value - start) / (end - start)) * 100));
}

export function SlotTimeline({
  entry,
  className,
}: {
  entry: DecisionEntry;
  className?: string;
}) {
  const committed = Date.parse(entry.committedAt);
  const deadline = Date.parse(entry.commitDeadline);
  const revealOpen = Date.parse(entry.revealOpen);
  const revealed = Date.parse(entry.blockTime);

  // The axis runs from just before the commit to just after the reveal, so the
  // interesting span fills the width instead of being squashed by a long
  // disclosure delay.
  const start = Math.min(committed, deadline) - 15_000;
  const end = Math.max(revealOpen, revealed) + 15_000;

  const beatDeadline = committed <= deadline;

  const marks = [
    {
      key: 'commit',
      icon: Lock,
      label: 'sealed commit',
      time: committed,
      tone: beatDeadline ? 'text-accepted-fg' : 'text-rejected-fg',
      dot: beatDeadline ? 'bg-accepted' : 'bg-rejected',
    },
    {
      key: 'deadline',
      icon: Timer,
      label: 'commit deadline',
      time: deadline,
      tone: 'text-muted-foreground',
      dot: 'bg-border',
    },
    {
      key: 'open',
      icon: Radio,
      label: 'disclosure opens',
      time: revealOpen,
      tone: 'text-muted-foreground',
      dot: 'bg-border',
    },
    {
      key: 'reveal',
      icon: ShieldCheck,
      label: entry.state === 'revealed' ? 'revealed + verified' : 'reveal attempted',
      time: revealed,
      tone: entry.state === 'revealed' ? 'text-accepted-fg' : 'text-rejected-fg',
      dot: entry.state === 'revealed' ? 'bg-accepted' : 'bg-rejected',
    },
  ];

  const privateMs = Math.max(0, revealOpen - committed);
  const marginMs = deadline - committed;

  return (
    <section
      className={cn('surface flex flex-col gap-5 p-5', className)}
      aria-label={`Timeline for slot ${entry.slot}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight">
          Slot {entry.slot} · epoch {entry.epoch}
        </h2>
        <p className="tnum text-muted-foreground font-mono text-xs">
          committed with {(marginMs / 1000).toFixed(0)}s to spare
        </p>
      </header>

      {/* The axis. Times are absolute UTC, never relative, because "3 minutes
          before" is exactly the kind of phrasing that hides an ordering bug. */}
      <div className="relative pt-1 pb-14">
        <div className="bg-border/60 absolute inset-x-0 top-3 h-px" aria-hidden />

        {/* The private window: the span where the renter holds a signal the
            public chain has only a commitment for. This is what is being sold. */}
        <div
          aria-hidden
          className="bg-muted-foreground/15 absolute top-1.5 h-2 rounded-full"
          style={{
            left: `${at(committed, start, end)}%`,
            width: `${at(revealOpen, start, end) - at(committed, start, end)}%`,
          }}
        />

        {marks.map((m) => {
          const left = at(m.time, start, end);
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
              style={{ left: `${left}%` }}
            >
              <span className={cn('size-2.5 rounded-full ring-2 ring-[--color-background]', m.dot)} />
              <Icon className={cn('mt-1 size-3.5', m.tone)} aria-hidden />
              <span className="tnum text-muted-foreground font-mono text-[0.625rem] whitespace-nowrap">
                {ts(new Date(m.time).toISOString())}
              </span>
              <span
                className={cn(
                  'max-w-[7rem] text-center text-[0.625rem] leading-tight whitespace-normal',
                  m.tone,
                )}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed">
        The commitment was sealed{' '}
        <span className="tnum text-foreground font-mono">{(marginMs / 1000).toFixed(0)}s</span>{' '}
        inside its deadline and stayed private for{' '}
        <span className="tnum text-foreground font-mono">
          {(privateMs / 1000).toFixed(0)}s
        </span>{' '}
        after that. During that window the renter held the direction and the chain held only a
        hash, so the operator could not have waited to see the outcome before deciding whether to
        record this call.
      </p>
    </section>
  );
}
