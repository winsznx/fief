import { ArrowRight, KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DecisionLedger } from '@/components/fief/decision-ledger';
import { Hash } from '@/components/fief/hash';
import { HonestStatusBadge } from '@/components/fief/honest-status-badge';
import { PnlContext } from '@/components/fief/pnl-context';
import { SealedStrategyPanel } from '@/components/fief/sealed-strategy-panel';
import { VerifyCommand } from '@/components/fief/verify-command';
import { Button } from '@/components/ui/button';
import { getDataSource } from '@/lib/data/source';
import { formatCount, formatOg, formatPct, formatTime } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/agents/[tokenId]'>): Promise<Metadata> {
  const { tokenId } = await params;
  const agent = await getDataSource().getAgent(tokenId);
  if (!agent) return { title: 'Agent not found' };
  return {
    title: agent.name,
    description: `${agent.name} — ${formatCount(agent.decisionCount)} brain-bound decisions on 0G, ${formatPct(agent.brainBoundPct)}% provenance-verified.`,
  };
}

export default async function AgentRecordPage({ params }: PageProps<'/agents/[tokenId]'>) {
  const { tokenId } = await params;
  const ds = getDataSource();
  const agent = await ds.getAgent(tokenId);
  if (!agent) notFound();

  const [listing, recent] = await Promise.all([
    ds.getListing(tokenId),
    ds.getEntries(tokenId, { limit: 200 }),
  ]);

  const latestAccepted = [...recent].reverse().find((e) => e.status === 'accepted');

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-10">
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
          <Stat label="Brain-bound" value={`${formatPct(agent.brainBoundPct)}%`} />
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
          <HonestStatusBadge
            decisions={agent.decisionCount}
            brainBoundPct={agent.brainBoundPct}
            className="ml-auto"
          />
        </div>
      </header>

      {/* ── Sealed strategy + context ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <SealedStrategyPanel agent={agent} />
        <PnlContext agent={agent} />
      </div>

      {/* ── The ledger ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Decision ledger</p>
          <h2 className="text-xl font-semibold tracking-tight">
            Every entry, append-only, bound to epoch {agent.epoch}
          </h2>
          <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
            Entries recorded before a reseal stay bound to the strategy and epoch that produced
            them — nothing is inherited forward. Open any row to see its full receipt, or verify it
            independently from the command line.
          </p>
        </div>

        <DecisionLedger tokenId={agent.tokenId} />
      </section>

      {/* ── Verify strip ───────────────────────────────────────────────── */}
      {latestAccepted ? (
        <section className="border-border-strong flex flex-col gap-4 rounded-lg border p-5">
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
    <div className="border-border-strong flex flex-col gap-1 rounded-lg border p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum font-mono text-2xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
