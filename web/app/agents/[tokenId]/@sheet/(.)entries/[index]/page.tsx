import { notFound } from 'next/navigation';
import { EntryDetail } from '@/components/fief/entry-detail';
import { EntrySheet } from '@/components/fief/entry-sheet';
import { getDataSource } from '@/lib/data/source';

/**
 * Intercepted entry route (D9).
 *
 * `(.)` matches segments at the same level; `@sheet` is a slot, not a segment,
 * so this intercepts /agents/[tokenId]/entries/[index] on client-side
 * navigation and renders it as a sheet over the ledger. A hard load falls
 * through to the standalone page in entries/[index]/page.tsx.
 */

function parseIndex(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export default async function InterceptedEntryPage({
  params,
}: PageProps<'/agents/[tokenId]/entries/[index]'>) {
  const { tokenId, index } = await params;
  const i = parseIndex(index);
  if (i === null) notFound();

  const ds = getDataSource();
  const [agent, entry] = await Promise.all([ds.getAgent(tokenId), ds.getEntry(tokenId, i)]);
  if (!agent || !entry) notFound();

  return (
    <EntrySheet>
      <EntryDetail entry={entry} agent={agent} />
    </EntrySheet>
  );
}
