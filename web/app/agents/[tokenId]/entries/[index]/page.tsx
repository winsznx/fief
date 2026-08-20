import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntryDetail } from '@/components/fief/entry-detail';
import { Button } from '@/components/ui/button';
import { getDataSource } from '@/lib/data/source';

/**
 * Standalone entry page — rendered on hard navigation or a shared link (D9).
 *
 * This is the surface an auditor or judge lands on when someone sends them
 * "here is the entry, verify it yourself", which is the core interaction of the
 * product and the reason the sheet is not URL-less.
 */

function parseIndex(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export async function generateMetadata({
  params,
}: PageProps<'/agents/[tokenId]/entries/[index]'>): Promise<Metadata> {
  const { tokenId, index } = await params;
  const i = parseIndex(index);
  if (i === null) return { title: 'Entry not found' };
  const [agent, entry] = await Promise.all([
    getDataSource().getAgent(tokenId),
    getDataSource().getEntry(tokenId, i),
  ]);
  if (!agent || !entry) return { title: 'Entry not found' };
  return {
    title: `${agent.name} · entry #${entry.index}`,
    description:
      entry.status === 'accepted'
        ? `Accepted decision ${entry.decision.dir} recorded on 0G, verified against the agent's sealed strategy commitment.`
        : `Rejected submission (${entry.rejectReason}) on 0G.`,
  };
}

export default async function EntryPage({
  params,
}: PageProps<'/agents/[tokenId]/entries/[index]'>) {
  const { tokenId, index } = await params;
  const i = parseIndex(index);
  if (i === null) notFound();

  const ds = getDataSource();
  const [agent, entry] = await Promise.all([ds.getAgent(tokenId), ds.getEntry(tokenId, i)]);
  if (!agent || !entry) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <EntryDetail entry={entry} agent={agent} />
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href={`/agents/${agent.tokenId}`}>Back to the full ledger</Link>
      </Button>
    </main>
  );
}
