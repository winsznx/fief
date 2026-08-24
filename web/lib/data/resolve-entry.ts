import { isTxHash } from '@/lib/chain/zerog';
import { getDataSource } from '@/lib/data/source';
import type { Agent, DecisionEntry } from '@/lib/data/types';

/**
 * Shared resolver for the entry detail route and its intercepting sheet.
 *
 * Both must agree exactly, or a soft navigation and a hard load of the same URL
 * would disagree about whether the entry exists — so the logic lives here
 * rather than being duplicated in two `page.tsx` files.
 *
 * Keyed on txHash (v1.1 Q1). The route stays nested under [tokenId] because the
 * intercepting sheet needs a parent segment to render into (D12); the tokenId is
 * breadcrumb context, while the txHash identifies the entry.
 */
export interface ResolvedEntry {
  agent: Agent;
  entry: DecisionEntry;
}

/**
 * Resolves the entry and confirms it really belongs to this agent.
 *
 * Without the membership check, /agents/2/entries/<an entry of agent 1> would
 * render agent 1's receipt under agent 2's name — a provenance product cannot
 * ship a URL that misattributes a record. The check costs one O(1) read,
 * because an accepted entry's `entryIndex` IS its position in that agent's
 * on-chain array.
 *
 * A tamper test (entryIndex null, v1.1 Q1) belongs to no ledger, so it is
 * exempt: it renders, clearly labelled, rather than 404ing on a hand-built URL
 * (D13). Nothing in the UI links here.
 */
export async function resolveEntry(
  tokenId: string,
  rawTxHash: string,
): Promise<ResolvedEntry | null> {
  if (!isTxHash(rawTxHash)) return null;

  const ds = getDataSource();
  const [agent, entry] = await Promise.all([ds.getAgent(tokenId), ds.getEntry(rawTxHash)]);
  if (!agent || !entry) return null;

  if (entry.entryIndex !== null) {
    const [atIndex] = await ds.getEntries(tokenId, { cursor: entry.entryIndex, limit: 1 });
    if (atIndex?.txHash.toLowerCase() !== entry.txHash.toLowerCase()) return null;
  }

  return { agent, entry };
}
