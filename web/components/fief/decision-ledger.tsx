'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LedgerSkeleton, ErrorState, EmptyState } from '@/components/fief/states';
import { Button } from '@/components/ui/button';
import { useEntriesPage } from '@/lib/data/queries';
import type { DecisionEntry } from '@/lib/data/types';
import { formatCount, formatTimeShort, formatUnit, truncateHex } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatusPill } from './status-pill';

/**
 * Virtualized decision ledger — handoff §5.4.
 *
 * "graceful with 1 entry or 10k". Rows are a FIXED height (--spacing-row /
 * `h-row`) because the detail view is a route + sheet (D9) rather than an
 * inline expand, which keeps virtualization measurement trivial.
 *
 * ACCEPTED-ONLY (v1.1 Q1). On-chain `entries[]` never holds a rejection, so
 * there is no rejected-row state here at all — the green/red tamper pair lives
 * on /proof, linked from the record's provenance-demo block. That is why rows
 * carry no reject-reason column and no left-rule branch.
 *
 * Columns are the §5.4 set: entryIndex, time, decision, Accepted pill, TEE
 * signer (short), slot/epoch, ChainScan link.
 *
 * Keyboard: ArrowUp/ArrowDown move the active row, Home/End jump, Enter opens.
 * The active row is scrolled into view through the virtualizer so keyboard
 * traversal works across all 10k rows, not just the rendered window.
 */

const ROW_PX = 36; // must match --spacing-row (2.25rem)

/**
 * One grid template for the header and every row, so they cannot drift apart.
 * The signer and slot/epoch columns are hidden below `lg` rather than allowed
 * to wrap: a fixed row height is a hard constraint of virtualization.
 */
const COLS =
  'grid-cols-[3.5rem_8.5rem_minmax(0,1fr)_auto] lg:grid-cols-[3.5rem_8.5rem_minmax(0,1fr)_7.5rem_6.5rem_auto_1.75rem]';

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
      // Deep-linked on txHash (v1.1 Q1), not on the array index.
      if (entry) router.push(`/agents/${tokenId}/entries/${entry.txHash}`);
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
          <span className="eyebrow hidden lg:block">TEE signer</span>
          <span className="eyebrow hidden lg:block">Nonce / epoch</span>
          <span className="eyebrow text-right">Provenance</span>
          <span className="eyebrow hidden text-right lg:block">
            <span className="sr-only">ChainScan</span>
            <span aria-hidden>↗</span>
          </span>
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
              return (
                <div
                  key={v.key}
                  role="row"
                  // The slot is the on-chain identity of the decision, fixed by
                  // the epoch schedule; aria-rowindex is 1-based.
                  aria-rowindex={entry.slot + 1}
                  aria-selected={active === v.index}
                  onClick={() => {
                    setActive(v.index);
                    open(v.index);
                  }}
                  className={cn(
                    'border-border absolute top-0 left-0 grid w-full cursor-pointer items-center gap-4 border-b px-3',
                    COLS,
                    active === v.index && 'bg-muted',
                    'hover:bg-muted/60',
                  )}
                  style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                >
                  <span className="tnum text-muted-foreground font-mono text-xs">
                    s{entry.slot}
                  </span>
                  <span className="tnum text-muted-foreground font-mono text-xs">
                    {formatTimeShort(entry.blockTime)}
                  </span>
                  <span className="tnum flex min-w-0 items-baseline gap-2 font-mono text-[0.8125rem]">
                    {entry.decision === undefined ? (
                      // Committed but not yet revealed: the direction is
                      // genuinely not public yet (PRD v2 §4.2).
                      <span className="text-muted-foreground text-xs">sealed until reveal</span>
                    ) : (
                      <>
                        <span className="font-medium">{entry.decision.dir}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          conf {formatUnit(entry.decision.conf)} · size{' '}
                          {formatUnit(entry.decision.size)}
                        </span>
                      </>
                    )}
                  </span>
                  <span
                    className="tnum text-muted-foreground hidden truncate font-mono text-xs lg:block"
                    title={entry.teeSigner}
                  >
                    {truncateHex(entry.teeSigner, 4)}
                  </span>
                  <span className="tnum text-muted-foreground hidden font-mono text-xs lg:block">
                    {entry.slot} / {entry.epoch}
                  </span>
                  <span className="flex justify-end">
                    <StatusPill status={entry.status} size="sm" />
                  </span>
                  {/* stopPropagation: the row opens the receipt, this opens the
                      explorer, and a click must do exactly one of them. */}
                  <a
                    href={entry.chainScanUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 hidden justify-self-end rounded-sm p-1 focus-visible:ring-2 focus-visible:outline-none lg:block"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    <span className="sr-only">
                      View slot {entry.slot} on ChainScan (opens in a new tab)
                    </span>
                  </a>
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
