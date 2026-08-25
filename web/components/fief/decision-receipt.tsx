import { ChevronRight, Lock } from 'lucide-react';
import type * as React from 'react';
import Link from 'next/link';
import type { DecisionEntry } from '@/lib/data/types';
import { formatTime, formatTimeShort, formatUnit } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HashRow } from './hash';
import { REJECT_REASON_COPY, StatusPill } from './status-pill';
import { VerifyCommand } from './verify-command';

/**
 * <DecisionReceipt> — handoff §6. The signature UI of the product.
 *
 * Variants
 *   compact   one row for the virtualized ledger (fixed h-row)
 *   full      detail panel — entry route, sheet, /verify result
 *   showcase  oversized, projector-legible — landing + /proof
 *
 * D8 applies throughout: green/red is reinforced by icon, label, border style
 * and fill density, so the accept/reject distinction survives greyscale.
 */

const DIR_GLYPH = { UP: '▲', DOWN: '▼', FLAT: '■' } as const;

/**
 * Decision direction is deliberately NEUTRAL, not green/red.
 *
 * D11 — green/red are reserved exclusively for provenance. A green "UP" call
 * would read as a verified-good outcome, which is precisely the claim the
 * product refuses to make.
 */
export function DecisionCell({
  decision,
  className,
}: {
  decision: DecisionEntry['decision'];
  className?: string;
}) {
  // A committed-but-unrevealed slot genuinely has no public direction yet, and
  // that is the product working rather than data missing (PRD v2 §4.2). Say so
  // instead of rendering an empty cell.
  if (!decision) {
    return (
      <span
        className={cn('text-muted-foreground inline-flex items-baseline gap-1.5 text-xs', className)}
      >
        <span aria-hidden>◍</span>
        <span>sealed until reveal</span>
      </span>
    );
  }

  return (
    <span className={cn('tnum inline-flex items-baseline gap-1.5 font-mono', className)}>
      <span aria-hidden className="text-muted-foreground">
        {DIR_GLYPH[decision.dir]}
      </span>
      <span className="font-medium">{decision.dir}</span>
      <span className="text-muted-foreground text-xs">
        conf {formatUnit(decision.conf)} · size {formatUnit(decision.size)}
      </span>
    </span>
  );
}

function plainEnglish(entry: DecisionEntry): string {
  if (entry.status === 'accepted') {
    return 'This decision was produced by the agent’s registered TEE model and matches its sealed commitment.';
  }
  if (entry.rejectReason === 'BadCommit') {
    return 'One byte was changed — the on-chain check rejected it.';
  }
  const reason = entry.rejectReason ? REJECT_REASON_COPY[entry.rejectReason] : 'a check failed';
  return `The on-chain check rejected this submission: ${reason}.`;
}

/* ── compact ──────────────────────────────────────────────────────────────── */

export function DecisionReceiptRow({
  entry,
  tokenId,
  className,
}: {
  entry: DecisionEntry;
  tokenId: string;
  className?: string;
}) {
  const accepted = entry.status === 'accepted';
  return (
    <Link
      // Keyed on txHash (v1.1 Q1): a rejected submission has no entry index, so
      // an index-addressed URL cannot name it.
      href={`/agents/${tokenId}/entries/${entry.txHash}`}
      className={cn(
        'border-border hover:bg-muted/50 focus-visible:ring-ring/60 grid h-row grid-cols-[3.5rem_9.5rem_1fr_auto] items-center gap-4 border-b px-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        // Redundant, non-colour cue: a left rule marks rejected rows so they
        // are findable when scanning in greyscale. Reachable only where
        // rejections are shown deliberately (/design, /proof) — never in an
        // agent's ledger, which is accepted-only.
        accepted ? 'border-l-2 border-l-transparent' : 'border-l-rejected border-l-2',
        className,
      )}
    >
      <span className="tnum text-muted-foreground font-mono text-xs">
        {`s${entry.slot}`}
      </span>
      <span className="tnum text-muted-foreground font-mono text-xs">
        {formatTimeShort(entry.blockTime)}
      </span>
      <DecisionCell decision={entry.decision} className="text-[0.8125rem]" />
      <StatusPill status={entry.status} rejectReason={entry.rejectReason} size="sm" />
    </Link>
  );
}

/* ── full ─────────────────────────────────────────────────────────────────── */

export function DecisionReceipt({
  entry,
  variant = 'full',
  className,
  footer,
  hashes = 'shown',
}: {
  entry: DecisionEntry;
  variant?: 'full' | 'showcase';
  className?: string;
  /** Extra note rendered inside the card, below the sealed-request line. */
  footer?: React.ReactNode;
  /**
   * `collapsed` puts the six hash rows behind a disclosure.
   *
   * Used wherever receipts appear in a PAIR. Six hashes x two cards is twelve
   * rows of 64-character hex at identical visual weight, which buries the one
   * thing the pair exists to communicate — that one was accepted and one was
   * not. The hashes are evidence a reader reaches for second, on purpose, so
   * they are one click away rather than dumped in full.
   */
  hashes?: 'shown' | 'collapsed';
}) {
  const accepted = entry.status === 'accepted';
  const showcase = variant === 'showcase';

  return (
    <article
      className={cn(
        'surface flex flex-col',
        // D20 — the card is a NEUTRAL surface. The semantic lives in the pill,
        // the plain-English line and a single accent edge, not in a full-bleed
        // wash. Flooding the whole panel with accepted-surface / rejected-surface
        // spent the product's only two colours on ~40% of the viewport, which
        // left nothing louder for the pill that actually states the verdict, and
        // made /proof read as two coloured blocks rather than two receipts.
        //
        // D8 is unaffected: icon + label + border style + the accent edge are
        // still four redundant, non-hue cues. The dashed edge on a rejection is
        // what survives greyscale.
        'border-l-2',
        accepted ? 'border-l-accepted' : 'border-l-rejected border-dashed',
        showcase ? 'gap-5 p-6 sm:p-7' : 'gap-4 p-5',
        className,
      )}
      aria-label={
        accepted
          ? 'Accepted decision receipt'
          : `Rejected decision receipt: ${entry.rejectReason ?? 'unknown reason'}`
      }
    >
      {/* Pill and metadata on ONE row. The separate heading line underneath was
          the third restatement of the verdict — the pill says ACCEPTED, the
          heading said "Accepted — brain-bound", and the sentence below says it
          again in prose. The only word the heading carried that the pill did not
          is "brain-bound", which now rides on the pill row as a quiet qualifier. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusPill
            status={entry.status}
            rejectReason={entry.rejectReason}
            size={showcase ? 'lg' : 'md'}
          />
          <span className="text-muted-foreground truncate text-[0.75rem]">
            {accepted ? 'brain-bound' : 'not recorded'}
          </span>
        </div>
        <span className="tnum text-muted-foreground font-mono text-[0.6875rem]">
          {/* The slot exists from the moment the epoch is opened, so it is a
              real identity even for a rejected reveal (PRD v2 §6). */}
          slot {entry.slot} · epoch {entry.epoch} · {entry.state}
        </span>
      </header>

      <div className="surface-flat flex flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2">
        <DecisionCell decision={entry.decision} className="text-[0.8125rem]" />
        <span className="tnum text-muted-foreground ml-auto font-mono text-[0.6875rem]">
          {formatTime(entry.blockTime)}
        </span>
      </div>

      {/* The one place the semantic colour is spent on prose: this sentence IS
          the verdict in words. 13px, not 16px. */}
      <p
        className={cn(
          // min-h reserves two lines so a receipt PAIR keeps its hash rows on
          // shared baselines; the comparison is the feature.
          'min-h-[2.5rem] text-[0.75rem] leading-relaxed',
          accepted ? 'text-accepted-fg' : 'text-rejected-fg',
        )}
      >
        {plainEnglish(entry)}
      </p>

      <HashBlock collapsed={hashes === 'collapsed'}>
        <HashRow
          label="TEE signer"
          value={entry.teeSigner}
          hint={entry.rejectReason === 'BadSigner' ? 'not the registered signer' : undefined}
        />
        <HashRow label="0G Compute provider" value={entry.provider} />
        <HashRow label="Input hash" value={entry.inputHash} />
        <HashRow
          label="Request hash"
          value={entry.reqSha}
          hint="sealed — hash only"
        />
        <HashRow label="Response hash" value={entry.respSha} />
        <HashRow label="Transaction" value={entry.txHash} href={entry.chainScanUrl} />
      </HashBlock>

      <p className="text-muted-foreground flex items-start gap-2 text-[0.6875rem] leading-relaxed">
        <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
        Request commitment sealed, auditable under authorized access. The request body is never
        published — only its hash.
      </p>

      {footer}

      {/* Pushes the verify block to the bottom so a pair of receipts in a grid
          have their commands on the same baseline. */}
      {accepted ? (
        <div className="mt-auto">
          <VerifyCommand txHash={entry.txHash} />
        </div>
      ) : null}
    </article>
  );
}

/**
 * The six hash rows, optionally behind a disclosure.
 *
 * Native <details>, not React state: <DecisionReceipt> is a server component and
 * this keeps it one. No hydration, no client bundle, works with JavaScript off,
 * and the browser gives correct expand/collapse semantics to assistive tech for
 * free.
 */
function HashBlock({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) {
    return <div className="border-border/60 border-t pt-1.5">{children}</div>;
  }

  return (
    <details className="group border-border/60 border-t pt-1.5">
      <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 marker:content-none flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 text-[0.6875rem] font-medium tracking-[0.14em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none">
        <ChevronRight
          className="size-3 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="group-open:hidden">Show the bytes</span>
        <span className="hidden group-open:inline">Hide the bytes</span>
      </summary>
      <div className="pt-1">{children}</div>
    </details>
  );
}

/* ── ledger header ────────────────────────────────────────────────────────── */

export function LedgerHeader() {
  return (
    <div className="border-border-strong bg-background sticky top-0 z-10 grid grid-cols-[3.5rem_9.5rem_1fr_auto] items-center gap-4 border-b px-3 py-2">
      <span className="eyebrow">#</span>
      <span className="eyebrow">Time (UTC)</span>
      <span className="eyebrow">Decision</span>
      <span className="eyebrow">Provenance</span>
    </div>
  );
}
