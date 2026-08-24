import { AlertTriangle, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { APPROVED, LIMITS } from '@/lib/copy';
import { zeroGMainnet } from '@/lib/chain/zerog';

export const metadata: Metadata = {
  title: 'About & limits',
  description:
    'What Fief proves, what it does not, and the residual risks — stated plainly.',
};

/** Mirrors PRD §19 non-goals. */
const NON_GOALS = [
  'No custody or execution of renter funds.',
  'No claim of alpha or profit-and-loss verification. Provenance only.',
  'No token, no governance, no royalties.',
  'No TeeTLS providers — in those the model is not inside the TEE.',
  'No ZKML or OPML claims.',
  'No multi-chain.',
];

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">About &amp; security</p>
        <h1 className="display">What we claim, and what we don&rsquo;t.</h1>
        <p className="text-muted-foreground leading-relaxed">
          Fief states only what is proven. Where a guarantee stops, we say so on this page rather
          than in a footnote — including the one meaningful gap in the current construction and the
          remedy that ships with it.
        </p>
      </header>

      {/* ── Proven ─────────────────────────────────────────────────────── */}
      <Section icon={ShieldCheck} title="What is proven">
        <ul className="flex flex-col gap-2">
          <Item>{APPROVED.sealed}.</Item>
          <Item>{APPROVED.attested}.</Item>
          <Item>{APPROVED.audit}.</Item>
          <Item>
            Each accepted entry {APPROVED.verified} — the signature is recovered on-chain to the TEE
            signer registered in 0G&rsquo;s inference serving contract.
          </Item>
          <Item>
            Nonces are strictly increasing per token and epoch, so a receipt cannot be replayed.
          </Item>
          <Item>
            The record is append-only. Rental, transfer and reseal never mutate an existing entry.
          </Item>
        </ul>
      </Section>

      {/* ── The limit ──────────────────────────────────────────────────── */}
      <Section icon={AlertTriangle} title="The response-side declaration limit">
        <p className="text-muted-foreground leading-relaxed">{LIMITS.responseSideDeclaration}</p>
        <div
          id="audit"
          className="border-border-strong mt-2 flex scroll-mt-24 flex-col gap-3 rounded-lg border p-5"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <KeyRound className="size-4 shrink-0" aria-hidden />
            Authorized request audit
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A prospective buyer or auditor granted access receives the sealed key, recomputes the
            request hash for any past entry, and confirms it equals the value recorded on-chain and
            that the body embeds the committed strategy. Verification without public disclosure —
            which turns pre-purchase due diligence into a feature rather than a promise.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A zero-knowledge prefix opening — proving the request begins with the commitment without
            revealing the strategy — is a candidate extension, not a shipped claim.
          </p>
        </div>
      </Section>

      {/* ── Stricter than the reference ───────────────────────────────── */}
      <Section icon={Lock} title="Stricter than the reference client">
        <p className="text-muted-foreground leading-relaxed">
          0G&rsquo;s own SDK does not recompute the hashes: it trusts the signed text the provider
          returns and only recovers a signer from it. Fief recomputes the response hash on-chain and
          rebuilds that text from the actual request and response bytes before recovery. A provider
          returning text that does not match the real bytes passes the reference client and fails
          here.
        </p>
      </Section>

      {/* ── Residual risks ───────────────────────────────────────────── */}
      <Section icon={AlertTriangle} title="Residual risks, not denied">
        <ul className="flex flex-col gap-2">
          <Item>{LIMITS.strategyDistillation}</Item>
          <Item>
            The ERC-7857 reference verifier this build forks is permissive: mint and update accept
            any 32-byte hash, and transfer validity checks only a receiver signature plus a replay
            nonce. Fief claims no cryptographic mint or transfer security from it. Record integrity
            is independent — the ledger is keyed by token and is untouched by transfer.
          </Item>
          <Item>
            An operator key compromise would let an attacker append junk entries until the key is
            rotated. Rotation does not affect the epoch, and entries carry the signer that produced
            them.
          </Item>
        </ul>
      </Section>

      {/* ── Non-goals ────────────────────────────────────────────────── */}
      <Section title="Non-goals">
        <ul className="flex flex-col gap-2">
          {NON_GOALS.map((g) => (
            <Item key={g}>{g}</Item>
          ))}
        </ul>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {LIMITS.noCustody} {LIMITS.provenanceNotAlpha}
        </p>
      </Section>

      {/* ── Network ──────────────────────────────────────────────────── */}
      <Section title="Network">
        <dl className="border-border divide-border divide-y border-t text-sm">
          <Row label="Chain" value={`${zeroGMainnet.name} · ${zeroGMainnet.id}`} />
          <Row label="RPC" value={zeroGMainnet.rpcUrls.default.http[0]} />
          <Row label="Explorer" value={zeroGMainnet.blockExplorers.default.url} />
        </dl>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/proof">See the proof</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/verify">Verify a transaction</Link>
        </Button>
      </div>
    </main>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon?: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        {Icon ? <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-muted-foreground flex gap-2 text-sm leading-relaxed">
      <span aria-hidden className="select-none">
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum font-mono text-xs break-all">{value}</dd>
    </div>
  );
}
