import { ArrowRight, Cpu, Link2, PenLine } from 'lucide-react';
import Link from 'next/link';
import { AgentCard } from '@/components/fief/agent-card';
import { ByteDiffReveal } from '@/components/fief/byte-diff-reveal';
import { DecisionReceipt } from '@/components/fief/decision-receipt';
import { VerifyCommand } from '@/components/fief/verify-command';
import { Button } from '@/components/ui/button';
import { APPROVED } from '@/lib/copy';
import { getDataSource } from '@/lib/data/source';
import { asSentence, formatCount } from '@/lib/format';

/**
 * Landing page.
 *
 * Six sections, each with ONE dominant element:
 *
 *   1 Hero          the headline
 *   2 Proof strip   the three counts
 *   3 Proof panel   the byte diff            <- the anchor of the whole page
 *   4 How it works  the three steps
 *   5 Agents        the cadence charts
 *   6 Close         the single remaining call to action
 *
 * Rhythm is `py-section` (112px) between these, `gap-group` (64px) between
 * groups inside one, `gap-item` (24px) within a group. Nothing is spaced by
 * eye — the previous page mixed py-4, py-12, py-14 and a bare mt-16, which is
 * why it had voids in some joins and collisions in others.
 *
 * Things deliberately deleted rather than restyled:
 *
 *   The second CTA pair. "Browse agents / See the proof" appeared in the hero and
 *   again lower down with almost no new content between them, so the repeat read
 *   as a rendering mistake. There is now exactly one primary pair, in the hero,
 *   and one closing action at the end.
 *
 *   The orphaned keyword strip. Four uppercase properties floated in their own
 *   band with large padding and no container, belonging to nothing. They are now
 *   the label row of the proof strip, where they caption real numbers.
 *
 *   The <SealMark> centrepiece. A 232px arrangement of concentric circles is
 *   decoration standing in for a product shot. The hero now shows an actual
 *   accepted record instead — real fixture data, the literal thing being sold.
 */

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

  // v1.1 Q1 removed the aggregate percentage. A weighted "provenance-verified %"
  // could only ever be 100 (every stored entry passed the on-chain check by
  // invariant I1), so it was a number that looked like evidence while carrying
  // none. Counts are what actually vary.
  const totalDecisions = agents.reduce((sum, a) => sum + a.decisionCount, 0);
  const withRecord = agents.filter((a) => a.decisionCount > 0).length;

  const featured = agents.filter((a) => a.decisionCount > 0).slice(0, 3);
  const featuredEntries = await Promise.all(
    featured.map((a) => ds.getEntries(a.tokenId, { limit: 200 })),
  );

  return (
    <main className="flex w-full flex-col">
      {/* ── 1. Hero — the headline dominates ─────────────────────────────── */}
      {/* Left-aligned and asymmetric: text in seven columns, the artifact in
          five. Everything was previously centre-stacked, which gave the hero no
          direction and left the visual sitting on top of the headline like a
          logo. */}
      <section className="container-page px-4 pt-group pb-section sm:px-6">
        <div className="grid items-center gap-group lg:grid-cols-12">
          <div className="flex flex-col items-start gap-item lg:col-span-7">
            <p className="eyebrow">AI × onchain marketplace on 0G</p>

            {/* Two-tone: the offer at full strength, the claim it rests on
                stepped back. One sentence, two weights of attention. */}
            <h1 className="display-hero max-w-[18ch]">
              Rent a trading agent{' '}
              <span className="text-foreground/45">that can prove its own record.</span>
            </h1>

            <p className="page-lede max-w-[52ch]">
              Every decision is signed inside a TEE by 0G Compute, hash-committed, and appended
              on-chain — so a track record cannot be edited after the fact. The record travels with
              the token when the agent is rented or sold.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg">
                <Link href="/agents">
                  Browse agents
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/proof">See the proof</Link>
              </Button>
            </div>
          </div>

          {/* The product's actual output, as the hero visual. */}
          {pair ? (
            <div className="w-full lg:col-span-5">
              <DecisionReceipt entry={pair.green} hashes="collapsed" />
            </div>
          ) : null}
        </div>
      </section>

      {/* ── 2. Proof strip — the counts dominate ─────────────────────────── */}
      {/* One thin band, three figures, and the four properties as their caption
          row. Replaces two former sections: a floating keyword strip and a
          three-card stat grid that sat two screens further down. */}
      <section className="container-page px-4 sm:px-6">
        <div className="surface-flat grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 [&>*]:border-border">
          <StripCell
            value={formatCount(totalDecisions)}
            label="Accepted decisions"
            hint="Each bound to a sealed strategy"
          />
          <StripCell
            value={formatCount(withRecord)}
            label="Agents with a record"
            hint="At least one accepted entry"
          />
          <StripCell
            value={formatCount(agents.length)}
            label="Agents minted"
            hint="Listed, rented and retired"
          />
        </div>
        <ul className="text-muted-foreground/70 mt-item flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.625rem] font-medium tracking-[0.18em] uppercase">
          {['Sealed strategy', 'TEE-signed decisions', 'Append-only record', 'Independently verifiable'].map(
            (chip, i) => (
              <li key={chip} className="flex items-center gap-5">
                {i > 0 ? (
                  <span aria-hidden className="bg-muted-foreground/30 size-[3px] rounded-full" />
                ) : null}
                {chip}
              </li>
            ),
          )}
        </ul>
      </section>

      {/* ── 3. Proof panel — the byte diff dominates ─────────────────────── */}
      {pair ? (
        <section className="container-page px-4 py-section sm:px-6">
          <div className="flex flex-col gap-group">
            <div className="flex max-w-[60ch] flex-col gap-item">
              <p className="eyebrow">The same submission, one changed byte</p>
              <h2 className="display">
                One was accepted.{' '}
                <span className="text-foreground/45">One was rejected on-chain.</span>
              </h2>
              <p className="page-lede">
                Both are real transactions on 0G. The left is a decision from a live 0G Compute
                inference. The right is the identical submission with a single tampered byte — the
                contract refused it.
              </p>
            </div>

            <ByteDiffReveal green={pair.green} red={pair.red} />

            {/* Outcomes second: the badge and the verdict, with the hashes one
                click away rather than twelve rows of hex at equal weight. */}
            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              <DecisionReceipt
                entry={pair.green}
                variant="showcase"
                hashes="collapsed"
                className="h-full"
              />
              <DecisionReceipt
                entry={pair.red}
                variant="showcase"
                hashes="collapsed"
                className="h-full"
                footer={
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    This transaction is a <strong className="font-semibold">tamper test</strong>. It
                    was refused on-chain, so it has no entry index and appears in no agent&rsquo;s
                    record.
                  </p>
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 4. How it works — the three steps dominate ───────────────────── */}
      <section className="container-page px-4 pb-section sm:px-6">
        <div className="flex flex-col gap-group">
          <div className="flex max-w-[60ch] flex-col gap-item">
            <p className="eyebrow">How it works</p>
            <h2 className="display">
              Three steps,{' '}
              <span className="text-foreground/45">none of which you have to trust us on.</span>
            </h2>
          </div>

          <ol className="grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="border-border text-muted-foreground tnum flex size-7 shrink-0 items-center justify-center rounded-sm border font-mono text-xs">
                    {i + 1}
                  </span>
                  <step.icon className="text-muted-foreground size-4" aria-hidden />
                  <h3 className="heading text-[0.9375rem]">{step.title}</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 5. Agents — the charts dominate ──────────────────────────────── */}
      {featured.length > 0 ? (
        <section className="container-page px-4 pb-section sm:px-6">
          <div className="flex flex-col gap-group">
            <div className="flex flex-wrap items-end justify-between gap-item">
              <div className="flex max-w-[60ch] flex-col gap-item">
                <p className="eyebrow">Agents</p>
                <h2 className="display">
                  Records <span className="text-foreground/45">you can check.</span>
                </h2>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/agents">
                  All agents
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </div>

            <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((agent, i) => (
                <AgentCard key={agent.tokenId} agent={agent} entries={featuredEntries[i]} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 6. Close — one action, plus the self-audit path ──────────────── */}
      <section className="container-page px-4 pb-section sm:px-6">
        <div className="surface flex flex-col gap-group p-6 sm:p-8">
          <div className="flex flex-col gap-item">
            <p className="eyebrow">What is and isn&rsquo;t proven</p>
            <h2 className="display max-w-[24ch]">
              Fief proves provenance, <span className="text-foreground/45">not profit.</span>
            </h2>
            <ul className="text-muted-foreground flex max-w-[68ch] flex-col gap-2 text-[0.8125rem] leading-relaxed">
              {[
                `${asSentence(APPROVED.sealed)}.`,
                `${asSentence(APPROVED.attested)}.`,
                `${asSentence(APPROVED.audit)}.`,
                'No custody and no execution of renter funds. Trade execution stays with the renter.',
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="bg-muted-foreground/40 mt-[0.5em] size-1 shrink-0 rounded-full"
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-item border-border border-t pt-6 lg:flex-row lg:items-end lg:justify-between">
            {/* For the technical buyer: the actual command, not a link to it. */}
            {pair ? (
              <VerifyCommand
                txHash={pair.green.txHash}
                label="Audit it yourself"
                className="min-w-0 lg:max-w-xl lg:flex-1"
              />
            ) : null}
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button asChild>
                <Link href="/agents">
                  Browse agents
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/about">Read the honest limits</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/** One cell of the proof strip. Figure first, caption under it. */
function StripCell({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-5">
      <span className="figure">{value}</span>
      <span className="text-[0.8125rem] font-medium">{label}</span>
      <span className="text-muted-foreground text-[0.6875rem]">{hint}</span>
    </div>
  );
}
