import { Check, ExternalLink, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ByteDiffReveal } from '@/components/fief/byte-diff-reveal';
import { DecisionReceipt } from '@/components/fief/decision-receipt';
import { HonestStatusBadge } from '@/components/fief/honest-status-badge';
import { VerifyCommand } from '@/components/fief/verify-command';
import { Button } from '@/components/ui/button';
import { APPROVED, LIMITS } from '@/lib/copy';
import { getDataSource } from '@/lib/data/source';

export const metadata: Metadata = {
  title: 'Proof',
  description:
    'Two transactions on 0G: one accepted decision from a live TEE inference, one rejected after a single tampered byte.',
};

/** Mirrors PRD §4.1 in plain words. */
const PROVEN = [
  'The response was produced by the TEE signer registered in 0G’s inference serving contract.',
  'The response bytes submitted on-chain hash to the text that signer signed.',
  'The run declared this agent, this sealed strategy commitment, this epoch, this nonce and this input.',
  'The nonce had not been used before, so the entry cannot be a replay.',
  'The entry is append-only and survives rental, transfer and reseal.',
];

const NOT_PROVEN = [
  'That the decisions were profitable. Fief records provenance, never performance.',
  'That the request actually contained the sealed strategy — the commitment is declared on the response side. An authorized request audit closes this, and is a product feature rather than a footnote.',
  'Anything about the ERC-7857 draft verifier’s cryptographic strength. Record integrity does not depend on it.',
  'That a renter cannot approximate the strategy by observing many outputs over time. That is a documented residual risk.',
];

export default async function ProofPage() {
  const ds = getDataSource();
  const pair = await ds.getShowcasePair();
  if (!pair) notFound();

  const { green, red } = pair;
  const agent = await ds.getAgent(pair.tokenId);

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-12 px-4 py-12">
      <header className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="eyebrow">The two-minute check</p>
        <h1 className="display">Two transactions. One byte apart.</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          No wallet, no signup, no setup. Below are an accepted decision and the identical
          submission with a single tampered byte, plus the command to verify either one yourself.
        </p>
        <HonestStatusBadge
          decisions={agent?.decisionCount}
          brainBoundPct={agent?.brainBoundPct}
        />
      </header>

      {/* ── The pair ────────────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Accepted and rejected transactions">
        <DecisionReceipt entry={green} variant="showcase" />
        <DecisionReceipt entry={red} variant="showcase" />
      </section>

      <ByteDiffReveal green={green} red={red} className="mx-auto w-full max-w-4xl" />

      {/* ── Verify it yourself ─────────────────────────────────────────── */}
      <section className="border-border-strong mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-lg border p-6">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Check it without us</p>
          <h2 className="text-xl font-semibold tracking-tight">
            Recompute everything from public RPC data.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The verifier is read-only and takes no keys. It fetches the transaction, recomputes the
            hashes, recovers the signer and compares it against the TEE signer registered on-chain.
          </p>
        </div>

        <VerifyCommand txHash={green.txHash} label="Verify the accepted transaction" />
        <VerifyCommand txHash={red.txHash} label="Verify the rejected transaction" />

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <a href={green.chainScanUrl} target="_blank" rel="noreferrer noopener">
              Accepted on ChainScan
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={red.chainScanUrl} target="_blank" rel="noreferrer noopener">
              Rejected on ChainScan
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/verify">Paste your own hash</Link>
          </Button>
        </div>
      </section>

      {/* ── The mechanism ─────────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <p className="eyebrow">The mechanism</p>
        <h2 className="text-xl font-semibold tracking-tight">
          Why the record cannot be quietly rewritten
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          The signature covers a hash of the request and a hash of the response together. The
          request holds the secret strategy, so it is never published — only its hash goes on-chain,
          sealed. The response is public by design, because it <em>is</em> the decision. The contract
          rebuilds the expected commitment from its own state and compares it byte-for-byte against
          the response before accepting anything.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          This is stricter than the reference client. 0G&rsquo;s own SDK trusts the signed text the
          provider returns and only recovers the signer from it. Fief recomputes the response hash
          on-chain and rebuilds that text from the actual bytes first, so a provider returning text
          that does not match the real request and response passes the SDK but fails here.
        </p>
      </section>

      {/* ── Proven / not proven ───────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">
        <div className="border-accepted-border bg-accepted-surface flex flex-col gap-3 rounded-lg border p-5">
          <h3 className="text-accepted-fg flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Check className="size-4 shrink-0" aria-hidden />
            What this proves
          </h3>
          <ul className="flex flex-col gap-2.5">
            {PROVEN.map((item) => (
              <li key={item} className="text-accepted-fg flex gap-2 text-sm leading-relaxed">
                <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-rejected-border bg-rejected-surface flex flex-col gap-3 rounded-lg border border-dashed p-5">
          <h3 className="text-rejected-fg flex items-center gap-2 text-sm font-semibold tracking-tight">
            <X className="size-4 shrink-0" aria-hidden />
            What it does not
          </h3>
          <ul className="flex flex-col gap-2.5">
            {NOT_PROVEN.map((item) => (
              <li key={item} className="text-rejected-fg flex gap-2 text-sm leading-relaxed">
                <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-border mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-lg border border-dashed p-6">
        <p className="eyebrow">Stated plainly</p>
        <p className="text-muted-foreground text-sm leading-relaxed">{LIMITS.provenanceNotAlpha}</p>
        <p className="text-muted-foreground text-sm leading-relaxed">{APPROVED.audit}.</p>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/about">Full limits and threat model</Link>
        </Button>
      </section>
    </main>
  );
}
