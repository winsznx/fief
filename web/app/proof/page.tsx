import { Check, ExternalLink, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ByteDiffReveal } from '@/components/fief/byte-diff-reveal';
import { DecisionReceipt } from '@/components/fief/decision-receipt';
import { VerifyCommand } from '@/components/fief/verify-command';
import { Button } from '@/components/ui/button';
import { APPROVED, LIMITS } from '@/lib/copy';
import { getDataSource } from '@/lib/data/source';
import { asSentence } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Proof',
  description:
    'Two transactions on 0G: one accepted decision from a live TEE inference, one rejected after a single tampered byte.',
};

/** Mirrors PRD §4.1 in plain words. */
const PROVEN = [
  'The response was produced by the TEE signer registered in 0G’s inference serving contract.',
  'The response bytes submitted on-chain hash to the text that signer signed.',
  'The run declared this agent, this sealed strategy commitment, this epoch, this slot and this input.',
  'The slot was scheduled before the outcome was knowable, and it accepts exactly one commit, so the entry cannot be a replay or a late addition.',
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

  // D14 — an AGGREGATE badge, deliberately not attributed to one agent.
  //
  // The green is a real accepted ledger entry; the red is a tamper test that
  // belongs to no record (v1.1 Q1). A per-agent badge here would imply the
  // tamper test is part of that agent's history, which is exactly the wrong
  // claim on the page whose whole job is to be precise about it. There is no
  // percentage either: every stored entry passed the check by invariant I1.
  return (
    <main className="container-page flex flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="eyebrow">The two-minute check</p>
        {/* Hero scale: /proof is the other surface someone is sent a link to
            cold, so it carries the same weight as the landing page (D19). */}
        <h1 className="display-hero">
          Two transactions.{' '}
          <span className="text-foreground/50">One byte apart.</span>
        </h1>
        <p className="page-lede">
          No wallet, no signup, no setup. Below are an accepted decision and the identical
          submission with a single tampered byte, plus the command to verify either one yourself.
        </p>
      </header>

      {/* ── The difference, first ───────────────────────────────────────── */}
      <ByteDiffReveal green={green} red={red} />

      {/* ── The two outcomes ────────────────────────────────────────────── */}
      <section className="grid items-stretch gap-4 lg:grid-cols-2" aria-label="Accepted and rejected transactions">
        <DecisionReceipt entry={green} variant="showcase" hashes="collapsed" className="h-full" />
        <DecisionReceipt
          entry={red}
          variant="showcase"
          hashes="collapsed"
          className="h-full"
          footer={
            /* Inside the card, not below it: the note belongs to this receipt,
               and hanging it underneath left the pair with ragged bottoms. */
            <p className="text-muted-foreground text-xs leading-relaxed">
              This transaction is a <strong className="font-semibold">tamper test</strong>. It was
              refused on-chain, so it has no entry index and appears in no agent&rsquo;s record.
            </p>
          }
        />
      </section>

      {/* ── Verify it yourself ─────────────────────────────────────────── */}
      <section className="surface flex w-full flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Check it without us</p>
          <h2 className="heading text-xl">
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
      <section className="flex w-full max-w-[68ch] flex-col gap-4">
        <p className="eyebrow">The mechanism</p>
        <h2 className="heading text-xl">
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
      <section className="grid w-full items-stretch gap-4 lg:grid-cols-2">
        {/* D20 — neutral surface, accent edge, coloured ICONS. Two full-bleed
            tinted panels side by side turned the page into a green block next to
            a red block, and the body copy inheriting the semantic colour made
            plain prose read as status. The claim is carried by the icon and the
            heading; the sentences are just sentences. */}
        <div className="surface border-l-accepted flex h-full flex-col gap-3 border-l-2 p-5">
          <h3 className="heading text-accepted-fg flex items-center gap-2 text-sm">
            <Check className="size-4 shrink-0" aria-hidden />
            What this proves
          </h3>
          <ul className="flex flex-col gap-2.5">
            {PROVEN.map((item) => (
              <li key={item} className="text-muted-foreground flex gap-2 text-[0.8125rem] leading-relaxed">
                <Check className="text-accepted-fg mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface border-l-rejected flex h-full flex-col gap-3 border-l-2 border-dashed p-5">
          <h3 className="heading text-rejected-fg flex items-center gap-2 text-sm">
            <X className="size-4 shrink-0" aria-hidden />
            What it does not
          </h3>
          <ul className="flex flex-col gap-2.5">
            {NOT_PROVEN.map((item) => (
              <li key={item} className="text-muted-foreground flex gap-2 text-[0.8125rem] leading-relaxed">
                <X className="text-rejected-fg mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="surface flex w-full flex-col gap-3 p-6">
        <p className="eyebrow">Stated plainly</p>
        <p className="text-muted-foreground text-sm leading-relaxed">{LIMITS.provenanceNotAlpha}</p>
        <p className="text-muted-foreground text-sm leading-relaxed">{asSentence(APPROVED.audit)}.</p>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/about">Full limits and threat model</Link>
        </Button>
      </section>
    </main>
  );
}
