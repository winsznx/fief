import { notFound } from 'next/navigation';
import { DecisionReceipt, DecisionReceiptRow, LedgerHeader } from '@/components/fief/decision-receipt';
import { Hash, HashRow } from '@/components/fief/hash';
import { HonestStatusBadge } from '@/components/fief/honest-status-badge';
import { PnlContext } from '@/components/fief/pnl-context';
import { CardGridSkeleton, EmptyState, ErrorState, LedgerSkeleton } from '@/components/fief/states';
import { StatusPill } from '@/components/fief/status-pill';
import { VerifyCommand } from '@/components/fief/verify-command';
import { Button } from '@/components/ui/button';
import {
  getAgents,
  getEntriesFor,
  getShowcasePair,
  getTamperTests,
  MOCK_OWNER,
} from '@/lib/data/fixtures';
import type { Agent, RejectReason } from '@/lib/data/types';

/**
 * Dev-only design gallery (plan T11).
 *
 * PR0 ships tokens + primitives before any product page, so this route exists
 * to make the foundation reviewable on its own and to render every component
 * state side by side in both themes. Excluded from production builds.
 */

export const metadata = { title: 'Design system' };

const REASONS: RejectReason[] = [
  'BadCommit',
  'BadSigner',
  'BadNonce',
  'BadEpoch',
  'BadHash',
  'NotOperator',
  'BadAnchor',
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="eyebrow">{title}</h2>
        {note ? <p className="text-muted-foreground max-w-2xl text-sm">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="border-border-strong h-14 rounded-md border"
        style={{ background: `var(${token})` }}
      />
      <span className="font-mono text-[0.6875rem]">{label}</span>
      <span className="text-muted-foreground font-mono text-[0.625rem]">{token}</span>
    </div>
  );
}

export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const { green, red } = getShowcasePair();
  const ledger = getEntriesFor('2').slice(0, 6);
  const tamperTests = getTamperTests();

  // D16: PnlContext returns null without a series, so the gallery supplies an
  // explicitly synthetic one. Labelled as a sample directly below the chart —
  // fabricated performance must never be attributable to a real agent.
  const baseAgent = getAgents()[0];
  const illustrativeAgent: Agent = {
    ...baseAgent,
    pnlContext: {
      window: '7d',
      note: 'context — provenance only, not verified',
      series: [0, 1.2, 0.8, 2.1, 1.6, 2.8, 2.2, 3.4].map((v, i) => ({
        t: `2026-08-${String(13 + i).padStart(2, '0')}T00:00:00.000Z`,
        v,
      })),
    },
  };

  return (
    <main className="container-page flex flex-col gap-14 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Dev only · /design</p>
        <h1 className="display">Design system</h1>
        <p className="page-lede max-w-2xl">
          Foundation review surface. Toggle the theme in the top nav to check both. Desaturate a
          screenshot of the receipt section to confirm the Accepted/Rejected distinction survives
          greyscale — that is the acceptance test for redundant encoding.
        </p>
      </header>

      <Section
        title="Semantic colour"
        note="The only saturated colours in the product. Everything else is neutral, and charts stay greyscale so a rising P&L can never read as a verified claim."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Swatch token="--accepted" label="accepted" />
          <Swatch token="--accepted-fg" label="accepted-fg" />
          <Swatch token="--accepted-surface" label="accepted-surface" />
          <Swatch token="--accepted-border" label="accepted-border" />
          <Swatch token="--rejected" label="rejected" />
          <Swatch token="--rejected-fg" label="rejected-fg" />
          <Swatch token="--rejected-surface" label="rejected-surface" />
          <Swatch token="--rejected-border" label="rejected-border" />
        </div>
      </Section>

      <Section title="Neutral scale">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch token="--background" label="background" />
          <Swatch token="--card" label="card" />
          <Swatch token="--muted" label="muted" />
          <Swatch token="--border" label="border" />
          <Swatch token="--border-strong" label="border-strong" />
          <Swatch token="--foreground" label="foreground" />
        </div>
      </Section>

      <Section title="Typography" note="Mono-forward: every numeral, hash and label is monospace with tabular numerals.">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">eyebrow · mono 11px · 0.18em tracking</p>
          <p className="display">Display — hero</p>
          <p className="display-showcase">Display showcase — projector scale</p>
          <h3 className="heading text-xl">Heading — sans 600</h3>
          <p className="max-w-2xl leading-relaxed">
            Body copy at 15px. Fief proves provenance, not profitability.
          </p>
          <p className="tnum font-mono text-sm">tabular numerals 0123456789 · 1,204 · 99.96%</p>
        </div>
      </Section>

      <Section
        title="Status pill — all states"
        note="Redundant encoding: icon, text label, border style (solid vs dashed) and fill density. Never hue alone."
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status="accepted" size="sm" />
          <StatusPill status="accepted" size="md" />
          <StatusPill status="accepted" size="lg" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {REASONS.map((r) => (
            <StatusPill key={r} status="rejected" rejectReason={r} size="md" />
          ))}
        </div>
      </Section>

      <Section title="Hash primitives">
        <div className="flex flex-wrap items-center gap-6">
          <Hash value={MOCK_OWNER} label="owner" />
          <Hash value={green.txHash} label="transaction" href={green.chainScanUrl} />
          <Hash value={green.inputHash} label="input hash" full chars={64} />
        </div>
        <div className="border-border divide-border max-w-xl divide-y rounded-md border px-4 py-1">
          <HashRow label="TEE signer" value={green.teeSigner} />
          <HashRow label="Request hash" value={green.reqSha} hint="sealed — hash only" />
        </div>
      </Section>

      <Section title="Verify command">
        <VerifyCommand txHash={green.txHash} className="max-w-xl" />
      </Section>

      <Section
        title="Honest status badge"
        note="Reads its own provenance. In mock mode it refuses to claim live mainnet activity. No percentage — v1.1 Q1 replaced the fraction with a verified state."
      >
        <div className="flex flex-wrap gap-3">
          <HonestStatusBadge decisions={2400} />
        </div>
      </Section>

      <Section
        title="Decision receipt — showcase variant"
        note="The headline artifact. Green accepted beside red rejected, same submission, one tampered byte."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <DecisionReceipt entry={green} variant="showcase" />
          <DecisionReceipt entry={red} variant="showcase" />
        </div>
      </Section>

      <Section title="Decision receipt — full variant">
        <div className="grid gap-4 lg:grid-cols-2">
          <DecisionReceipt entry={green} />
          <DecisionReceipt entry={red} />
        </div>
      </Section>

      <Section
        title="Decision receipt — compact rows"
        note="Fixed row height for virtualization. An agent's ledger is accepted-only (v1.1 Q1); the tamper-test rows below are shown together with it only here, so the left-rule non-colour cue stays reviewable."
      >
        <div className="border-border-strong overflow-hidden rounded-md border">
          <LedgerHeader />
          {ledger.map((e) => (
            <DecisionReceiptRow key={e.txHash} entry={e} tokenId="2" />
          ))}
          {tamperTests.map((e) => (
            <DecisionReceiptRow key={e.txHash} entry={e} tokenId="2" />
          ))}
        </div>
      </Section>

      <Section
        title="P&L context"
        note="D16 — renders null when an agent has no series, so no hollow box appears on every agent page. The series below is explicitly synthetic."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <PnlContext agent={illustrativeAgent} />
        </div>
        <p className="text-muted-foreground text-xs">
          illustrative sample — not agent data
        </p>
      </Section>

      <Section title="States">
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyState
            title="No decisions recorded yet"
            description="This agent has been minted and sealed, but its operator has not appended any entries."
            action={<Button size="sm" variant="outline">Browse agents</Button>}
          />
          <ErrorState description="Could not reach the indexer. The chain remains the source of truth — try the verify command." />
        </div>
        <LedgerSkeleton rows={5} />
        <CardGridSkeleton cards={3} />
      </Section>
    </main>
  );
}
