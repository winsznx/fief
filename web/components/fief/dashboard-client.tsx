'use client';

import { useQueries } from '@tanstack/react-query';
import { Inbox, Radio } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { qk, useRenterGrants } from '@/lib/data/queries';
import { getDataSource } from '@/lib/data/source';
import { useRenterFeed } from '@/lib/data/use-renter-feed';
import type { FeedStatus, Grant } from '@/lib/data/types';
import {
  formatCount,
  formatOg,
  formatRelativeExpiry,
  formatTimeShort,
  formatUnit,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState } from './states';
import { WalletGate } from './wallet-gate';

/**
 * Renter dashboard — handoff §5.6.
 *
 * "each message links to its on-chain entry index so the renter can verify
 * independently" — that link is the point of the feed, not a nicety, so every
 * row is a link to the entry route.
 */
export function DashboardClient() {
  return (
    <WalletGate
      title="Connect a wallet to see your rentals"
      description="Your dashboard lists the agents you have rented and streams their verified decisions. Reading records and verifying transactions never require a wallet."
    >
      {(address) => <Grants address={address} />}
    </WalletGate>
  );
}

function Grants({ address }: { address: `0x${string}` }) {
  const grantsQuery = useRenterGrants(address);
  const grants = grantsQuery.data ?? [];

  const agentQueries = useQueries({
    queries: grants.map((g) => ({
      queryKey: qk.agent(g.tokenId),
      queryFn: () => getDataSource().getAgent(g.tokenId),
    })),
  });

  const active = grants.filter((g) => g.status === 'active');
  const [chosen, setChosen] = useState<string | null>(null);

  // Derived rather than synced in an effect: the first active grant is the
  // default until the renter picks another.
  const selected = chosen ?? active[0]?.tokenId ?? null;

  if (grantsQuery.isPending) {
    return <p className="text-muted-foreground font-mono text-sm">loading rentals…</p>;
  }

  if (grantsQuery.isError) {
    return (
      <ErrorState
        title="Could not load your rentals"
        action={
          <Button size="sm" variant="outline" onClick={() => void grantsQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (grants.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No rentals yet"
        description="Rent an agent to start receiving its decisions. Every message you receive links to its on-chain entry so you can verify it yourself."
        action={
          <Button asChild size="sm">
            <Link href="/agents">Browse agents</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="eyebrow">Your rentals</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {grants.map((grant, i) => (
            <GrantCard
              key={`${grant.tokenId}-${grant.renter}`}
              grant={grant}
              agentName={agentQueries[i]?.data?.name ?? `Agent #${grant.tokenId}`}
              selected={selected === grant.tokenId}
              onSelect={() => setChosen(grant.tokenId)}
            />
          ))}
        </div>
      </section>

      {/* key= remounts the feed on switch, so useRenterFeed never resets state
          inside an effect. */}
      {selected ? <Feed key={selected} tokenId={selected} /> : null}
    </div>
  );
}

function GrantCard({
  grant,
  agentName,
  selected,
  onSelect,
}: {
  grant: Grant;
  agentName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const expired = grant.status !== 'active';
  const used = Math.min(grant.decisionsUsed, grant.maxDecisions);
  const pct = grant.maxDecisions === 0 ? 0 : (used / grant.maxDecisions) * 100;

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-lg border p-5',
        expired ? 'border-border border-dashed opacity-80' : 'border-border-strong',
        selected && !expired && 'ring-ring/40 ring-2',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold tracking-tight">{agentName}</h3>
          <span className="text-muted-foreground tnum font-mono text-xs">
            token #{grant.tokenId}
          </span>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[0.6875rem] uppercase',
            expired
              ? 'border-border-strong text-muted-foreground'
              : 'border-accepted-border bg-accepted-surface text-accepted-fg',
          )}
        >
          {grant.status}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Field label="Escrow left" value={`${formatOg(grant.remainingEscrowWei)} OG`} />
        <Field
          label="Decisions"
          value={`${formatCount(used)} / ${formatCount(grant.maxDecisions)}`}
        />
        <Field label="Expiry" value={formatRelativeExpiry(grant.expiry)} />
      </dl>

      <div className="flex flex-col gap-1.5">
        <Progress value={pct} aria-label="Decisions consumed" />
        <span className="text-muted-foreground tnum font-mono text-[0.6875rem]">
          {formatCount(grant.maxDecisions - used)} decisions remaining
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {!expired ? (
          <Button size="sm" variant={selected ? 'secondary' : 'outline'} onClick={onSelect}>
            {selected ? 'Showing feed' : 'Show feed'}
          </Button>
        ) : null}
        <Button asChild size="sm" variant="ghost">
          <Link href={`/agents/${grant.tokenId}`}>Full record</Link>
        </Button>
      </div>
    </article>
  );
}

const FEED_STATUS_COPY: Record<FeedStatus, string> = {
  connecting: 'connecting…',
  open: 'live',
  reconnecting: 'reconnecting…',
  closed: 'closed',
};

function Feed({ tokenId }: { tokenId: string }) {
  const { messages, status } = useRenterFeed(tokenId);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="eyebrow">Live decision feed</h2>
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[0.6875rem]',
            status === 'open'
              ? 'border-accepted-border bg-accepted-surface text-accepted-fg'
              : 'border-border-strong text-muted-foreground',
          )}
        >
          <Radio className="size-3 shrink-0" aria-hidden />
          {FEED_STATUS_COPY[status]}
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[0.6875rem]">
          every message links to its on-chain entry
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed px-5 py-10 text-center text-sm">
          {status === 'connecting'
            ? 'Opening the feed…'
            : 'Waiting for the next decision. Entries appear here as they are recorded on-chain.'}
        </div>
      ) : (
        <ul className="border-border-strong divide-border divide-y overflow-hidden rounded-lg border">
          {messages.map((m, i) => (
            <li key={`${m.revealTxHash ?? m.commitTxHash}-${m.at}-${i}`}>
              <Link
                // Deep-linked on txHash (v1.1 Q1), which RenterFeedMessage
                // already carries. The visible label stays the entry index,
                // because that is what the renter sees in the ledger.
                href={`/agents/${m.tokenId}/entries/${m.revealTxHash ?? m.commitTxHash}`}
                className="hover:bg-muted/50 focus-visible:ring-ring/60 grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-2.5 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              >
                <span className="tnum text-muted-foreground font-mono text-xs">
                  {formatTimeShort(m.at)}
                </span>
                <span className="tnum flex items-baseline gap-2 font-mono text-sm">
                  <span className="font-medium">{m.decision.dir}</span>
                  <span className="text-muted-foreground text-xs">
                    conf {formatUnit(m.decision.conf)} · size {formatUnit(m.decision.size)}
                  </span>
                </span>
                <span className="text-muted-foreground tnum font-mono text-xs">
                  entry #{m.slot} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
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
