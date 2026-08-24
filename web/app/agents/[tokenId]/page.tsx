import { ArrowRight, CheckCircle2, KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DecisionLedger } from '@/components/fief/decision-ledger';
import { Hash } from '@/components/fief/hash';
import { HonestStatusBadge } from '@/components/fief/honest-status-badge';
import { hasPnlContext, PnlContext } from '@/components/fief/pnl-context';
import { SealedStrategyPanel } from '@/components/fief/sealed-strategy-panel';
import { VerifyCommand } from '@/components/fief/verify-command';
import { Button } from '@/components/ui/button';
import { getDataSource } from '@/lib/data/source';
import { formatCount, formatOg, formatTime } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/agents/[tokenId]'>): Promise<Metadata> {
  const { tokenId } = await params;
  const agent = await getDataSource().getAgent(tokenId);
  if (!agent) return { title: 'Agent not found' };
  return {
    title: agent.name,
    description: `${agent.name} — ${formatCount(agent.decisionCount)} accepted decisions on 0G, each verified against the agent's sealed strategy commitment.`,
  };
}

export default async function AgentRecordPage({ params }: PageProps<'/agents/[tokenId]'>) {
  const { tokenId } = await params;
  const ds = getDataSource();
  const agent = await ds.getAgent(tokenId);
  if (!agent) notFound();

  const [listing, recent, showcase] = await Promise.all([
    ds.getListing(tokenId),
    // Accepted-only (v1.1 Q1), so the last element IS the latest accepted entry
    // — no status filter is needed to find it.
    ds.getEntries(tokenId, { limit: 200 }),
    ds.getShowcasePair(),
  ]);

  const latestAccepted = recent.at(-1);

  return (
    <main className="container-page flex flex-col gap-8 px-4 py-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Agent #{agent.tokenId} · {agent.domain}</p>
            <h1 className="display">{agent.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {listing?.active ? (
              <Button asChild>
                <Link href={`/agents/${agent.tokenId}/rent`}>
                  Rent this agent
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button disabled variant="outline">
                Not listed to rent
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/about#audit">
                <KeyRound className="size-4" aria-hidden />
                Request audit access
              </Link>
            </Button>
          </div>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Decisions recorded" value={formatCount(agent.decisionCount)} />
          {/* v1.1 Q1: a verified badge, never a percentage. Every stored entry
              passed the on-chain check by invariant I1, so a fraction would be
              either always 100% or misleading. */}
          <div className="surface flex flex-col gap-1 p-4">
            <dt className="eyebrow">Provenance</dt>
            <dd className="text-accepted-fg flex items-center gap-2 font-mono text-2xl font-semibold tracking-tight">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden />
              verified
            </dd>
          </div>
          <Stat label="Epoch" value={String(agent.epoch)} />
          <Stat
            label="Fee / decision"
            value={listing?.active ? `${formatOg(listing.feePerDecisionWei)} OG` : '—'}
          />
        </dl>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="flex items-center gap-2">
            <span className="eyebrow">Owner</span>
            <Hash value={agent.owner} label="owner address" chars={5} />
          </span>
          <span className="flex items-center gap-2">
            <span className="eyebrow">Operator</span>
            <Hash value={agent.operator} label="operator address" chars={5} />
          </span>
          <span className="tnum font-mono">minted {formatTime(agent.createdAt)}</span>
          <HonestStatusBadge decisions={agent.decisionCount} className="ml-auto" />
        </div>
      </header>

      {/* ── Sealed strategy + context ──────────────────────────────────── */}
      {/* PnlContext returns null when the agent has no series (D16), so the
          column split is chosen from the same predicate rather than left as a
          two-column grid with a dead half. */}
      <div className={hasPnlContext(agent) ? 'grid gap-6 lg:grid-cols-[1.2fr_1fr]' : 'grid gap-6'}>
        <SealedStrategyPanel agent={agent} />
        <PnlContext agent={agent} />
      </div>

      {/* ── The ledger ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Decision ledger</p>
          <h2 className="heading text-xl">
            Every accepted entry, append-only, bound to epoch {agent.epoch}
          </h2>
          <p className="text-muted-foreground max-w-3xl text-[0.8125rem] leading-relaxed">
            This is the stored record: on-chain it holds accepted decisions only, because a
            submission that fails the check is rejected by the contract and never appended. Entries
            recorded before a reseal stay bound to the strategy and epoch that produced them —
            nothing is inherited forward. Open any row to see its full receipt, or verify it
            independently from the command line.
          </p>
        </div>

        <DecisionLedger tokenId={agent.tokenId} />
      </section>

      {/* ── Provenance demo ────────────────────────────────────────────── */}
      {/* A7 / handoff §5.4: the ledger above is clean by construction, so this
          is where the green/red story reconnects to the record. The rejected
          example is stated plainly as living elsewhere, so nothing implies this
          agent has a failure hidden in its history. */}
      {showcase ? (
        <section className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">Provenance demo</p>
            <span className="border-rejected-border text-rejected-fg rounded-sm border border-dashed px-2 py-0.5 font-mono text-[0.6875rem]">
              tamper test
            </span>
          </div>
          <h2 className="text-base font-semibold tracking-tight">
            Want to see the check fail?
          </h2>
          <p className="text-muted-foreground max-w-3xl text-[0.8125rem] leading-relaxed">
            A rejected submission is not part of this ledger, or any ledger — it has no entry index
            because the contract never stored it. The deliberate tamper test lives on the proof
            page: the same submission as an accepted entry, re-sent with a single changed byte, side
            by side with the transaction that was refused.
          </p>
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href="/proof">
              See the accepted / rejected pair
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </section>
      ) : null}

      {/* ── Verify strip ───────────────────────────────────────────────── */}
      {latestAccepted ? (
        <section className="surface flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">Don&rsquo;t take our word for it</p>
            <h2 className="text-base font-semibold tracking-tight">
              Verify the most recent accepted entry
            </h2>
          </div>
          <VerifyCommand txHash={latestAccepted.txHash} />
        </section>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum font-mono text-2xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
