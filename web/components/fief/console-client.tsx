'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Coins,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Hash, HashRow } from '@/components/fief/hash';
import { EmptyState, ErrorState } from '@/components/fief/states';
import { WalletGate } from '@/components/fief/wallet-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isAddress } from '@/lib/chain/zerog';
import {
  qk,
  useAuditGrants,
  useGrantAudit,
  useListing,
  useMintAgent,
  useOwnerAgents,
  useReseal,
  useRevokeAudit,
  useSetListing,
  useSetOperator,
  useSettle,
  useSettlements,
} from '@/lib/data/queries';
import { getDataMode } from '@/lib/data/source';
import type { Agent, AuditGrant, Listing, Settlement, TxResult } from '@/lib/data/types';
import { formatCount, formatDuration, formatOg, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Owner console — handoff §5.7.
 *
 * Every write goes through a stubbed DataSource mutation (handoff §11: wallet
 * writes are the owner's half), and every one renders pending / success / error
 * from the same `TxResult` envelope via <TxState>. No component here touches a
 * contract.
 *
 * Two rules that shaped the structure:
 *
 *  1. Hooks are per-token (`useSetOperator(tokenId)`), so the per-agent panels
 *     are separate components remounted with `key={tokenId}`. That keeps every
 *     hook call unconditional and avoids resetting state inside an effect, which
 *     the React Compiler rules in Next 16 reject.
 *  2. I4 — the strategy JSON is NEVER echoed back to the screen. Mint and reseal
 *     show only the resulting hashes.
 */

/* ── shared bits ──────────────────────────────────────────────────────────── */

const OG = (wei: string) => `${formatOg(wei)} OG`;

/**
 * The one place a stubbed write is explained.
 *
 * A form that reports success while changing nothing is misleading unless it
 * says so, and mock mode is the default (D4). Stated per surface rather than
 * once at the top, because that is where the owner clicks.
 */
function StubNote() {
  if (getDataMode() === 'live') return null;
  return (
    <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
      Mock mode: this write is stubbed. The returned transaction hash is synthetic and no state
      changes — the wallet write is wired by the owner behind the same interface.
    </p>
  );
}

function Panel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('surface flex flex-col gap-4 p-5', className)}
    >
      <header className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          {title}
        </h3>
        <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed">{description}</p>
      </header>
      {children}
    </section>
  );
}

/**
 * Renders the outcome of a stubbed mutation.
 *
 * `TxResult` is deliberately the only contract every write shares, so this is
 * the only place success and failure are presented — an inconsistent success
 * state across seven forms is how a console starts lying about what landed.
 */
function TxState({
  pending,
  result,
  error,
  pendingLabel = 'Submitting…',
}: {
  pending: boolean;
  result?: TxResult;
  error?: Error | null;
  pendingLabel?: string;
}) {
  if (pending) {
    return (
      <p className="text-muted-foreground font-mono text-xs" role="status">
        {pendingLabel}
      </p>
    );
  }

  if (error) {
    return <ErrorState title="The transaction could not be submitted" description={error.message} />;
  }

  if (!result) return null;

  if (!result.ok) {
    return <ErrorState title="Rejected" description={result.error} />;
  }

  return (
    <div className="border-accepted-border bg-accepted-surface flex flex-col gap-2 rounded-md border p-3">
      <p className="text-accepted-fg flex items-center gap-2 text-xs font-medium">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        Submitted
      </p>
      {result.txHash ? (
        <Hash value={result.txHash} label="transaction" href={result.chainScanUrl} chars={8} />
      ) : null}
    </div>
  );
}

/* ── entry point ──────────────────────────────────────────────────────────── */

export function ConsoleClient() {
  return (
    <WalletGate
      title="Connect a wallet to manage your agents"
      description="The console lists the agents owned by the connected address. Reading records and verifying transactions never require a wallet."
    >
      {(address) => <Console address={address} />}
    </WalletGate>
  );
}

function Console({ address }: { address: `0x${string}` }) {
  const agentsQuery = useOwnerAgents(address);
  const agents = agentsQuery.data ?? [];

  const [chosen, setChosen] = useState<string | null>(null);
  // Derived, not synced in an effect: the first agent is the default until the
  // owner picks another.
  const selectedId = chosen ?? agents[0]?.tokenId ?? null;
  const selected = agents.find((a) => a.tokenId === selectedId) ?? null;

  if (agentsQuery.isPending) {
    return <p className="text-muted-foreground font-mono text-sm">loading your agents…</p>;
  }

  if (agentsQuery.isError) {
    return (
      <ErrorState
        title="Could not load your agents"
        action={
          <Button size="sm" variant="outline" onClick={() => void agentsQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">Your agents</h2>
          <span className="text-muted-foreground tnum font-mono text-xs">
            owner <Hash value={address} label="owner address" chars={4} copy={false} />
          </span>
        </div>

        {agents.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="No agents yet"
            description="Seal a strategy and mint it to create an agent. The strategy is encrypted before it leaves your machine; only its commitment hash and storage root go on-chain."
            action={
              <Button size="sm" asChild>
                <a href="#mint">
                  Seal and mint an agent
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <li key={agent.tokenId}>
                <AgentPick
                  agent={agent}
                  selected={agent.tokenId === selectedId}
                  onSelect={() => setChosen(agent.tokenId)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* key= remounts every per-agent panel on switch, so no panel carries
          another agent's form state and no hook resets inside an effect. */}
      {selected ? <AgentAdmin key={selected.tokenId} agent={selected} /> : null}

      <MintPanel />
    </div>
  );
}

function AgentPick({
  agent,
  selected,
  onSelect,
}: {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'focus-visible:ring-ring/60 flex w-full flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        selected
          ? 'border-border-strong bg-muted'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tracking-tight">{agent.name}</span>
        <span className="text-muted-foreground tnum font-mono text-xs">#{agent.tokenId}</span>
      </span>
      <span className="text-muted-foreground text-xs">{agent.domain}</span>
      <span className="text-muted-foreground tnum flex flex-wrap gap-x-3 font-mono text-[0.6875rem]">
        <span>{formatCount(agent.decisionCount)} decisions</span>
        <span>epoch {agent.epoch}</span>
        <span>{agent.lifecycle}</span>
      </span>
    </button>
  );
}

/* ── per-agent panels ─────────────────────────────────────────────────────── */

function AgentAdmin({ agent }: { agent: Agent }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="eyebrow">Manage {agent.name}</h2>
        <p className="text-muted-foreground text-sm">
          Token #{agent.tokenId} · epoch {agent.epoch} · minted {formatTime(agent.createdAt)}
        </p>
      </div>

      <Tabs defaultValue="listing" className="gap-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="listing">Listing</TabsTrigger>
          <TabsTrigger value="operator">Operator</TabsTrigger>
          <TabsTrigger value="reseal">Reseal</TabsTrigger>
          <TabsTrigger value="settlement">Settlement</TabsTrigger>
          <TabsTrigger value="audit">Audit access</TabsTrigger>
        </TabsList>

        <TabsContent value="listing">
          <ListingPanel agent={agent} />
        </TabsContent>
        <TabsContent value="operator">
          <OperatorPanel agent={agent} />
        </TabsContent>
        <TabsContent value="reseal">
          <ResealPanel agent={agent} />
        </TabsContent>
        <TabsContent value="settlement">
          <SettlementPanel agent={agent} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel agent={agent} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/* ── listing ──────────────────────────────────────────────────────────────── */

const TERM_PRESETS = [7, 14, 30, 90] as const;
const DAY_SECONDS = 86_400;

function ListingPanel({ agent }: { agent: Agent }) {
  const listingQuery = useListing(agent.tokenId);

  if (listingQuery.isPending) {
    return <p className="text-muted-foreground font-mono text-sm">loading current terms…</p>;
  }

  if (listingQuery.isError) {
    return (
      <ErrorState
        title="Could not load the listing"
        action={
          <Button size="sm" variant="outline" onClick={() => void listingQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  // Remounted once the terms resolve, so the form seeds its fields from props in
  // a useState initializer. Deliberately not a setState during render or an
  // effect that syncs props into state — the plan's constraint, and the reason
  // this is a loader plus a form rather than one component.
  const listing = listingQuery.data ?? null;
  return (
    <ListingForm
      key={`${agent.tokenId}:${listing ? 'listed' : 'unset'}`}
      agent={agent}
      listing={listing}
    />
  );
}

function ListingForm({ agent, listing }: { agent: Agent; listing: Listing | null }) {
  const setListing = useSetListing(agent.tokenId);
  const queryClient = useQueryClient();

  const [fee, setFee] = useState(() =>
    listing ? formatOg(listing.feePerDecisionWei) : '',
  );
  const [minEscrow, setMinEscrow] = useState(() =>
    listing ? formatOg(listing.minEscrowWei) : '',
  );
  const [termDays, setTermDays] = useState(() =>
    listing ? String(Math.round(listing.termSeconds / DAY_SECONDS)) : '30',
  );
  const [active, setActive] = useState(() => listing?.active ?? true);

  const feeWei = parseOg(fee);
  const minEscrowWei = parseOg(minEscrow);
  const days = /^\d+$/.test(termDays.trim()) ? Number(termDays.trim()) : null;

  const invalid = feeWei === null || minEscrowWei === null || days === null || days < 1;

  return (
    <Panel
      icon={Tag}
      title="Rental terms"
      description="Fee per decision, the minimum escrow a renter must post, and the term length. Max decisions is not set here — it is derived at rent time from the escrow the renter actually posts (escrow ÷ fee), so a renter always sees the number their own deposit buys."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="fee"
          label="Fee / decision (OG)"
          value={fee}
          onChange={setFee}
          invalid={fee.trim() !== '' && feeWei === null}
          placeholder="0.01"
        />
        <Field
          id="min-escrow"
          label="Minimum escrow (OG)"
          value={minEscrow}
          onChange={setMinEscrow}
          invalid={minEscrow.trim() !== '' && minEscrowWei === null}
          placeholder="0.1"
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="term">Term (days)</Label>
          <Input
            id="term"
            inputMode="numeric"
            value={termDays}
            onChange={(e) => setTermDays(e.target.value)}
            aria-invalid={days === null || days < 1}
            className="tnum font-mono"
          />
          <div className="flex flex-wrap gap-1">
            {TERM_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setTermDays(String(d))}
                className="border-border text-muted-foreground hover:bg-muted focus-visible:ring-ring/60 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] focus-visible:ring-2 focus-visible:outline-none"
              >
                {d}d
              </button>
            ))}
          </div>
          <p className="text-muted-foreground tnum font-mono text-[0.6875rem]">
            {days !== null && days >= 1
              ? `termSeconds ${formatCount(days * DAY_SECONDS)} · ${formatDuration(days * DAY_SECONDS)}`
              : 'enter a whole number of days'}
          </p>
        </div>
      </div>

      <div className="border-border flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3">
        <Switch id="listed" checked={active} onCheckedChange={setActive} />
        <Label htmlFor="listed" className="text-sm font-normal">
          {active ? 'Listed — renters can rent this agent' : 'Unlisted — no new rentals'}
        </Label>
        <span className="text-muted-foreground ml-auto text-xs">
          Unlisting never affects existing grants or the record.
        </span>
      </div>

      <StubNote />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={invalid || setListing.isPending}
          onClick={() => {
            if (feeWei === null || minEscrowWei === null || days === null) return;
            setListing.mutate(
              {
                feePerDecisionWei: feeWei,
                minEscrowWei,
                termSeconds: days * DAY_SECONDS,
                active,
              },
              {
                onSuccess: (r) => {
                  if (r.ok) {
                    toast.success(active ? 'Listing updated' : 'Agent unlisted');
                    void queryClient.invalidateQueries({ queryKey: qk.listing(agent.tokenId) });
                  }
                },
              },
            );
          }}
        >
          {setListing.isPending ? 'Submitting…' : active ? 'Save listing' : 'Unlist agent'}
        </Button>
        {listing ? (
          <span className="text-muted-foreground tnum font-mono text-xs">
            current: {OG(listing.feePerDecisionWei)} / decision · min{' '}
            {OG(listing.minEscrowWei)} · {formatDuration(listing.termSeconds)} ·{' '}
            {listing.active ? 'listed' : 'unlisted'}
          </span>
        ) : null}
      </div>

      <TxState
        pending={setListing.isPending}
        result={setListing.data}
        error={setListing.error}
      />
    </Panel>
  );
}

/* ── operator ─────────────────────────────────────────────────────────────── */

function OperatorPanel({ agent }: { agent: Agent }) {
  const setOperator = useSetOperator(agent.tokenId);
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string>(agent.operator);

  const trimmed = value.trim();
  const valid = isAddress(trimmed);
  const unchanged = trimmed.toLowerCase() === agent.operator.toLowerCase();

  return (
    <Panel
      icon={UserCog}
      title="Operator"
      description="The runtime address allowed to append entries for this agent. Only the operator can record a decision; changing it does not alter or reopen anything already recorded."
    >
      <div className="border-border divide-border divide-y rounded-md border px-4 py-1">
        <HashRow label="Current operator" value={agent.operator} chars={8} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="operator">New operator address</Label>
        <Input
          id="operator"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="0x…"
          aria-invalid={trimmed !== '' && !valid}
          aria-describedby="operator-error"
          className="tnum max-w-lg font-mono text-sm"
        />
        <p id="operator-error" role="alert" className="text-rejected-fg min-h-4 text-xs">
          {trimmed !== '' && !valid ? 'Enter a 20-byte address: 0x followed by 40 hex characters.' : null}
        </p>
      </div>

      <StubNote />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!valid || unchanged || setOperator.isPending}
          onClick={() => {
            if (!valid) return;
            setOperator.mutate(trimmed, {
              onSuccess: (r) => {
                if (r.ok) {
                  toast.success('Operator updated');
                  void queryClient.invalidateQueries({ queryKey: qk.agent(agent.tokenId) });
                }
              },
            });
          }}
        >
          {setOperator.isPending ? 'Submitting…' : 'Set operator'}
        </Button>
        {unchanged && valid ? (
          <span className="text-muted-foreground text-xs">
            This is already the registered operator.
          </span>
        ) : null}
      </div>

      <TxState
        pending={setOperator.isPending}
        result={setOperator.data}
        error={setOperator.error}
      />
    </Panel>
  );
}

/* ── reseal ───────────────────────────────────────────────────────────────── */

function ResealPanel({ agent }: { agent: Agent }) {
  const reseal = useReseal(agent.tokenId);
  const queryClient = useQueryClient();
  const [strategy, setStrategy] = useState('');

  const parsed = useMemo(() => tryParseJson(strategy), [strategy]);
  const ready = strategy.trim() !== '' && parsed.ok;

  return (
    <Panel
      icon={RefreshCw}
      title="Reseal — new strategy, next epoch"
      description="Sealing a new strategy encrypts it, publishes a new commitment hash and storage root, and advances the token to the next epoch."
    >
      {/* The non-negotiable warning. A reseal must never look like an upgrade
          that carries the old track record forward. */}
      <p className="border-border text-muted-foreground flex items-start gap-2 rounded-md border border-dashed p-3 text-xs leading-relaxed">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Entries already recorded stay bound to the strategy and epoch that produced them —{' '}
          <strong className="text-foreground font-semibold">nothing is inherited forward</strong>.
          After this, epoch {agent.epoch + 1} starts with an empty record, and a reader can always
          tell which epoch produced which decision.
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reseal-strategy">Strategy JSON</Label>
        <textarea
          id="reseal-strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          spellCheck={false}
          rows={6}
          placeholder={'{ "model": "…", "rules": [ … ] }'}
          aria-invalid={strategy.trim() !== '' && !parsed.ok}
          aria-describedby="reseal-error"
          className="border-border-strong focus-visible:ring-ring/60 bg-background w-full rounded-md border p-3 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
        />
        <p id="reseal-error" role="alert" className="text-rejected-fg min-h-4 text-xs">
          {strategy.trim() !== '' && !parsed.ok ? parsed.error : null}
        </p>
        {/* I4: never echoed back. */}
        <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          The strategy is hashed and encrypted before upload. It is never displayed back to this
          screen, never logged, and never written to the chain — only its commitment and storage
          root are public.
        </p>
      </div>

      <StubNote />

      <Button
        disabled={!ready || reseal.isPending}
        onClick={() =>
          reseal.mutate(
            { strategyJson: strategy },
            {
              onSuccess: (r) => {
                if (r.ok) {
                  toast.success(`Resealed — epoch ${r.epoch ?? agent.epoch + 1}`);
                  void queryClient.invalidateQueries({ queryKey: qk.agent(agent.tokenId) });
                }
              },
            },
          )
        }
      >
        {reseal.isPending ? 'Sealing…' : 'Seal and advance epoch'}
      </Button>

      <TxState pending={reseal.isPending} result={reseal.data} error={reseal.error} pendingLabel="Encrypting, uploading and submitting…" />

      {reseal.data?.ok ? (
        <div className="border-border divide-border divide-y rounded-md border px-4 py-1">
          {reseal.data.epoch !== undefined ? (
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <span className="eyebrow">New epoch</span>
              <span className="tnum font-mono text-sm">{reseal.data.epoch}</span>
            </div>
          ) : null}
          {reseal.data.strategyHash ? (
            <HashRow label="Strategy commitment (H)" value={reseal.data.strategyHash} />
          ) : null}
          {reseal.data.storageRoot ? (
            <HashRow label="0G Storage root" value={reseal.data.storageRoot} />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

/* ── settlement ───────────────────────────────────────────────────────────── */

function SettlementPanel({ agent }: { agent: Agent }) {
  const settlementsQuery = useSettlements(agent.tokenId);
  const settle = useSettle(agent.tokenId);
  const queryClient = useQueryClient();

  // Memoised because `?? []` would otherwise produce a new array identity on
  // every render and invalidate every downstream useMemo that depends on it.
  const rows = useMemo(() => settlementsQuery.data ?? [], [settlementsQuery.data]);
  const unsettled = useMemo(() => rows.filter((r) => !r.settled), [rows]);

  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const selected = useMemo(
    () => unsettled.filter((r) => picked.has(r.slot)),
    [unsettled, picked],
  );

  const totals = useMemo(() => sumSettlements(selected), [selected]);

  const toggle = (slot: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  if (settlementsQuery.isPending) {
    return <p className="text-muted-foreground font-mono text-sm">loading settlements…</p>;
  }

  if (settlementsQuery.isError) {
    return (
      <ErrorState
        title="Could not load settlements"
        action={
          <Button size="sm" variant="outline" onClick={() => void settlementsQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <Panel
      icon={Coins}
      title="Settlement"
      description="Settlement pulls the fee for each accepted entry attributed to a renter, pays you the fee minus the 200 bps protocol fee, and decrements that renter's escrow. Pull-based: nothing is pushed to your address."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to settle"
          description="No accepted entry on this agent is attributed to a renter yet. Entries recorded outside a rental have no fee to collect."
        />
      ) : (
        <>
          {/* D17 — partial settlement is allowed, grounded in the signature:
              settle(tokenId, entryIndices[]) takes an array, and an
              all-or-nothing design would not need indices at all. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPicked(new Set(unsettled.map((r) => r.slot)))}
              disabled={unsettled.length === 0}
            >
              Select all unsettled ({formatCount(unsettled.length)})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPicked(new Set())}
              disabled={picked.size === 0}
            >
              Clear
            </Button>
            <span className="text-muted-foreground ml-auto tnum font-mono text-xs">
              {formatCount(rows.length - unsettled.length)} of {formatCount(rows.length)} already
              settled
            </span>
          </div>

          <div className="border-border-strong max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Accepted entries attributed to renters, with fees and settlement status
              </caption>
              <thead className="bg-muted/40 sticky top-0">
                <tr className="border-border-strong border-b">
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="eyebrow px-2 py-2">Entry</th>
                  <th scope="col" className="eyebrow px-2 py-2">Renter</th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right">Fee</th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right">Protocol</th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right">Net to you</th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <SettlementRow
                    key={row.slot}
                    row={row}
                    tokenId={agent.tokenId}
                    checked={picked.has(row.slot)}
                    onToggle={() => toggle(row.slot)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <dl className="border-border-strong bg-muted/30 grid gap-4 rounded-md border p-4 sm:grid-cols-4">
            <Total label="Selected" value={formatCount(selected.length)} />
            <Total label="Gross fees" value={OG(totals.fee)} />
            <Total label="Protocol fee (200 bps)" value={OG(totals.protocol)} />
            <Total label="Net to you" value={OG(totals.net)} />
          </dl>

          <StubNote />

          <Button
            disabled={selected.length === 0 || settle.isPending}
            onClick={() =>
              settle.mutate(
                selected.map((r) => r.slot),
                {
                  onSuccess: (r) => {
                    if (r.ok) {
                      toast.success(`Settled ${formatCount(selected.length)} entries`);
                      setPicked(new Set());
                      void queryClient.invalidateQueries({
                        queryKey: qk.settlements(agent.tokenId),
                      });
                    }
                  },
                },
              )
            }
          >
            {settle.isPending
              ? 'Settling…'
              : selected.length === 0
                ? 'Select entries to settle'
                : `Settle ${formatCount(selected.length)} selected`}
          </Button>

          <TxState pending={settle.isPending} result={settle.data} error={settle.error} />
        </>
      )}
    </Panel>
  );
}

function SettlementRow({
  row,
  tokenId,
  checked,
  onToggle,
}: {
  row: Settlement;
  tokenId: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className={cn('border-border border-b last:border-0', checked && 'bg-muted/60')}>
      <td className="px-3 py-1.5">
        {row.settled ? (
          <span className="sr-only">Already settled</span>
        ) : (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select entry ${row.slot} for settlement`}
            className="accent-foreground size-3.5 align-middle"
          />
        )}
      </td>
      <td className="tnum px-2 py-1.5 font-mono">
        {/* The entry route is keyed on txHash (v1.1 Q1), which a Settlement only
            carries once it has been settled. An unsettled row therefore shows
            the index as plain text rather than a link that cannot be built. */}
        {row.txHash ? (
          <Link
            href={`/agents/${tokenId}/entries/${row.txHash}`}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            #{row.slot}
          </Link>
        ) : (
          <span>#{row.slot}</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <Hash value={row.renter} label="renter address" chars={4} copy={false} />
      </td>
      <td className="tnum px-2 py-1.5 text-right font-mono">{OG(row.feeWei)}</td>
      <td className="tnum text-muted-foreground px-2 py-1.5 text-right font-mono">
        −{OG(row.protocolFeeWei)}
      </td>
      <td className="tnum px-2 py-1.5 text-right font-mono">{OG(row.netToOwnerWei)}</td>
      <td className="px-2 py-1.5 text-right">
        {row.settled ? (
          <span className="text-muted-foreground font-mono text-[0.6875rem]">settled</span>
        ) : (
          <span className="border-border-strong rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem]">
            due
          </span>
        )}
      </td>
    </tr>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum font-mono text-sm">{value}</dd>
    </div>
  );
}

/* ── audit grants ─────────────────────────────────────────────────────────── */

const AUDIT_STATUS_COPY: Record<AuditGrant['status'], string> = {
  // D18 — "pending" means authorised on-chain, sealed key not yet delivered.
  // Worded so it describes the state without asserting the delivery mechanism.
  pending: 'authorised — sealed access not yet delivered',
  active: 'active — can recompute request hashes',
  revoked: 'revoked',
};

function AuditPanel({ agent }: { agent: Agent }) {
  const grantsQuery = useAuditGrants(agent.tokenId);
  const grantAudit = useGrantAudit(agent.tokenId);
  const revokeAudit = useRevokeAudit(agent.tokenId);
  const queryClient = useQueryClient();

  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const valid = isAddress(trimmed);

  const grants = grantsQuery.data ?? [];
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: qk.auditGrants(agent.tokenId) });

  return (
    <Panel
      icon={KeyRound}
      title="Audit access"
      description="Fief declares the strategy commitment on the response side, which means a determined owner could run a request that does not contain the sealed strategy. Granting an auditor access is the remedy: they recompute the request hash for any past entry and confirm it matches what is recorded on-chain."
    >
      {grantsQuery.isPending ? (
        <p className="text-muted-foreground font-mono text-xs">loading grants…</p>
      ) : grants.length === 0 ? (
        <EmptyState
          title="No auditors granted"
          description="A prospective buyer or auditor can be granted access to verify the request side of any past entry, without the strategy ever being published."
        />
      ) : (
        <ul className="border-border-strong divide-border divide-y rounded-md border">
          {grants.map((grant) => (
            <li
              key={grant.auditor}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs"
            >
              <Hash value={grant.auditor} label="auditor address" chars={6} />
              <span className="text-muted-foreground">{AUDIT_STATUS_COPY[grant.status]}</span>
              <span className="text-muted-foreground tnum ml-auto font-mono">
                {formatTime(grant.grantedAt)}
              </span>
              {grant.status !== 'revoked' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revokeAudit.isPending}
                  onClick={() =>
                    revokeAudit.mutate(grant.auditor, {
                      onSuccess: (r) => {
                        if (r.ok) {
                          toast.success('Audit access revoked');
                          invalidate();
                        }
                      },
                    })
                  }
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auditor">Grant access to an address</Label>
        <div className="flex flex-wrap items-start gap-2">
          <Input
            id="auditor"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            aria-invalid={trimmed !== '' && !valid}
            aria-describedby="auditor-error"
            className="tnum min-w-0 flex-1 font-mono text-sm"
          />
          <Button
            disabled={!valid || grantAudit.isPending}
            onClick={() => {
              if (!valid) return;
              grantAudit.mutate(trimmed, {
                onSuccess: (r) => {
                  if (r.ok) {
                    toast.success('Audit access granted');
                    setValue('');
                    invalidate();
                  }
                },
              });
            }}
          >
            {grantAudit.isPending ? 'Submitting…' : 'Grant access'}
          </Button>
        </div>
        <p id="auditor-error" role="alert" className="text-rejected-fg min-h-4 text-xs">
          {trimmed !== '' && !valid ? 'Enter a 20-byte address: 0x followed by 40 hex characters.' : null}
        </p>
      </div>

      <StubNote />

      <TxState pending={grantAudit.isPending} result={grantAudit.data} error={grantAudit.error} />
      <TxState pending={revokeAudit.isPending} result={revokeAudit.data} error={revokeAudit.error} />
    </Panel>
  );
}

/* ── mint ─────────────────────────────────────────────────────────────────── */

function MintPanel() {
  const mint = useMintAgent();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [operator, setOperator] = useState('');
  const [strategy, setStrategy] = useState('');

  const parsed = useMemo(() => tryParseJson(strategy), [strategy]);
  const operatorValid = isAddress(operator.trim());
  const ready =
    name.trim() !== '' && domain.trim() !== '' && operatorValid && strategy.trim() !== '' && parsed.ok;

  return (
    <section id="mint" className="flex flex-col gap-4 scroll-mt-24">
      <h2 className="eyebrow">Seal and mint</h2>
      <Panel
        icon={Plus}
        title="New agent"
        description="Sealing encrypts the strategy, uploads it to 0G Storage and mints an ERC-7857 token committed to its hash. The strategy itself never goes on-chain and is never shown back to you."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Name" value={name} onChange={setName} placeholder="Delphi-BTC" mono={false} />
          <Field
            id="domain"
            label="Domain"
            value={domain}
            onChange={setDomain}
            placeholder="BTC short-horizon direction"
            mono={false}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mint-operator">Operator address</Label>
          <Input
            id="mint-operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            aria-invalid={operator.trim() !== '' && !operatorValid}
            aria-describedby="mint-operator-error"
            className="tnum max-w-lg font-mono text-sm"
          />
          <p id="mint-operator-error" role="alert" className="text-rejected-fg min-h-4 text-xs">
            {operator.trim() !== '' && !operatorValid
              ? 'Enter a 20-byte address: 0x followed by 40 hex characters.'
              : null}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mint-strategy">Strategy JSON</Label>
          <textarea
            id="mint-strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            spellCheck={false}
            rows={6}
            placeholder={'{ "model": "…", "rules": [ … ] }'}
            aria-invalid={strategy.trim() !== '' && !parsed.ok}
            aria-describedby="mint-strategy-error"
            className="border-border-strong focus-visible:ring-ring/60 bg-background w-full rounded-md border p-3 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
          />
          <p id="mint-strategy-error" role="alert" className="text-rejected-fg min-h-4 text-xs">
            {strategy.trim() !== '' && !parsed.ok ? parsed.error : null}
          </p>
          {/* I4 — the reason this panel returns hashes and nothing else. */}
          <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
            Encrypted before upload. Never displayed back to this screen, never logged, never
            written to the chain — only the commitment hash and storage root are public.
          </p>
        </div>

        <StubNote />

        <Button
          disabled={!ready || mint.isPending}
          onClick={() =>
            mint.mutate(
              {
                name: name.trim(),
                domain: domain.trim(),
                strategyJson: strategy,
                operator: operator.trim() as `0x${string}`,
              },
              {
                onSuccess: (r) => {
                  if (r.ok) {
                    toast.success(r.tokenId ? `Minted agent #${r.tokenId}` : 'Agent minted');
                    // The strategy is cleared on success so it cannot linger in
                    // a form field, or in a screenshot of one.
                    setStrategy('');
                    void queryClient.invalidateQueries({ queryKey: qk.agents });
                  }
                },
              },
            )
          }
        >
          {mint.isPending ? 'Sealing and minting…' : 'Seal and mint'}
        </Button>

        <TxState
          pending={mint.isPending}
          result={mint.data}
          error={mint.error}
          pendingLabel="Encrypting, uploading to 0G Storage and minting…"
        />

        {mint.data?.ok ? (
          <div className="border-border divide-border divide-y rounded-md border px-4 py-1">
            {mint.data.tokenId ? (
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="eyebrow">Token</span>
                <span className="tnum font-mono text-sm">#{mint.data.tokenId}</span>
              </div>
            ) : null}
            {mint.data.strategyHash ? (
              <HashRow label="Strategy commitment (H)" value={mint.data.strategyHash} />
            ) : null}
            {mint.data.storageRoot ? (
              <HashRow label="0G Storage root" value={mint.data.storageRoot} />
            ) : null}
          </div>
        ) : null}
      </Panel>
    </section>
  );
}

/* ── small helpers ────────────────────────────────────────────────────────── */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
  mono = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid}
        className={mono ? 'tnum font-mono' : undefined}
      />
    </div>
  );
}

/**
 * OG decimal string → wei string.
 *
 * Hand-rolled BigInt rather than a float multiply: 0.01 OG is not exactly
 * representable in binary floating point, and silently paying a renter
 * 9999999999999998 wei instead of 10000000000000000 is exactly the class of bug
 * that must not exist in a fee field.
 */
function parseOg(input: string): string | null {
  const raw = input.trim();
  if (raw === '' || !/^\d*\.?\d*$/.test(raw) || raw === '.') return null;
  const [whole = '0', frac = ''] = raw.split('.');
  if (frac.length > 18) return null;
  const padded = (frac + '0'.repeat(18)).slice(0, 18);
  try {
    const wei = BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0');
    return wei > 0n ? wei.toString() : null;
  } catch {
    return null;
  }
}

function tryParseJson(input: string): { ok: true } | { ok: false; error: string } {
  if (input.trim() === '') return { ok: false, error: 'Paste the strategy JSON.' };
  try {
    JSON.parse(input);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Invalid JSON: ${e.message}` : 'Invalid JSON.' };
  }
}

function sumSettlements(rows: Settlement[]): { fee: string; protocol: string; net: string } {
  let fee = 0n;
  let protocol = 0n;
  let net = 0n;
  for (const r of rows) {
    fee += BigInt(r.feeWei);
    protocol += BigInt(r.protocolFeeWei);
    net += BigInt(r.netToOwnerWei);
  }
  return { fee: fee.toString(), protocol: protocol.toString(), net: net.toString() };
}
