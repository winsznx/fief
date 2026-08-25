import { CHAIN_SCAN_TX, isTxHash } from '@/lib/chain/zerog';
import { ZERO_ADDRESS } from './commit';
import {
  MOCK_OPERATOR,
  MOCK_RENTER,
  getAgents,
  getAuditGrants,
  getEntriesFor,
  getGrants,
  getListings,
  getRespDataFor,
  getSettlements,
  getShowcasePair,
  getTamperTests,
} from './fixtures';
import type {
  DataSource,
  DecisionEntry,
  EntriesPage,
  Grant,
  RenterFeedMessage,
  TxResult,
  VerifyCheck,
  VerifyResult,
} from './types';

export { GREEN_TX as MOCK_GREEN_TX, RED_TX as MOCK_RED_TX } from './fixtures';
export { MOCK_OWNER, MOCK_RENTER, MOCK_AUDITOR } from './fixtures';

function delay<T>(value: T, ms = 40): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Deterministic pseudo tx hash for optimistic mock mutation results. */
function stubTx(seed: string): `0x${string}` {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const unit = h.toString(16).padStart(8, '0');
  return `0x${unit.repeat(8)}`;
}

function ok(seed: string): TxResult {
  const txHash = stubTx(seed);
  return { ok: true, txHash, chainScanUrl: CHAIN_SCAN_TX(txHash) };
}

/** Attaches the public respData bytes an entry detail view needs. */
function withRespData(entry: DecisionEntry, tokenId?: string): DecisionEntry {
  // Always via getRespDataFor: it keeps the canonical green/red pair
  // byte-identical apart from the tampered byte, so /proof, /verify and the
  // entry detail route never disagree about the same transaction's bytes.
  return { ...entry, ...getRespDataFor(entry, tokenId) };
}

/**
 * Named checks in the order `RecordBook.revealDecision` performs them (PRD v2 §5).
 *
 * The order matters for the receipt UI: a viewer should see exactly which gate
 * the reveal fell at, and the contract short-circuits at the first failure.
 */
function checksFor(entry: DecisionEntry): VerifyCheck[] {
  const r = entry.rejectReason;
  return [
    {
      name: 'disclosure window has opened',
      pass: r !== 'RevealTooEarly',
      detail:
        r === 'RevealTooEarly'
          ? 'opened before the horizon — the signal still had value'
          : undefined,
    },
    {
      name: 'reveal opens the published commitment',
      pass: r !== 'BadReveal',
      detail:
        r === 'BadReveal'
          ? 'keccak(respData, sig, offset, inputHash, renter, salt) != receiptCommit'
          : undefined,
    },
    {
      name: 'sha256(respData) matches the committed hash',
      pass: r !== 'BadHash',
      detail: r === 'BadHash' ? 'response bytes do not hash to what was committed' : undefined,
    },
    {
      name: 'signer matches getService().teeSignerAddress',
      pass: r !== 'BadSigner',
      detail:
        r === 'BadSigner' ? 'recovered a key that is not the registered TEE signer' : undefined,
    },
    {
      name: 'commit line matches sealed strategy + epoch + slot',
      pass: r !== 'BadCommit',
      detail: r === 'BadCommit' ? 'one byte tampered — rejected on-chain' : undefined,
    },
  ];
}

/**
 * Resolves a tx hash across BOTH the accepted ledgers and the tamper tests.
 *
 * Tamper tests are searched too (D13) so a hand-crafted or shared URL renders
 * the receipt it names instead of 404ing — the /proof and /verify surfaces link
 * to them by hash. `tokenId` is undefined for a tamper test: it belongs to no
 * record.
 */
function findEntryByTx(txHash: string): { tokenId?: string; entry: DecisionEntry } | null {
  const needle = txHash.toLowerCase();

  for (const agent of getAgents()) {
    const found = getEntriesFor(agent.tokenId).find((e) => e.txHash.toLowerCase() === needle);
    if (found) return { tokenId: agent.tokenId, entry: found };
  }

  const tamper = getTamperTests().find((e) => e.txHash.toLowerCase() === needle);
  if (tamper) return { entry: tamper };

  return null;
}

export const mockDataSource: DataSource = {
  async listAgents() {
    return delay([...getAgents()]);
  },

  async getAgent(tokenId) {
    return delay(getAgents().find((a) => a.tokenId === tokenId) ?? null);
  },

  async getEntries(tokenId, opts) {
    // Already accepted-only in the fixture (v1.1 Q1). No filter is applied here
    // precisely so a rejected entry appearing in a ledger would be a fixture
    // bug rather than something silently hidden at the boundary; the invariant
    // is asserted in fixtures.test.ts.
    const all = getEntriesFor(tokenId);
    const cursor = opts?.cursor ?? 0;
    const limit = opts?.limit ?? 50;
    return delay(all.slice(cursor, cursor + limit));
  },

  async getEntriesPage(tokenId, opts): Promise<EntriesPage> {
    const all = getEntriesFor(tokenId);
    const cursor = opts?.cursor ?? 0;
    const limit = opts?.limit ?? 50;
    const items = all.slice(cursor, cursor + limit);
    const next = cursor + items.length;
    return delay({
      items,
      nextCursor: next < all.length ? next : null,
      total: all.length,
    });
  },

  async getEntry(txHash) {
    const hit = findEntryByTx(txHash);
    return delay(hit ? withRespData(hit.entry, hit.tokenId) : null);
  },

  async getListing(tokenId) {
    return delay(getListings().find((l) => l.tokenId === tokenId) ?? null);
  },

  async getAgentsForOwner(address) {
    const needle = address.toLowerCase();
    return delay(getAgents().filter((a) => a.owner.toLowerCase() === needle));
  },

  async getGrantsForRenter(address) {
    const needle = address.toLowerCase();
    return delay(getGrants().filter((g) => g.renter.toLowerCase() === needle));
  },

  async getSettlements(tokenId) {
    return delay(getSettlements(tokenId));
  },

  async getAuditGrants(tokenId) {
    return delay(getAuditGrants(tokenId));
  },

  async getShowcasePair() {
    const { green, red, agent } = getShowcasePair();
    return delay({ green, red, tokenId: agent.tokenId });
  },

  subscribeRenterFeed(tokenId, onMessage) {
    return this.subscribeRenterFeedWithStatus(tokenId, onMessage);
  },

  subscribeRenterFeedWithStatus(tokenId, onMessage, onStatus) {
    // The feed replays the agent's committed slots. A renter is notified of a
    // decision at COMMIT time, while the public chain still holds only the
    // sealed commitment — that window is what they are paying for (PRD v2 §4.2).
    // Only slots that actually carry a decision can be delivered.
    const deliverable = getEntriesFor(tokenId).filter(
      (e): e is DecisionEntry & { decision: NonNullable<DecisionEntry['decision']> } =>
        e.decision !== undefined,
    );
    let i = 0;
    let cancelled = false;

    // Deliberately NOT emitted synchronously: a synchronous status callback
    // during a subscriber's effect would be a synchronous setState in an
    // effect. Consumers initialise their own 'connecting' state on mount.
    const openTimer = setTimeout(() => {
      if (!cancelled) onStatus?.('open');
    }, 600);

    const timer = setInterval(() => {
      const e = deliverable[i % Math.max(deliverable.length, 1)];
      if (!e) return;
      const msg: RenterFeedMessage = {
        slot: e.slot,
        epoch: e.epoch,
        tokenId,
        decision: e.decision,
        at: new Date().toISOString(),
        commitTxHash: e.commitTxHash,
        ...(e.state === 'revealed' ? { revealTxHash: e.txHash } : {}),
      };
      onMessage(msg);
      i += 1;
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(openTimer);
      clearInterval(timer);
      onStatus?.('closed');
    };
  },

  async verifyTx(txHash) {
    const normalized = txHash.trim();

    if (!isTxHash(normalized)) {
      const bad: VerifyResult = {
        txHash: (normalized.startsWith('0x') ? normalized : `0x${normalized}`) as `0x${string}`,
        outcome: 'error',
        // v1.1: `error` is populated iff outcome === 'error', so the UI has a
        // message to show without mining it out of the checks array.
        error: 'expected 0x followed by 64 hex characters',
        network: 'mainnet',
        checks: [
          {
            name: 'input is a 32-byte transaction hash',
            pass: false,
            detail: 'expected 0x followed by 64 hex characters',
          },
        ],
      };
      return delay(bad);
    }

    const hit = findEntryByTx(normalized);
    if (!hit) {
      const missing: VerifyResult = {
        txHash: normalized as `0x${string}`,
        outcome: 'not_found',
        network: 'mainnet',
        checks: [
          { name: 'transaction found on 0G mainnet', pass: false, detail: 'no record entry at this hash' },
        ],
      };
      return delay(missing);
    }

    const entry = withRespData(hit.entry, hit.tokenId);
    return delay({
      txHash: entry.txHash,
      // 'tampered' rather than 'invalid': the transaction and its signature are
      // real, and what failed is the on-chain provenance check. Every red entry
      // reachable here is a deliberate tamper test (v1.1 Q1).
      outcome: entry.status === 'accepted' ? 'valid' : 'tampered',
      network: 'mainnet',
      entry,
      checks: checksFor(entry),
    } satisfies VerifyResult);
  },

  async rent(tokenId, escrowWei) {
    const listing = getListings().find((l) => l.tokenId === tokenId);
    // v1.1 Q3 — both terms are DERIVED at rent time, matching what
    // RentalDesk.rent computes on-chain:
    //   expiry       = block.timestamp + termSeconds
    //   maxDecisions = msg.value / feePerDecisionWei
    const termSeconds = listing?.termSeconds ?? 30 * 86_400;
    const fee = BigInt(listing?.feePerDecisionWei ?? '0');
    const escrow = BigInt(escrowWei);
    const maxDecisions = fee === 0n ? 0 : Number(escrow / fee);

    const grant: Grant = {
      tokenId,
      renter: MOCK_RENTER,
      expiry: new Date(Date.now() + termSeconds * 1000).toISOString(),
      maxDecisions,
      decisionsUsed: 0,
      remainingEscrowWei: escrowWei,
      status: 'active',
    };
    return delay(grant, 200);
  },

  // ── v1.1 stubbed mutations ───────────────────────────────────────────────
  // Optimistic results only. The owner replaces these with wallet writes; no
  // component depends on anything beyond the TxResult envelope.

  async mintAgent(input) {
    return delay(
      {
        ...ok(`mint:${input.name}`),
        tokenId: String(getAgents().length + 1),
        strategyHash: stubTx(`H:${input.strategyJson}`),
        storageRoot: stubTx(`root:${input.strategyJson}`),
      },
      320,
    );
  },

  async setOperator(tokenId, operator) {
    return delay(ok(`operator:${tokenId}:${operator}`), 220);
  },

  async reseal(tokenId, input) {
    const current = getAgents().find((a) => a.tokenId === tokenId);
    return delay(
      {
        ...ok(`reseal:${tokenId}`),
        epoch: (current?.epoch ?? 1) + 1,
        strategyHash: stubTx(`H:${input.strategyJson}`),
        storageRoot: stubTx(`root:${input.strategyJson}`),
      },
      320,
    );
  },

  async setListing(tokenId, input) {
    return delay(ok(`listing:${tokenId}:${input.active}`), 220);
  },

  async settle(tokenId, entryIndices) {
    if (entryIndices.length === 0) {
      return delay({ ok: false, error: 'select at least one entry to settle' }, 120);
    }
    return delay(ok(`settle:${tokenId}:${entryIndices.join(',')}`), 260);
  },

  async grantAudit(tokenId, auditor) {
    return delay(ok(`audit:${tokenId}:${auditor}`), 240);
  },

  async revokeAudit(tokenId, auditor) {
    return delay(ok(`revoke:${tokenId}:${auditor}`), 240);
  },
};

export const MOCK_DEFAULT_OPERATOR = MOCK_OPERATOR;
export const MOCK_ZERO_ADDRESS = ZERO_ADDRESS;
