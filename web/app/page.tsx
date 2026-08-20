import { ArrowRight, Cpu, Link2, PenLine } from 'lucide-react';
import Link from 'next/link';
import { ByteDiffReveal } from '@/components/fief/byte-diff-reveal';
import { ProvenanceSparkline } from '@/components/fief/charts';
import { DecisionReceipt } from '@/components/fief/decision-receipt';
import { HonestStatusBadge } from '@/components/fief/honest-status-badge';
import { Button } from '@/components/ui/button';
import { APPROVED } from '@/lib/copy';
import { getDataSource } from '@/lib/data/source';
import { formatCount, formatPct } from '@/lib/format';

const STEPS = [
  {
    icon: PenLine,
    title: 'Decide',
    body: 'The agent reads a canonical market snapshot and produces a direction call — UP, DOWN or FLAT with a confidence and a size hint.',
  },
  {
    icon: Cpu,
    title: 'Sign in the TEE',
    body: 'The decision comes back signed inside 0G Compute, over a hash of both the request and the response. The strategy that produced it never leaves the sealed environment.',
  },
  {
    icon: Link2,
    title: 'Record on-chain',
    body: 'The contract recomputes the hash, recovers the signer, and checks the commitment against the agent’s sealed strategy before appending the entry.',
  },
] as const;

export default async function Home() {
  const ds = getDataSource();
  const [pair, agents] = await Promise.all([ds.getShowcasePair(), ds.listAgents()]);

  const totalDecisions = agents.reduce((sum, a) => sum + a.decisionCount, 0);
  // Aggregate brain-bound is weighted by each agent's own entry total, so a
  // single deliberate tamper test cannot be hidden by averaging percentages.
  const weighted = agents.reduce(
    (acc, a) => {
      const total = a.brainBoundPct === 0 ? 0 : a.decisionCount / (a.brainBoundPct / 100);
      return { accepted: acc.accepted + a.decisionCount, total: acc.total + total };
    },
    { accepted: 0, total: 0 },
  );
  const aggregateBrainBound =
    weighted.total === 0 ? 100 : Math.round((weighted.accepted / weighted.total) * 10_000) / 100;

  const featured = agents.slice(0, 2);
  const featuredEntries = await Promise.all(
    featured.map((a) => ds.getEntries(a.tokenId, { limit: 40 })),
  );

  return (
    <main className="flex w-full flex-col">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 pt-14 pb-12">
        <p className="eyebrow">AI × onchain marketplace on 0G</p>

        <h1 className="display max-w-4xl">
          Rent or buy a trading agent whose track record is signed by its own sealed brain.
        </h1>

        <p className="text-muted-foreground max-w-3xl text-lg leading-relaxed">
          Every decision an agent makes comes back TEE-signed by 0G Compute, is{' '}
          {APPROVED.verified}, and lands in a record that travels with the token when the agent is
          rented or sold.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/agents">
              Browse agents
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/proof">How it&rsquo;s verified</Link>
          </Button>
          <HonestStatusBadge
            decisions={totalDecisions}
            brainBoundPct={aggregateBrainBound}
            className="ml-auto"
          />
        </div>
      </section>

      {/* ── The headline artifact ───────────────────────────────────────── */}
      {pair ? (
        <section className="border-border-strong border-y">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-12">
            <div className="mx-auto flex max-w-3xl flex-col gap-3 text-center">
              <p className="eyebrow mx-auto">The same submission, one changed byte</p>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                One was accepted. One was rejected on-chain.
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Both are real transactions on 0G. The left is a decision from a live 0G Compute
                inference. The right is the identical submission with a single tampered byte — the
                contract refused it.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DecisionReceipt entry={pair.green} variant="showcase" />
              <DecisionReceipt entry={pair.red} variant="showcase" />
            </div>

            <ByteDiffReveal
              green={pair.green}
              red={pair.red}
              className="mx-auto w-full max-w-4xl"
            />
          </div>
        </section>
      ) : null}

      {/* ── Counter ────────────────────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 py-12 sm:grid-cols-3">
        <Stat label="Brain-bound decisions" value={formatCount(totalDecisions)} />
        <Stat label="Provenance-verified" value={`${formatPct(aggregateBrainBound)}%`} />
        <Stat label="Listed agents" value={formatCount(agents.length)} />
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="border-border-strong border-t">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-14">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">How it works</p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Three steps, none of which you have to trust us on.
            </h2>
          </div>

          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="border-border-strong text-muted-foreground tnum flex size-7 shrink-0 items-center justify-center rounded-sm border font-mono text-xs">
                    {i + 1}
                  </span>
                  <step.icon className="text-muted-foreground size-4" aria-hidden />
                  <h3 className="font-semibold tracking-tight">{step.title}</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Featured agents ────────────────────────────────────────────── */}
      <section className="border-border-strong border-t">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-2">
              <p className="eyebrow">Agents</p>
              <h2 className="text-2xl font-semibold tracking-tight">Records you can check</h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/agents">
                All agents
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {featured.map((agent, i) => {
              const entries = featuredEntries[i];
              return (
                <Link
                  key={agent.tokenId}
                  href={`/agents/${agent.tokenId}`}
                  className="border-border-strong hover:bg-muted/40 focus-visible:ring-ring/60 flex flex-col gap-4 rounded-lg border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold tracking-tight">{agent.name}</h3>
                    <span className="tnum text-muted-foreground font-mono text-xs">
                      epoch {agent.epoch}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">{agent.domain}</p>
                  <ProvenanceSparkline entries={entries} />
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 font-mono text-xs">
                    <span className="tnum">{formatCount(agent.decisionCount)} decisions</span>
                    <span className="tnum">{formatPct(agent.brainBoundPct)}% brain-bound</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Honest status ──────────────────────────────────────────────── */}
      <section className="border-border-strong border-t">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-14">
          <p className="eyebrow">What is and isn&rsquo;t proven</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Fief proves provenance, not profit.
          </h2>
          <ul className="text-muted-foreground flex max-w-3xl flex-col gap-2 text-sm leading-relaxed">
            <li>· {APPROVED.sealed}.</li>
            <li>· {APPROVED.attested}.</li>
            <li>· {APPROVED.audit}.</li>
            <li>
              · No custody and no execution of renter funds. Trade execution stays with the renter.
            </li>
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/about">Read the honest limits</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/verify">Verify a transaction</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border-strong flex flex-col gap-1 rounded-lg border p-5">
      <span className="eyebrow">{label}</span>
      <span className="tnum font-mono text-3xl font-semibold tracking-tight">{value}</span>
    </div>
  );
}
