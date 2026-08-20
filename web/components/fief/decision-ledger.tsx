'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LedgerSkeleton, ErrorState, EmptyState } from '@/components/fief/states';
import { Button } from '@/components/ui/button';
import { useEntriesPage } from '@/lib/data/queries';
import type { DecisionEntry } from '@/lib/data/types';
import { formatCount, formatTimeShort, formatUnit } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatusPill } from './status-pill';

/**
 * Virtualized decision ledger — handoff §5.4.
 *
 * "graceful with 1 entry or 10k". Rows are a FIXED height (--spacing-row /
 * `h-row`) because the detail view is a route + sheet (D9) rather than an
 * inline expand, which keeps virtualization measurement trivial.
 *
 * Keyboard: ArrowUp/ArrowDown move the active row, Home/End jump, Enter opens.
 * The active row is scrolled into view through the virtualizer so keyboard
 * traversal works across all 10k rows, not just the rendered window.
 */

const ROW_PX = 36; // must match --spacing-row (2.25rem)
const COLS = 'grid-cols-[3.5rem_9.5rem_minmax(0,1fr)_auto]';

export function DecisionLedger({ tokenId }: { tokenId: string }) {
  const query = useEntriesPage(tokenId);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);

  const entries = useMemo<DecisionEntry[]>(
    () => (query.data ?? []).flatMap((p) => p.items),
    [query.data],
  );
  const total = query.data?.[0]?.total ?? entries.length;

  // @tanstack/react-virtual returns a mutable instance, so the React Compiler
  // skips optimising this component. Expected and unavoidable for any
  // virtualizer; correctness is unaffected, we just forgo auto-memoisation
  // here. Scoped to this one call rather than disabled project-wide.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 12,
  });

  // Pull the next page as the viewport approaches the loaded tail.
  const items = virtualizer.getVirtualItems();
  const lastRendered = items.length > 0 ? items[items.length - 1].index : 0;
  useEffect(() => {
    if (
      lastRendered >= entries.length - 40 &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      void query.fetchNextPage();
    }
  }, [lastRendered, entries.length, query]);

  const open = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (entry) router.push(`/agents/${tokenId}/entries/${entry.index}`);
    },
    [entries, router, tokenId],
  );

  const move = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(entries.length - 1, next));
      setActive(clamped);
      virtualizer.scrollToIndex(clamped, { align: 'auto' });
    },
    [entries.length, virtualizer],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(active < 0 ? 0 : active + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(active < 0 ? 0 : active - 1);
          break;
        case 'Home':
          e.preventDefault();
          move(0);
          break;
        case 'End':
          e.preventDefault();
          move(entries.length - 1);
          break;
        case 'PageDown':
          e.preventDefault();
          move((active < 0 ? 0 : active) + 10);
          break;
        case 'PageUp':
          e.preventDefault();
          move((active < 0 ? 0 : active) - 10);
          break;
        case 'Enter':
        case ' ':
          if (active >= 0) {
            e.preventDefault();
            open(active);
          }
          break;
        default:
          break;
      }
    },
    [active, entries.length, move, open],
  );

  if (query.isPending) return <LedgerSkeleton rows={14} />;

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load the ledger"
        description="The indexer is unreachable. Every entry remains readable directly from the chain."
        action={
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No entries recorded yet"
        description="This agent has been sealed and minted, but its operator has not appended any decisions."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-muted-foreground tnum font-mono text-xs">
          showing {formatCount(entries.length)} of {formatCount(total)}
        </p>
        <p className="text-muted-foreground hidden font-mono text-[0.6875rem] sm:block">
          ↑ ↓ to move · Enter to open
        </p>
      </div>

      <div className="border-border-strong overflow-hidden rounded-lg border">
        {/* Header is outside the scroll container so it cannot drift. */}
        <div
          className={cn(
            'border-border-strong bg-muted/40 grid items-center gap-4 border-b px-3 py-2',
            COLS,
          )}
        >
          <span className="eyebrow">#</span>
          <span className="eyebrow">Time (UTC)</span>
          <span className="eyebrow">Decision</span>
          <span className="eyebrow text-right">Provenance</span>
        </div>

        <div
          ref={scrollRef}
          role="grid"
          aria-label="Decision ledger"
          aria-rowcount={total}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="focus-visible:ring-ring/60 h-[min(70vh,640px)] overflow-auto focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((v) => {
              const entry = entries[v.index];
              if (!entry) return null;
              const accepted = entry.status === 'accepted';
              return (
                <div
                  key={v.key}
                  role="row"
                  aria-rowindex={entry.index + 1}
                  aria-selected={active === v.index}
                  onClick={() => {
                    setActive(v.index);
                    open(v.index);
                  }}
                  className={cn(
                    'border-border absolute top-0 left-0 grid w-full cursor-pointer items-center gap-4 border-b px-3',
                    COLS,
                    // Non-colour cue for rejected rows, so the pattern is
                    // findable when scanning in greyscale.
                    accepted
                      ? 'border-l-2 border-l-transparent'
                      : 'border-l-rejected bg-rejected-surface/40 border-l-2',
                    active === v.index && 'bg-muted',
                    'hover:bg-muted/60',
                  )}
                  style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                >
                  <span className="tnum text-muted-foreground font-mono text-xs">
                    {entry.index}
                  </span>
                  <span className="tnum text-muted-foreground font-mono text-xs">
                    {formatTimeShort(entry.blockTime)}
                  </span>
                  <span className="tnum flex min-w-0 items-baseline gap-2 font-mono text-[0.8125rem]">
                    <span className="font-medium">{entry.decision.dir}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      conf {formatUnit(entry.decision.conf)} · size{' '}
                      {formatUnit(entry.decision.size)}
                    </span>
                  </span>
                  <span className="flex justify-end">
                    <StatusPill
                      status={entry.status}
                      rejectReason={entry.rejectReason}
                      size="sm"
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {query.isFetchingNextPage ? (
        <p className="text-muted-foreground font-mono text-xs">loading more entries…</p>
      ) : null}
    </div>
  );
}
