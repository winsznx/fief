'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AgentCard } from '@/components/fief/agent-card';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/fief/states';
import { Button } from '@/components/ui/button';
import { qk } from '@/lib/data/queries';
import { getDataSource } from '@/lib/data/source';
import { cn } from '@/lib/utils';

type RecordFilter = 'all' | 'has-record' | 'listed';

const FILTERS: { id: RecordFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'has-record', label: 'Has live record' },
  { id: 'listed', label: 'Listed to rent' },
];

export function MarketplaceClient() {
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [domain, setDomain] = useState<string>('all');

  const agentsQuery = useQuery({
    queryKey: qk.agents,
    queryFn: () => getDataSource().listAgents(),
  });

  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  // Per-card listing + recent entries, as handoff §5.3 specifies.
  const listingQueries = useQueries({
    queries: agents.map((a) => ({
      queryKey: qk.listing(a.tokenId),
      queryFn: () => getDataSource().getListing(a.tokenId),
    })),
  });

  const entryQueries = useQueries({
    queries: agents.map((a) => ({
      queryKey: [...qk.entries(a.tokenId), 'spark'] as const,
      queryFn: () => getDataSource().getEntries(a.tokenId, { limit: 40 }),
    })),
  });

  const domains = useMemo(
    () => Array.from(new Set(agents.map((a) => a.domain))).sort(),
    [agents],
  );

  const visible = useMemo(() => {
    return agents
      .map((agent, i) => ({
        agent,
        listing: listingQueries[i]?.data ?? null,
        entries: entryQueries[i]?.data ?? [],
      }))
      .filter(({ agent, listing }) => {
        if (domain !== 'all' && agent.domain !== domain) return false;
        if (filter === 'has-record' && agent.decisionCount === 0) return false;
        if (filter === 'listed' && !listing?.active) return false;
        return true;
      });
  }, [agents, listingQueries, entryQueries, filter, domain]);

  if (agentsQuery.isPending) {
    return <CardGridSkeleton cards={6} />;
  }

  if (agentsQuery.isError) {
    return (
      <ErrorState
        title="Could not load agents"
        description="The indexer is unreachable. The chain remains the source of truth — you can still verify any transaction directly."
        action={
          <Button size="sm" variant="outline" onClick={() => void agentsQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by record"
        >
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
              label={f.label}
            />
          ))}
        </div>

        {domains.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by domain">
            <FilterChip
              active={domain === 'all'}
              onClick={() => setDomain('all')}
              label="All domains"
            />
            {domains.map((d) => (
              <FilterChip
                key={d}
                active={domain === d}
                onClick={() => setDomain(d)}
                label={d}
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground tnum font-mono text-xs">
        {visible.length} of {agents.length} agents
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No agents match this filter"
          description="Try clearing the filters, or check back once more agents have been minted and listed."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilter('all');
                setDomain('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ agent, listing, entries }) => (
            <AgentCard
              key={agent.tokenId}
              agent={agent}
              listing={listing}
              entries={entries}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-visible:ring-ring/60 rounded-sm border px-3 py-1 font-mono text-[0.6875rem] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border-strong text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
