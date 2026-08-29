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
 * ship a URL that misattributes a record.
 *
 * The check used to re-look-up the slot via `getEntries({cursor: entry.slot})`,
 * on the v1 assumption that an entry's index in the ledger array equals its
 * slot. In v2 that is only true for an agent that has never missed a slot.
 * Agent 7 missed five, so every entry after the first gap resolved to the wrong
 * row and the agent page 404'd on links it had rendered itself. It also broke
 * any entry outside the agent's newest epoch, since the lookup always loaded
 * the current one.
 *
 * Ownership is now read off the entry, which carries the agent id decoded from
 * the log that produced it. Exact across every epoch, and one fewer chain load.
 *
 * A tamper test belongs to no ledger, so it stays exempt: it renders, clearly
 * labelled, rather than 404ing on a hand-built URL (D13).
 */
export async function resolveEntry(
  tokenId: string,
  rawTxHash: string,
): Promise<ResolvedEntry | null> {
  if (!isTxHash(rawTxHash)) return null;

  const ds = getDataSource();
  const [agent, entry] = await Promise.all([ds.getAgent(tokenId), ds.getEntry(rawTxHash)]);
  if (!agent || !entry) return null;

  // A tx hash from one agent must never render under another.
  if (entry.isTamperTest !== true && entry.agentId !== agent.tokenId) return null;

  return { agent, entry };
}
