'use client';

import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useListing, useRent } from '@/lib/data/queries';
import type { Agent, Grant } from '@/lib/data/types';
import { formatCount, formatOg, formatRelativeExpiry } from '@/lib/format';
import { ErrorState } from './states';
import { WalletGate } from './wallet-gate';

/**
 * Rent flow — handoff §5.5.
 *
 * "Do not implement real transactions — call a mock rent() action that returns
 * a Grant, and stub the wallet write behind the data layer." So the confirm
 * step calls the mock mutation only; nothing here touches a contract.
 *
 * States covered per §5.5: wrong-network and disconnected (via WalletGate),
 * insufficient-balance (mockable below), pending, success, error.
 */

/** Mock spendable balance, so the insufficient-balance state is reachable. */
const MOCK_BALANCE_WEI = 500_000_000_000_000_000n; // 0.5 OG

export function RentClient({ agent }: { agent: Agent }) {
  return (
    <WalletGate
      title="Connect a wallet to rent"
      description="Renting escrows OG on 0G and grants your address access to this agent's verified decision feed. Browsing and verifying never require a wallet."
    >
      {() => <RentForm agent={agent} />}
    </WalletGate>
  );
}

function RentForm({ agent }: { agent: Agent }) {
  const listingQuery = useListing(agent.tokenId);
  const rent = useRent(agent.tokenId);
  const [amount, setAmount] = useState('');
  const [grant, setGrant] = useState<Grant | null>(null);

  const listing = listingQuery.data;

  const parsed = useMemo(() => {
    if (amount.trim() === '') return null;
    if (!/^\d*\.?\d*$/.test(amount.trim())) return null;
    const [whole = '0', frac = ''] = amount.trim().split('.');
    const padded = (frac + '0'.repeat(18)).slice(0, 18);
    try {
      return BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0');
    } catch {
      return null;
    }
  }, [amount]);

  if (listingQuery.isPending) {
    return <p className="text-muted-foreground font-mono text-sm">loading terms…</p>;
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

  if (!listing || !listing.active) {
    return (
      <ErrorState
        title="This agent is not listed"
        description="Its owner has not set rental terms, or has unlisted it. You can still read the full record and verify any entry."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={`/agents/${agent.tokenId}`}>Back to the record</Link>
          </Button>
        }
      />
    );
  }

  const minEscrow = BigInt(listing.minEscrowWei);
  const belowMin = parsed !== null && parsed < minEscrow;
  const insufficient = parsed !== null && parsed > MOCK_BALANCE_WEI;
  const invalid = amount.trim() !== '' && parsed === null;
  const canSubmit = parsed !== null && !belowMin && !insufficient && !rent.isPending;

  /* ── Success ─────────────────────────────────────────────────────────── */
  if (grant) {
    return (
      <section className="border-accepted-border bg-accepted-surface flex flex-col gap-4 rounded-lg border p-6">
        <h2 className="text-accepted-fg flex items-center gap-2 text-lg font-semibold tracking-tight">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          Rental active
        </h2>
        <p className="text-accepted-fg text-sm leading-relaxed">
          Your address now receives {agent.name}&rsquo;s decisions as they are recorded. Each message
          in your feed links to its on-chain entry, so you can verify every decision you pay for
          independently.
        </p>
        <dl className="border-accepted-border grid gap-3 border-t pt-3 sm:grid-cols-3">
          <Term label="Escrowed" value={`${formatOg(grant.remainingEscrowWei)} OG`} />
          <Term label="Max decisions" value={formatCount(grant.maxDecisions)} />
          <Term label="Expires" value={formatRelativeExpiry(grant.expiry)} />
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Open your dashboard
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/agents/${agent.tokenId}`}>View the record</Link>
          </Button>
        </div>
      </section>
    );
  }

  /* ── Form ────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-6">
      <section className="border-border-strong flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="text-sm font-semibold tracking-tight">Terms</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Term label="Fee / decision" value={`${formatOg(listing.feePerDecisionWei)} OG`} />
          <Term label="Minimum escrow" value={`${formatOg(listing.minEscrowWei)} OG`} />
          <Term label="Max decisions" value={formatCount(listing.maxDecisions)} />
          <Term label="Term" value={`${listing.termDays} days`} />
        </dl>
        <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
          Settlement pulls the fee per accepted entry attributed to your address. Unspent escrow is
          reclaimable after expiry. Fief never takes custody of trading capital and never executes
          trades — you receive decisions and act on them yourself.
        </p>
      </section>

      <section className="border-border-strong flex flex-col gap-4 rounded-lg border p-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="escrow">Escrow amount (OG)</Label>
          <Input
            id="escrow"
            inputMode="decimal"
            autoComplete="off"
            placeholder={formatOg(listing.minEscrowWei)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="escrow-help escrow-error"
            aria-invalid={invalid || belowMin || insufficient}
            className="tnum max-w-xs font-mono"
          />
          <p id="escrow-help" className="text-muted-foreground text-xs">
            Mock balance: <span className="tnum font-mono">{formatOg(MOCK_BALANCE_WEI.toString())} OG</span>.
            At {formatOg(listing.feePerDecisionWei)} OG per decision, this escrow covers{' '}
            <span className="tnum font-mono">
              {parsed === null
                ? '—'
                : formatCount(Number(parsed / BigInt(listing.feePerDecisionWei)))}
            </span>{' '}
            decisions.
          </p>

          <p id="escrow-error" role="alert" className="text-rejected-fg min-h-4 text-xs">
            {invalid ? 'Enter a decimal amount in OG.' : null}
            {belowMin
              ? `Below the minimum escrow of ${formatOg(listing.minEscrowWei)} OG.`
              : null}
            {insufficient ? 'Insufficient balance for this escrow amount.' : null}
          </p>
        </div>

        {rent.isError ? (
          <ErrorState
            title="The rental could not be created"
            description={rent.error instanceof Error ? rent.error.message : undefined}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (parsed === null) return;
              rent.mutate(parsed.toString(), { onSuccess: (g) => setGrant(g) });
            }}
          >
            {rent.isPending ? 'Confirming…' : 'Confirm rental'}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/agents/${agent.tokenId}`}>Cancel</Link>
          </Button>
          {/* The term is stated in days rather than an absolute timestamp: the
              expiry is set when the transaction lands, not when this page
              renders, so a rendered clock time would be misleading. */}
          <span className="text-muted-foreground ml-auto font-mono text-[0.6875rem]">
            expires {listing.termDays} days after confirmation
          </span>
        </div>
      </section>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum font-mono text-sm">{value}</dd>
    </div>
  );
}
