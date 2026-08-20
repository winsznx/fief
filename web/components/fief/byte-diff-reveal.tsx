'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { firstDiffIndex } from '@/lib/data/commit';
import type { DecisionEntry } from '@/lib/data/types';
import { cn } from '@/lib/utils';

/**
 * <ByteDiffReveal> — D6, the signature interaction.
 *
 * Shows the ONE byte that differs between the accepted submission and the
 * tampered one, computed from the entries' actual `respData` bytes via
 * `firstDiffIndex`.
 *
 * What this deliberately does NOT do: let the visitor edit a byte and watch a
 * verdict flip. That would fabricate a verification result in the browser and
 * imply on-chain checking that is not happening — which crosses the honesty
 * line this project sets for itself. This only visualises a difference that
 * genuinely exists in the data.
 *
 * Collapsed by default and fully readable collapsed, so it degrades to a static
 * artifact for screenshots, print and reduced-motion users.
 */

const CONTEXT = 46;

interface Slice {
  before: string;
  at: string;
  after: string;
}

function sliceAround(source: string, index: number): Slice {
  const from = Math.max(0, index - CONTEXT);
  const to = Math.min(source.length, index + CONTEXT);
  return {
    before: (from > 0 ? '…' : '') + source.slice(from, index),
    at: source.slice(index, index + 1),
    after: source.slice(index + 1, to) + (to < source.length ? '…' : ''),
  };
}

function ByteRow({
  label,
  slice,
  tone,
}: {
  label: string;
  slice: Slice;
  tone: 'accepted' | 'rejected';
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'eyebrow',
          tone === 'accepted' ? 'text-accepted-fg' : 'text-rejected-fg',
        )}
      >
        {label}
      </span>
      <p className="tnum overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre">
        <span className="text-muted-foreground">{slice.before}</span>
        <mark
          className={cn(
            'rounded-[2px] px-1 py-0.5 font-semibold',
            // Redundant with the underline below: highlight plus a rule, so the
            // differing byte is findable in greyscale.
            tone === 'accepted'
              ? 'bg-accepted-surface text-accepted-fg decoration-accepted underline decoration-2 underline-offset-2'
              : 'bg-rejected-surface text-rejected-fg decoration-rejected underline decoration-2 underline-offset-2',
          )}
        >
          {slice.at}
        </mark>
        <span className="text-muted-foreground">{slice.after}</span>
      </p>
    </div>
  );
}

export function ByteDiffReveal({
  green,
  red,
  className,
}: {
  green: DecisionEntry;
  red: DecisionEntry;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const diff = useMemo(() => {
    const a = green.respData;
    const b = red.respData;
    if (!a || !b) return null;
    const index = firstDiffIndex(a, b);
    if (index < 0) return null;
    return {
      index,
      greenSlice: sliceAround(a, index),
      redSlice: sliceAround(b, index),
      total: a.length,
    };
  }, [green.respData, red.respData]);

  if (!diff) return null;

  return (
    <section
      className={cn('border-border-strong flex flex-col gap-4 rounded-lg border p-5', className)}
      aria-label="Byte-level difference between the accepted and rejected submissions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold tracking-tight">The tampered byte</h3>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            Both submissions are {diff.total} bytes of signed response. They differ at exactly one
            position — byte{' '}
            <span className="tnum text-foreground font-mono">{diff.index}</span>, inside the
            commitment&rsquo;s <code className="font-mono">strategy</code> field. That single byte is
            why one was accepted and the other rejected.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0"
        >
          {open ? 'Hide bytes' : 'Show the bytes'}
          <ChevronDown
            className={cn('size-3.5 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </Button>
      </div>

      {open ? (
        <div className="border-border bg-muted/30 flex flex-col gap-4 rounded-md border p-4">
          <ByteRow label="Accepted submission" slice={diff.greenSlice} tone="accepted" />
          <ByteRow label="Tampered submission" slice={diff.redSlice} tone="rejected" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            The contract rebuilds the expected commitment from its own on-chain state and compares
            it byte-for-byte against the response. A single altered character no longer matches, so
            the entry is rejected with <code className="font-mono">BadCommit</code>.
          </p>
        </div>
      ) : null}
    </section>
  );
}
