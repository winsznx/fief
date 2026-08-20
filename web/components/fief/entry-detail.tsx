import Link from 'next/link';
import { DecisionReceipt } from '@/components/fief/decision-receipt';
import { Hash } from '@/components/fief/hash';
import { CONTENT_ANCHOR } from '@/lib/data/commit';
import type { Agent, DecisionEntry } from '@/lib/data/types';
import { cn } from '@/lib/utils';

/**
 * Shared body for the entry detail, rendered by BOTH the standalone route and
 * the intercepted sheet, so a shared link and a soft navigation always show
 * identical content.
 */
export function EntryDetail({
  entry,
  agent,
  className,
}: {
  entry: DecisionEntry;
  agent: Agent;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">
          <Link href={`/agents/${agent.tokenId}`} className="hover:text-foreground underline-offset-4 hover:underline">
            {agent.name}
          </Link>{' '}
          · entry #{entry.index}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {entry.status === 'accepted' ? 'Accepted decision' : 'Rejected submission'}
        </h1>
      </header>

      <DecisionReceipt entry={entry} variant="full" />

      {entry.respData ? <ResponseBytes entry={entry} /> : null}
    </div>
  );
}

/**
 * The public response bytes.
 *
 * PRD §4.1: respData is "small, public by design (it is the decision)", so
 * showing it in full is correct and is what makes the record independently
 * checkable. The request body is never shown — only its hash, which the receipt
 * above already carries.
 */
function ResponseBytes({ entry }: { entry: DecisionEntry }) {
  const bytes = entry.respData ?? '';
  const offset = entry.commitOffset ?? 0;
  const anchorEnd = offset + CONTENT_ANCHOR.length;

  return (
    <section className="border-border-strong flex flex-col gap-3 rounded-lg border p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Signed response bytes</h2>
        <span className="text-muted-foreground tnum font-mono text-xs">
          {bytes.length} bytes · commit anchor at {offset}
        </span>
      </header>

      <p className="text-muted-foreground text-xs leading-relaxed">
        This is the full provider envelope the TEE signed. The commitment is not at offset 0 — it
        sits at the head of the assistant message content, immediately after the{' '}
        <code className="font-mono">{CONTENT_ANCHOR}</code> anchor highlighted below. The contract
        rebuilds those expected bytes from its own on-chain state and compares them here.
      </p>

      <pre className="border-border bg-muted/40 max-h-72 overflow-auto rounded-md border p-3 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap break-all">
        <span className="text-muted-foreground">{bytes.slice(0, offset)}</span>
        <mark className="bg-accepted-surface text-accepted-fg rounded-[2px] font-semibold">
          {bytes.slice(offset, anchorEnd)}
        </mark>
        <span>{bytes.slice(anchorEnd)}</span>
      </pre>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-2">
          <span className="eyebrow">Response hash</span>
          <Hash value={entry.respSha} label="response hash" chars={6} />
        </span>
      </div>
    </section>
  );
}
