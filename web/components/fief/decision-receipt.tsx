import { Lock } from 'lucide-react';
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
      href={`/agents/${tokenId}/entries/${entry.index}`}
      className={cn(
        'border-border hover:bg-muted/50 focus-visible:ring-ring/60 grid h-row grid-cols-[3.5rem_9.5rem_1fr_auto] items-center gap-4 border-b px-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        // Redundant, non-colour cue: a left rule marks rejected rows so they
        // are findable when scanning a long ledger in greyscale.
        accepted ? 'border-l-2 border-l-transparent' : 'border-l-rejected border-l-2',
        className,
      )}
    >
      <span className="tnum text-muted-foreground font-mono text-xs">#{entry.index}</span>
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
}: {
  entry: DecisionEntry;
  variant?: 'full' | 'showcase';
  className?: string;
}) {
  const accepted = entry.status === 'accepted';
  const showcase = variant === 'showcase';

  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border',
        accepted
          ? 'border-accepted-border bg-accepted-surface'
          : 'border-rejected-border border-dashed bg-rejected-surface',
        showcase ? 'gap-5 p-6 sm:p-7' : 'gap-4 p-5',
        className,
      )}
      aria-label={
        accepted
          ? 'Accepted decision receipt'
          : `Rejected decision receipt: ${entry.rejectReason ?? 'unknown reason'}`
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <StatusPill
            status={entry.status}
            rejectReason={entry.rejectReason}
            size={showcase ? 'lg' : 'md'}
          />
          <p
            className={cn(
              'font-semibold tracking-tight',
              showcase ? 'display-showcase' : 'text-base',
              accepted ? 'text-accepted-fg' : 'text-rejected-fg',
            )}
          >
            {accepted ? 'Accepted — brain-bound' : `Rejected — ${entry.rejectReason ?? 'unknown'}`}
          </p>
        </div>
        <span className="tnum text-muted-foreground font-mono text-xs">
          entry #{entry.index} · nonce {entry.nonce} · epoch {entry.epoch}
        </span>
      </header>

      <div
        className={cn(
          'border-border-strong bg-background/60 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-4 py-3',
          showcase && 'text-lg',
        )}
      >
        <DecisionCell decision={entry.decision} className={showcase ? 'text-xl' : 'text-base'} />
        <span className="tnum text-muted-foreground ml-auto font-mono text-xs">
          {formatTime(entry.blockTime)}
        </span>
      </div>

      <p
        className={cn(
          'leading-relaxed',
          showcase ? 'text-base' : 'text-sm',
          accepted ? 'text-accepted-fg' : 'text-rejected-fg',
        )}
      >
        {plainEnglish(entry)}
      </p>

      <div className="border-border divide-border divide-y border-t pt-1">
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
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
        <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
        Request commitment sealed, auditable under authorized access. The request body is never
        published — only its hash.
      </p>

      {accepted ? <VerifyCommand txHash={entry.txHash} /> : null}
    </article>
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
