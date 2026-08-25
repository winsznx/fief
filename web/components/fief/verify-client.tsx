'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDataSource } from '@/lib/data/source';
import type { VerifyCheck, VerifyResult } from '@/lib/data/types';
import { cn } from '@/lib/utils';
import { DecisionReceipt } from './decision-receipt';
import { EmptyState, ErrorState } from './states';
import { VerifyCommand } from './verify-command';

/**
 * Verify — handoff §5.8.
 *
 * States: idle, checking, valid, tampered, not_found, error. v1.1 [12] replaced
 * `ok: boolean` with `outcome`, so `not_found` and `error` are distinguishable;
 * previously both collapsed into `ok: false` with an implicit "tx found" check,
 * which cannot drive two different UI states.
 *
 * A tampered result is reachable for the deliberate tamper tests, which are the
 * only rejected transactions that exist (v1.1 Q1) — an agent's record itself is
 * accepted-only.
 *
 * Read-only. No wallet, by design.
 */
export function VerifyClient({ initialTxHash = '' }: { initialTxHash?: string }) {
  const [value, setValue] = useState(initialTxHash);

  const verify = useMutation<VerifyResult, Error, string>({
    mutationFn: (txHash) => getDataSource().verifyTx(txHash),
  });

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed === '') return;
    verify.mutate(trimmed);
  };

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Label htmlFor="txhash">Transaction hash</Label>
        <div className="flex flex-wrap items-start gap-2">
          <Input
            id="txhash"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            className="tnum min-w-0 flex-1 font-mono text-sm"
            aria-describedby="txhash-help"
          />
          <Button type="submit" disabled={value.trim() === '' || verify.isPending}>
            {verify.isPending ? (
              'Checking…'
            ) : (
              <>
                <Search className="size-4" aria-hidden />
                Verify
              </>
            )}
          </Button>
        </div>
        <p id="txhash-help" className="text-muted-foreground text-xs">
          A 32-byte transaction hash from 0G. Nothing is sent anywhere — the check reads public
          chain data only, and needs no wallet.
        </p>
      </form>

      {verify.isIdle ? (
        <EmptyState
          icon={Search}
          title="Paste a transaction hash to check it"
          description="The result shows each on-chain check individually: whether the signature recovered to the registered TEE signer, whether the reveal opened the commitment published at commit time, and whether the commit line matched the sealed strategy for that slot."
        />
      ) : null}

      {verify.isError ? (
        <ErrorState
          title="The check could not be run"
          description={verify.error.message}
          action={
            <Button size="sm" variant="outline" onClick={submit}>
              Try again
            </Button>
          }
        />
      ) : null}

      {verify.data ? <Result result={verify.data} /> : null}
    </div>
  );
}

function Result({ result }: { result: VerifyResult }) {
  if (result.outcome === 'not_found') {
    return (
      <ErrorState
        title="No record entry at this hash"
        description="The transaction is not a Fief decision entry on this network, or it does not exist. Check the hash and the network."
      />
    );
  }

  if (result.outcome === 'error') {
    return (
      <ErrorState
        title="That is not a valid transaction hash"
        // v1.1 populates `error` iff outcome === 'error', so the message no
        // longer has to be mined out of the checks array.
        description={
          result.error ?? result.checks[0]?.detail ?? 'Expected 0x followed by 64 hex characters.'
        }
      />
    );
  }

  const valid = result.outcome === 'valid';

  return (
    <div className="flex flex-col gap-6">
      <section
        className={cn(
          // D20 — neutral surface with an accent edge, matching the receipt.
          'surface flex flex-col gap-4 border-l-2 p-5',
          valid ? 'border-l-accepted' : 'border-l-rejected border-dashed',
        )}
      >
        <header className="flex items-center gap-3">
          {valid ? (
            <Check className="text-accepted-fg size-5 shrink-0" aria-hidden />
          ) : (
            <X className="text-rejected-fg size-5 shrink-0" aria-hidden />
          )}
          <h2
            className={cn(
              'heading text-base',
              valid ? 'text-accepted-fg' : 'text-rejected-fg',
            )}
          >
            {valid ? 'Verified — every check passed' : 'Rejected — a check failed'}
          </h2>
          <span className="text-muted-foreground ml-auto font-mono text-xs">{result.network}</span>
        </header>

        <ul className="flex flex-col gap-1.5">
          {result.checks.map((check) => (
            <CheckRow key={check.name} check={check} />
          ))}
        </ul>
      </section>

      {result.entry ? (
        <>
          <DecisionReceipt entry={result.entry} variant="full" />
          {result.entry.status === 'accepted' ? (
            <VerifyCommand
              txHash={result.entry.txHash}
              label="Run the same check on your machine"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CheckRow({ check }: { check: VerifyCheck }) {
  const Icon = check.pass ? Check : X;
  return (
    <li
      className={cn(
        'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm',
        check.pass ? 'text-accepted-fg' : 'text-rejected-fg',
      )}
    >
      <Icon className="mt-1 size-3.5 shrink-0" aria-hidden />
      <span className="font-mono text-xs">{check.name}</span>
      <span className="sr-only">{check.pass ? ' — passed' : ' — failed'}</span>
      {check.detail ? (
        <span className="text-muted-foreground text-xs">— {check.detail}</span>
      ) : null}
    </li>
  );
}
