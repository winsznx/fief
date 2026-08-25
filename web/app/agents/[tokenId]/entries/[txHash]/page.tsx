import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntryDetail } from '@/components/fief/entry-detail';
import { Button } from '@/components/ui/button';
import { resolveEntry } from '@/lib/data/resolve-entry';

/**
 * Standalone entry page — rendered on hard navigation or a shared link (D9).
 *
 * This is the surface an auditor or judge lands on when someone sends them
 * "here is the entry, verify it yourself", which is the core interaction of the
 * product and the reason the sheet is not URL-less.
 *
 * Resolution (including the agent-membership check) is shared with the
 * intercepting sheet via `resolveEntry`, so both render identically.
 */

export async function generateMetadata({
  params,
}: PageProps<'/agents/[tokenId]/entries/[txHash]'>): Promise<Metadata> {
  const { tokenId, txHash } = await params;
  const found = await resolveEntry(tokenId, txHash);
  if (!found) return { title: 'Entry not found' };

  const { agent, entry } = found;
  return {
    title:
      entry.state === 'invalid'
        ? `${agent.name} · tamper test`
        : `${agent.name} · slot ${entry.slot}`,
    description:
      entry.status === 'accepted' && entry.decision !== undefined
        ? `Revealed decision ${entry.decision.dir} on 0G, verified byte-exact against the agent's sealed strategy commitment.`
        : entry.status === 'accepted'
          ? `Slot ${entry.slot} committed on 0G — sealed until its disclosure window opens.`
          : `Rejected reveal (${entry.rejectReason}) on 0G — a deliberate tamper test, not part of any record.`,
  };
}

export default async function EntryPage({
  params,
}: PageProps<'/agents/[tokenId]/entries/[txHash]'>) {
  const { tokenId, txHash } = await params;
  const found = await resolveEntry(tokenId, txHash);
  if (!found) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <EntryDetail entry={found.entry} agent={found.agent} />
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href={`/agents/${found.agent.tokenId}`}>Back to the full ledger</Link>
      </Button>
    </main>
  );
}
