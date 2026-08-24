export type DecisionStatus = 'accepted' | 'rejected';
export type Direction = 'UP' | 'DOWN' | 'FLAT';
export type RejectReason =
  | 'BadSigner' | 'BadNonce' | 'BadEpoch' | 'BadCommit' | 'BadHash' | 'NotOperator' | 'BadAnchor';

export interface Decision { dir: Direction; conf: number; size: number } // conf,size in 0..1

export interface DecisionEntry {
  // v1.1 (Q1) — on-chain `entries[]` is ACCEPTED-ONLY: a rejected submission
  // reverts, or emits a DecisionRejected event, and is never appended. So a
  // rejected entry has no array index at all, hence null. Detail and deep-link
  // routes therefore key on `txHash`, never on this.
  entryIndex: number | null;
  status: DecisionStatus;      // green | red
  rejectReason?: RejectReason; // present iff status==='rejected'
  // v1.1 (Q1) — a red entry is a DELIBERATE tamper demo, not a failed decision
  // by the agent. Flagged so no surface can present it as part of a record.
  isTamperTest?: boolean;
  decision: Decision;          // parsed from the signed response content
  nonce: number;
  epoch: number;
  reqSha: `0x${string}`;       // 32-byte hash (request body; sealed — hash only)
  respSha: `0x${string}`;      // 32-byte hash (signed response bytes)
  teeSigner: `0x${string}`;    // 20-byte address (recovered TEE signer)
  provider: `0x${string}`;     // 20-byte 0G Compute provider address
  inputHash: `0x${string}`;    // 32-byte sha256 of the market snapshot
  renter: `0x${string}`;       // 20-byte; zero address if none
  txHash: `0x${string}`;
  chainScanUrl: string;        // https://chainscan.0g.ai/tx/<txHash>
  blockTime: string;           // ISO 8601

  // ── v1.1 [10] ──────────────────────────────────────────────────────────
  // respData is PUBLIC BY DESIGN (PRD §4.1: "respData is small, public by
  // design (it is the decision), submitted in calldata"). Required by
  // <ByteDiffReveal> on /proof and by the receipt's "which byte failed"
  // explanation. Optional so LiveDataSource may omit it.
  respData?: string;           // utf-8 of the provider's OpenAI JSON envelope
  commitOffset?: number;       // byte index of the `"content":"` anchor
}

export interface Agent {
  tokenId: string;
  name: string;
  owner: `0x${string}`;
  operator: `0x${string}`;     // runtime EOA allowed to append entries
  epoch: number;
  strategyHash: `0x${string}`; // H — public commitment; the strategy itself is sealed
  storageRoot: `0x${string}`;  // 0G Storage merkle root of the AES-256-GCM blob
  network: 'mainnet' | 'testnet';
  domain: string;              // e.g. "BTC short-horizon direction"
  decisionCount: number;       // v1.1 (Q1) — accepted, stored entries only
  /**
   * v1.1 (Q1) — badge only: every stored entry passed the on-chain check by
   * invariant I1, so a fraction is either always 100% or actively misleading.
   *
   * Deliberately the LITERAL `true`, not `boolean` (D15): a percentage cannot
   * be derived from `true`, so the type itself forbids a later "nicety" from
   * reintroducing a fraction. If this ever needs to be false, the honest change
   * is a new field describing what failed — not a ratio.
   */
  verified: true;
  createdAt: string;
  pnlContext?: {               // context only — NEVER labeled as verified
    window: string;
    note: string;
    series?: { t: string; v: number }[];
  };

  // ── v1.1 [3] ───────────────────────────────────────────────────────────
  // PRD §6 agent state machine. Drives §5.3 marketplace filters and the
  // §5.7 console's per-agent available actions.
  lifecycle: AgentLifecycle;
}

export interface Listing {
  tokenId: string;
  feePerDecisionWei: string;   // bigint serialized as string
  minEscrowWei: string;
  active: boolean;

  // ── v1.1 [4] / Q3 ─────────────────────────────────────────────────────
  // Rental duration. At rent: expiry = now + termSeconds, and
  // maxDecisions = floor(escrow / feePerDecisionWei) — DERIVED at rent time
  // from the escrow the renter actually posts, so it is deliberately not a
  // field here (PRD §5 RentalDesk.list(tokenId, fee, minEscrow, termSeconds)).
  termSeconds: number;
}

export interface Grant {
  tokenId: string;
  renter: `0x${string}`;
  expiry: string;              // ISO
  maxDecisions: number;
  remainingEscrowWei: string;
  status: 'active' | 'expired' | 'revoked';

  // ── v1.1 [5] ───────────────────────────────────────────────────────────
  // §5.6 requires "remaining decisions". Not derivable from maxDecisions
  // alone — consumption was unrepresented.
  decisionsUsed: number;
}

export interface RenterFeedMessage {
  entryIndex: number;          // links to the on-chain DecisionEntry
  tokenId: string;
  decision: Decision;
  at: string;                  // ISO
  txHash: `0x${string}`;
}

export interface VerifyCheck { name: string; pass: boolean; detail?: string }
export interface VerifyResult {
  txHash: `0x${string}`;
  network: 'mainnet' | 'testnet';
  checks: VerifyCheck[];       // e.g. "signer matches getService().teeSignerAddress", "commit matches", "nonce fresh"
  entry?: DecisionEntry;

  // ── v1.1 [12] ──────────────────────────────────────────────────────────
  // Replaces the previous `ok: boolean`, which was redundant (ok === valid) and
  // could not express four states: §5.8 needs `not_found` and `error` to be
  // distinguishable, and they previously collapsed into ok:false.
  outcome: VerifyOutcome;
  /** v1.1 — present iff outcome === 'error'. */
  error?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DataSource v1.1 — additive extension (frontend, 2026-08-20)
   ═══════════════════════════════════════════════════════════════════════════
   Rationale: handoff §5.6 and §5.7 are not buildable against v1.0, which
   exposed exactly one mutation (`rent`) and no types for settlement, audit
   grants, grant consumption, rent terms, single-entry lookup or pagination.

   Contract for @winsznx: NO existing field, method or signature is modified
   or removed. Every addition is either a new type, a new method, a new
   required field on a mock-only shape, or an optional parameter. Each item is
   numbered and carries the handoff/PRD reference that justifies it, so it can
   be accepted or trimmed individually before LiveDataSource is written.
   ═══════════════════════════════════════════════════════════════════════════ */

/** v1.1 [3] — PRD §6 agent state machine. */
export type AgentLifecycle =
  | 'sealed'     // blob on 0G Storage, H fixed, not yet minted
  | 'minted'     // ERC-7857 token exists
  | 'active'     // operator set, appending entries
  | 'listed'     // available to rent
  | 'rented'     // >=1 active grant
  | 'retired';   // operator stopped; record remains readable forever

/** v1.1 [2] — §5.4 "showing X of N" + infinite scroll. */
export interface EntriesPage {
  items: DecisionEntry[];
  nextCursor: number | null;
  total: number;
}

/** v1.1 [6] — §5.7 "settlement view (per-entry, per-renter)". Protocol fee is 200 bps (PRD §13). */
export interface Settlement {
  tokenId: string;
  entryIndex: number;
  renter: `0x${string}`;
  feeWei: string;
  protocolFeeWei: string;
  netToOwnerWei: string;
  settled: boolean;
  txHash?: `0x${string}`;
}

/** v1.1 [7] — §5.7 audit-grant management; the PRD §4.1 remedy-1 surface. */
export interface AuditGrant {
  tokenId: string;
  auditor: `0x${string}`;
  grantedAt: string;
  status: 'pending' | 'active' | 'revoked';
}

/** v1.1 [8] — §5.6 needs a feed connection state, not just messages. */
export type FeedStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** v1.1 [9] — uniform envelope for every stubbed write. */
export interface TxResult {
  ok: boolean;
  txHash?: `0x${string}`;
  chainScanUrl?: string;
  error?: string;
}

/**
 * v1.1 [12] — §5.8 distinct result states.
 *
 * Note the snake_case `not_found`: it is the ratified spelling in the handoff
 * §7 contract, so the wire shape matches what LiveDataSource will return.
 */
export type VerifyOutcome = 'valid' | 'tampered' | 'not_found' | 'error';

/** v1.1 [13] — §5.1 / §5.2 canonical demo pair. */
export interface ShowcasePair {
  green: DecisionEntry;
  red: DecisionEntry;
  /**
   * Attribution for the GREEN entry only — it is a real accepted ledger entry
   * and belongs to an agent's record.
   *
   * Optional (D14) because the red half is a tamper test with no agent and no
   * entryIndex, so the pair as a whole cannot be attributed to one record. In
   * live mode the pair is resolved from NEXT_PUBLIC_GREEN_TX / _RED_TX, where
   * the token may not be known at all.
   */
  tokenId?: string;
}

/** v1.1 [11] — §5.7 mint/seal form payload. */
export interface MintInput {
  name: string;
  domain: string;
  /** Canonical strategy JSON. Hashed to H client-side in mock; never transmitted in live. */
  strategyJson: string;
  operator: `0x${string}`;
}

/** v1.1 [11] — §5.7 reseal payload (epoch++). */
export interface ResealInput {
  strategyJson: string;
}

/** v1.1 [11] — §5.7 list/unlist payload. */
export interface ListingInput {
  feePerDecisionWei: string;
  minEscrowWei: string;
  /** v1.1 Q3 — rental duration. maxDecisions is derived at rent time, not set here. */
  termSeconds: number;
  active: boolean;
}

export interface DataSource {
  listAgents(): Promise<Agent[]>;
  getAgent(tokenId: string): Promise<Agent | null>;
  /** v1.1 (Q1) — accepted entries only. Rejected submissions are never stored. */
  getEntries(tokenId: string, opts?: { limit?: number; cursor?: number }): Promise<DecisionEntry[]>;
  getListing(tokenId: string): Promise<Listing | null>;
  getAgentsForOwner(address: `0x${string}`): Promise<Agent[]>;
  getGrantsForRenter(address: `0x${string}`): Promise<Grant[]>;
  subscribeRenterFeed(tokenId: string, onMessage: (m: RenterFeedMessage) => void): () => void; // returns unsubscribe
  verifyTx(txHash: string): Promise<VerifyResult>;
  // stubbed mutations (mock returns optimistic results; owner wires wallet writes later):
  rent(tokenId: string, escrowWei: string): Promise<Grant>;

  // ── v1.1 additions ─────────────────────────────────────────────────────
  /**
   * [1] §5.4 row → detail, keyed on txHash (v1.1 Q1).
   *
   * Not (tokenId, index): a rejected entry has no index, and the tx hash is the
   * only identifier that is stable across accepted entries, tamper tests and a
   * link someone pastes to an auditor.
   */
  getEntry(txHash: string): Promise<DecisionEntry | null>;
  /** [2] paginated form of getEntries. Accepted-only, same as getEntries. */
  getEntriesPage(tokenId: string, opts?: { limit?: number; cursor?: number }): Promise<EntriesPage>;

  /** [6] §5.7 settlement view. */
  getSettlements(tokenId: string): Promise<Settlement[]>;
  /** [7] §5.7 audit-grant management. */
  getAuditGrants(tokenId: string): Promise<AuditGrant[]>;
  /**
   * [13] The canonical green/red pair for §5.1 and §5.2.
   *
   * Exists so the landing and proof pages read through the DataSource rather
   * than importing fixtures directly — otherwise they would not switch over
   * when LiveDataSource lands. In live mode this resolves the two configured
   * transaction hashes NEXT_PUBLIC_GREEN_TX / NEXT_PUBLIC_RED_TX (v1.1 Q4), so
   * pinning the demo pair at P4 needs no frontend change.
   */
  getShowcasePair(): Promise<ShowcasePair | null>;
  /** [8] optional status callback — additive, existing 2-arg calls still compile. */
  subscribeRenterFeedWithStatus(
    tokenId: string,
    onMessage: (m: RenterFeedMessage) => void,
    onStatus?: (s: FeedStatus) => void,
  ): () => void;

  // [11] stubbed mutations — mock returns optimistic TxResult; owner wires wallet writes.
  mintAgent(input: MintInput): Promise<
    TxResult & { tokenId?: string; strategyHash?: `0x${string}`; storageRoot?: `0x${string}` }
  >;
  setOperator(tokenId: string, operator: `0x${string}`): Promise<TxResult>;
  reseal(tokenId: string, input: ResealInput): Promise<
    TxResult & { epoch?: number; strategyHash?: `0x${string}`; storageRoot?: `0x${string}` }
  >;
  setListing(tokenId: string, input: ListingInput): Promise<TxResult>;
  settle(tokenId: string, entryIndices: number[]): Promise<TxResult>;
  grantAudit(tokenId: string, auditor: `0x${string}`): Promise<TxResult>;
  revokeAudit(tokenId: string, auditor: `0x${string}`): Promise<TxResult>;
}
