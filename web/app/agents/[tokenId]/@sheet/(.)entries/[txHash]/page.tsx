import { notFound } from 'next/navigation';
import { EntryDetail } from '@/components/fief/entry-detail';
import { EntrySheet } from '@/components/fief/entry-sheet';
import { resolveEntry } from '@/lib/data/resolve-entry';

/**
 * Intercepted entry route (D9).
 *
 * `(.)` matches segments at the same level; `@sheet` is a slot, not a segment,
 * so this intercepts /agents/[tokenId]/entries/[txHash] on client-side
 * navigation and renders it as a sheet over the ledger. A hard load falls
 * through to the standalone page in entries/[txHash]/page.tsx.
 *
 * Resolution is shared with that page via `resolveEntry`, so a soft navigation
 * and a shared link can never disagree.
 */
export default async function InterceptedEntryPage({
  params,
}: PageProps<'/agents/[tokenId]/entries/[txHash]'>) {
  const { tokenId, txHash } = await params;
  const found = await resolveEntry(tokenId, txHash);
  if (!found) notFound();

  return (
    <EntrySheet>
      <EntryDetail entry={found.entry} agent={found.agent} />
    </EntrySheet>
  );
}
