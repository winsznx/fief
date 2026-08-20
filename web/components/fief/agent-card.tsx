import Link from 'next/link';
import type { Agent, DecisionEntry, Listing } from '@/lib/data/types';
import { formatCount, formatOg, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ProvenanceSparkline } from './charts';

const LIFECYCLE_COPY: Record<Agent['lifecycle'], string> = {
  sealed: 'Sealed',
  minted: 'Minted',
  active: 'Active',
  listed: 'Listed',
  rented: 'Rented',
  retired: 'Retired',
};

export function AgentCard({
  agent,
  listing,
  entries,
  className,
}: {
  agent: Agent;
  listing?: Listing | null;
  entries?: DecisionEntry[];
  className?: string;
}) {
  const hasRecord = agent.decisionCount > 0;

  return (
    <Link
      href={`/agents/${agent.tokenId}`}
      className={cn(
        'border-border-strong hover:bg-muted/40 focus-visible:ring-ring/60 flex flex-col gap-4 rounded-lg border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold tracking-tight">{agent.name}</h3>
          <p className="text-muted-foreground text-xs">{agent.domain}</p>
        </div>
        <span className="border-border-strong text-muted-foreground shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[0.6875rem]">
          {LIFECYCLE_COPY[agent.lifecycle]}
        </span>
      </header>

      {entries && entries.length > 0 ? (
        <ProvenanceSparkline entries={entries} />
      ) : (
        <div className="border-border text-muted-foreground flex h-6 items-center justify-center rounded-sm border border-dashed text-[0.6875rem]">
          no entries yet
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label="Decisions" value={hasRecord ? formatCount(agent.decisionCount) : '—'} />
        <Field
          label="Brain-bound"
          value={hasRecord ? `${formatPct(agent.brainBoundPct)}%` : '—'}
        />
        <Field label="Epoch" value={String(agent.epoch)} />
        <Field
          label="Fee / decision"
          value={
            listing?.active ? `${formatOg(listing.feePerDecisionWei)} OG` : 'not listed'
          }
        />
      </dl>
    </Link>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum font-mono">{value}</dd>
    </div>
  );
}
