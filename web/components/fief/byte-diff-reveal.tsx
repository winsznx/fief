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
 * ALWAYS VISIBLE. This was previously collapsed behind a "Show the bytes"
 * button, which meant the single most valuable thing on the landing page — live
 * cryptographic evidence that nobody else can show — was hidden by default while
 * twelve rows of hash were dumped in full above it. That is exactly backwards.
 * The diff is now the page's visual anchor and the hashes are what collapse.
 *
 * A server component: no state, no hydration, and it renders identically in a
 * screenshot, in print and with JavaScript off.
 */

/* Wider window than before: this is now a full-width feature rather than a
   cramped disclosure, so there is room for real surrounding context. */
const CONTEXT = 64;

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
          'text-[0.625rem] font-medium tracking-[0.16em] uppercase',
          tone === 'accepted' ? 'text-accepted-fg' : 'text-rejected-fg',
        )}
      >
        {label}
      </span>
      <p className="tnum overflow-x-auto font-mono text-[0.8125rem] leading-relaxed whitespace-pre">
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
  const a = green.respData;
  const b = red.respData;
  if (!a || !b) return null;
  const index = firstDiffIndex(a, b);
  if (index < 0) return null;

  const diff = {
    index,
    greenSlice: sliceAround(a, index),
    redSlice: sliceAround(b, index),
    total: a.length,
  };

  return (
    <section
      className={cn('surface flex flex-col gap-item p-5 sm:p-6', className)}
      aria-label="Byte-level difference between the accepted and rejected submissions"
    >
      {/* The figure leads. One number is the whole story: of N bytes, exactly one
          differs, and that is the difference between a record and a rejection. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="figure">byte {diff.index}</span>
        <span className="text-muted-foreground text-[0.8125rem]">
          of {diff.total} — the only difference between the two submissions
        </span>
      </div>

      <div className="surface-flat flex flex-col gap-4 p-4">
        <ByteRow label="Accepted" slice={diff.greenSlice} tone="accepted" />
        <ByteRow label="Rejected" slice={diff.redSlice} tone="rejected" />
      </div>

      <p className="text-muted-foreground max-w-[68ch] text-[0.8125rem] leading-relaxed">
        The contract rebuilds the expected commitment from its own on-chain state and compares it
        byte-for-byte against the response. One altered character no longer matches, so the entry is
        refused with <code className="text-foreground font-mono">BadCommit</code> and is never
        stored.
      </p>
    </section>
  );
}
