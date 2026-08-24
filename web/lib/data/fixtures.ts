/**
 * Deterministic mock fixtures.
 *
 * Every value is derived from a fixed seed via mulberry32, so screenshots,
 * the demo video and PR review captures are byte-stable across runs. Nothing
 * here uses Math.random() or Date.now() at module scope.
 *
 * ── v1.1 (Q1): ledgers are ACCEPTED-ONLY ──────────────────────────────────
 * On-chain, `entries[]` only ever holds accepted decisions — a rejected
 * submission reverts or emits a DecisionRejected event, so it has no array
 * index and is not part of any record. The fixture mirrors that exactly:
 *
 *   ledgers     accepted only, `entryIndex` contiguous from 0
 *   tamperTests a SEPARATE collection: entryIndex null, isTamperTest true,
 *               in no ledger, resolvable only by txHash
 *
 * Data shape rationale (plan T6):
 *   agent 1  2400 accepted                                      (flagship)
 *   agent 2  180 accepted                                       (mid-size)
 *   agent 3  1 entry                                            (edge case)
 *   agent 4  0 entries, retired                                 (empty ledger)
 *   agent 5  epoch 2, unlisted                                  (epoch boundary)
 *   tamperTests  all 7 RejectReasons, so every red receipt variant stays
 *                reachable from /design and /verify
 *
 * Entries are generated LAZILY and memoised: the generator is a few hundred
 * bytes of code in the client bundle, whereas eagerly-built arrays would
 * serialise ~1MB of JSON into it. `respData` is likewise synthesised on demand
 * (only the canonical green/red showcase pair carries it up front).
 */

import { CHAIN_SCAN_TX } from '@/lib/chain/zerog';
import { buildCommitLine, buildRespData, tamperStrategyByte, ZERO_ADDRESS } from './commit';
import type {
  Agent,
  AuditGrant,
  Decision,
  DecisionEntry,
  Direction,
  Grant,
  Listing,
  RejectReason,
  Settlement,
} from './types';

/* ── Fixed identities ─────────────────────────────────────────────────────── */

export const MOCK_OWNER = '0x8f3a1c9d2e4b70a6c5d8e1f0a2b3c4d5e6f70819' as const;
export const MOCK_OPERATOR = '0x2c4e6a8b0d1f3e5c7a9b1d3e5f708192a3b4c5d6' as const;
export const MOCK_RENTER = '0x3d5f7a9c1e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f' as const;
export const MOCK_AUDITOR = '0x6b1d9f3a7c5e2048b6d0f2a4c6e8b0d2f4a6c8e0' as const;
export const MOCK_TEE_SIGNER = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f' as const;
export const MOCK_PROVIDER = '0x9a4b2c8d6e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6b' as const;

/** Stand-in RecordBook address; appears in every commit line's `book:` field. */
export const MOCK_RECORD_BOOK = '0x5c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d' as const;

export const MOCK_CHAIN_ID = 16661;
export const MOCK_MODEL = 'llama-3.3-70b-instruct';

/** The canonical demo pair (PRD §2 headline proof). */
export const GREEN_TX = '0x9f2c41ba7e6d0538c1af94b2e7d38c05a61fb7e29d4c83a05f1e6b7c8d9a0b1c' as const;
export const RED_TX = '0x4a7e19c3f85b2d60e91c7a4f38d05b62e9c1a7f43b8d05e62c91a7f43b8d05e6' as const;

/* ── Seeded PRNG ──────────────────────────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(rand: () => number, chars: number): string {
  let out = '';
  for (let i = 0; i < chars; i += 1) out += Math.floor(rand() * 16).toString(16);
  return out;
}

function hash32(rand: () => number): `0x${string}` {
  return `0x${hex(rand, 64)}`;
}

function txHash(rand: () => number): `0x${string}` {
  return `0x${hex(rand, 64)}`;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/* ── Entry generation ─────────────────────────────────────────────────────── */

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'FLAT'];

interface GenSpec {
  tokenId: string;
  seed: number;
  count: number;
  epoch: number;
  strategyHash: `0x${string}`;
  /** ISO start; entries advance on a 5-minute cadence (PRD §13). */
  startedAt: string;
  /** Indices that carry the renter address rather than the zero address. */
  renterFrom?: number;
}

/**
 * Generates an ACCEPTED-ONLY ledger (v1.1 Q1).
 *
 * `entryIndex` is the position in the on-chain `entries[]` array, so it is
 * contiguous from 0 by construction — there are no gaps, because a rejected
 * submission never occupies a slot. `nonce` advances with it (PRD I2: the nonce
 * is assigned in order of successful verification).
 */
function generateEntries(spec: GenSpec): DecisionEntry[] {
  const rand = mulberry32(spec.seed);
  const start = Date.parse(spec.startedAt);
  const entries: DecisionEntry[] = [];

  for (let i = 0; i < spec.count; i += 1) {
    const dir = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)];
    const decision: Decision = {
      dir,
      conf: round(0.5 + rand() * 0.45, 2),
      size: round(0.05 + rand() * 0.5, 2),
    };

    // 5-minute cadence with occasional gaps, so the record looks like a real
    // run rather than a synthetic sequence.
    const jitter = rand() < 0.08 ? Math.floor(rand() * 6) * 300_000 : 0;
    const blockTime = new Date(start + i * 300_000 + jitter).toISOString();

    const tx = txHash(rand);
    entries.push({
      entryIndex: i,
      status: 'accepted',
      decision,
      nonce: i + 1,
      epoch: spec.epoch,
      reqSha: hash32(rand),
      respSha: hash32(rand),
      teeSigner: MOCK_TEE_SIGNER,
      provider: MOCK_PROVIDER,
      inputHash: hash32(rand),
      renter:
        spec.renterFrom !== undefined && i >= spec.renterFrom ? MOCK_RENTER : ZERO_ADDRESS,
      txHash: tx,
      chainScanUrl: CHAIN_SCAN_TX(tx),
      blockTime,
    });
  }

  return entries;
}

/**
 * Stable numeric seed from a string, so respData synthesis does not depend on
 * an entry's position in a ledger.
 *
 * It must not depend on `entryIndex`: tamper tests have `entryIndex === null`
 * (v1.1 Q1), and the canonical red is seeded from the green precisely so the
 * two envelopes are identical apart from the tampered byte.
 */
function seedFromString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Synthesises the public respData envelope for an entry on demand.
 *
 * Kept out of `generateEntries` so the ledger fixture stays light: only the
 * detail view and the showcase pair need the bytes.
 *
 * `seedFrom` exists because the canonical red transaction is the SAME provider
 * response as the green one with a single byte flipped (PRD §2). Both must
 * therefore share envelope metadata — chatId, created, token counts — or they
 * would differ in far more than one byte. Always reach this through
 * `getRespDataFor` — which is why this is module-private: a caller that skipped
 * it could render different bytes for the same transaction on two pages.
 */
function synthesizeRespData(
  entry: DecisionEntry,
  agent: Pick<Agent, 'tokenId' | 'strategyHash'>,
  opts?: { tamper?: boolean; seedFrom?: DecisionEntry },
): { respData: string; commitOffset: number } {
  const seedEntry = opts?.seedFrom ?? entry;
  const rand = mulberry32(seedFromString(`${agent.tokenId}:${seedEntry.txHash}`));

  const commitLine = buildCommitLine({
    book: MOCK_RECORD_BOOK,
    chainId: MOCK_CHAIN_ID,
    tokenId: agent.tokenId,
    epoch: entry.epoch,
    nonce: entry.nonce,
    strategyHash: agent.strategyHash,
    inputHash: entry.inputHash,
    renter: entry.renter,
  });

  // A rejected BadCommit entry is exactly the accepted submission with one
  // tampered byte in the strategy field (PRD §2 / §17 step 3).
  const tamper = opts?.tamper ?? entry.rejectReason === 'BadCommit';
  const line = tamper ? tamperStrategyByte(commitLine).tampered : commitLine;

  return buildRespData({
    chatId: `chatcmpl-${hex(rand, 24)}`,
    created: Math.floor(Date.parse(seedEntry.blockTime) / 1000),
    model: MOCK_MODEL,
    commitLine: line,
    decision: seedEntry.decision,
    promptTokens: 820 + Math.floor(rand() * 220),
    completionTokens: 96 + Math.floor(rand() * 40),
  });
}

/**
 * The single source of respData bytes for a given entry.
 *
 * Every surface — /proof, /verify, the entry detail route — must call this
 * rather than `synthesizeRespData` directly, or the same transaction would
 * render different bytes on different pages.
 *
 * A tamper test carries no tokenId (v1.1 Q1: it belongs to no record), so its
 * agent context and its seed entry are resolved from the tamper-test registry.
 */
export function getRespDataFor(
  entry: DecisionEntry,
  tokenId?: string,
): { respData: string; commitOffset: number } {
  const source = getTamperSource(entry.txHash);
  if (source) {
    const agent = getAgents().find((a) => a.tokenId === source.tokenId);
    if (!agent) return { respData: '', commitOffset: 0 };
    return synthesizeRespData(entry, agent, {
      tamper: entry.rejectReason === 'BadCommit',
      seedFrom: source.seed,
    });
  }

  const agent = getAgents().find((a) => a.tokenId === tokenId);
  if (!agent) return { respData: '', commitOffset: 0 };
  return synthesizeRespData(entry, agent);
}

/* ── Agents ───────────────────────────────────────────────────────────────── */

const STRATEGY_1 = '0x7d1f4a9c2e6b80d35f1a7c4e9b2d60f8a3c5e7b9d1f4a6c8e0b2d4f6a8c0e2b4' as const;
const STRATEGY_2 = '0x2b8e4c0a6f1d93b57e2c8a4f0d6b93e18c5a7f2d4b6e8c0a2f4d6b8e0c2a4f6d' as const;
const STRATEGY_3 = '0xc4a7e1f93b5d0286e4c9a7f1d3b5e70c92a4f6d8b0e2c4a6f8d0b2e4c6a8f0d2' as const;
const STRATEGY_4 = '0x91e3c7a5f2d08b46e1c3a5f7d9b1e3c5a7f9d1b3e5c7a9f1d3b5e7c9a1f3d5b7' as const;
const STRATEGY_5 = '0x5f0d2b4e6c8a0f2d4b6e8c0a2f4d6b8e0c2a4f6d8b0e2c4a6f8d0b2e4c6a8f0d' as const;

interface AgentSpec extends GenSpec {
  agent: Omit<Agent, 'decisionCount' | 'verified' | 'strategyHash' | 'epoch'>;
}

const AGENT_SPECS: AgentSpec[] = [
  {
    tokenId: '1',
    seed: 0x5eed01,
    count: 2400,
    epoch: 1,
    strategyHash: STRATEGY_1,
    startedAt: '2026-08-12T14:00:00.000Z',
    renterFrom: 1900,
    agent: {
      tokenId: '1',
      name: 'Delphi-BTC',
      owner: MOCK_OWNER,
      operator: MOCK_OPERATOR,
      storageRoot: '0xa1c3e5f7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3',
      network: 'mainnet',
      domain: 'BTC short-horizon direction',
      createdAt: '2026-08-12T14:00:00.000Z',
      lifecycle: 'rented',
      pnlContext: {
        window: '7d',
        note: 'context — provenance only, not verified',
        series: undefined,
      },
    },
  },
  {
    tokenId: '2',
    seed: 0x5eed02,
    count: 180,
    epoch: 1,
    strategyHash: STRATEGY_2,
    startedAt: '2026-08-16T09:30:00.000Z',
    agent: {
      tokenId: '2',
      name: 'LICTOR-BTC',
      owner: MOCK_OWNER,
      operator: MOCK_OPERATOR,
      storageRoot: '0xb2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4',
      network: 'mainnet',
      domain: 'BTC short-horizon direction',
      createdAt: '2026-08-16T09:30:00.000Z',
      lifecycle: 'listed',
      pnlContext: {
        window: '3d',
        note: 'context — provenance only, not verified',
        series: undefined,
      },
    },
  },
  {
    tokenId: '3',
    seed: 0x5eed03,
    count: 1,
    epoch: 1,
    strategyHash: STRATEGY_3,
    startedAt: '2026-08-19T22:05:00.000Z',
    agent: {
      tokenId: '3',
      name: 'Sentry-BTC',
      owner: MOCK_OWNER,
      operator: MOCK_OPERATOR,
      storageRoot: '0xc3e5f7a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5',
      network: 'mainnet',
      domain: 'BTC short-horizon direction',
      createdAt: '2026-08-19T22:00:00.000Z',
      lifecycle: 'active',
    },
  },
  {
    tokenId: '4',
    seed: 0x5eed04,
    count: 0,
    epoch: 1,
    strategyHash: STRATEGY_4,
    startedAt: '2026-08-20T08:00:00.000Z',
    agent: {
      tokenId: '4',
      name: 'Vesper-BTC',
      owner: MOCK_OWNER,
      operator: MOCK_OPERATOR,
      storageRoot: '0xd4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6',
      network: 'mainnet',
      domain: 'BTC short-horizon direction',
      createdAt: '2026-08-20T07:40:00.000Z',
      lifecycle: 'retired',
    },
  },
  {
    tokenId: '5',
    seed: 0x5eed05,
    count: 64,
    epoch: 2,
    strategyHash: STRATEGY_5,
    startedAt: '2026-08-18T06:00:00.000Z',
    agent: {
      tokenId: '5',
      name: 'Aegis-BTC',
      owner: MOCK_OWNER,
      operator: MOCK_OPERATOR,
      storageRoot: '0xe5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7',
      network: 'mainnet',
      domain: 'BTC short-horizon direction',
      createdAt: '2026-08-14T06:00:00.000Z',
      lifecycle: 'minted',
    },
  },
];

/* ── Tamper tests ─────────────────────────────────────────────────────────── */

/**
 * Where a tamper test came from.
 *
 * A tamper test is a REPLAY of a real accepted submission, so it needs the
 * source entry (to seed byte-identical envelope metadata) and the source agent
 * (for the commit line's agent id and sealed strategy hash). Neither is
 * derivable from the tamper test itself, because it belongs to no ledger.
 */
interface TamperSource {
  tokenId: string;
  seed: DecisionEntry;
}

/** Which accepted entry each reason replays.
 *
 * Typed as a total `Record<RejectReason, …>` deliberately: it makes "all 7 red
 * receipt variants stay reachable" a COMPILE-TIME guarantee. Adding a reason to
 * `RejectReason` without giving it a tamper test is a type error, not a silently
 * unreachable UI state.
 */
const TAMPER_SPECS: Record<RejectReason, { tokenId: string; at: number }> = {
  // The canonical demo red: agent 1's first accepted entry, re-sent with one
  // tampered byte. This pair is the product's headline claim (PRD §2).
  BadCommit: { tokenId: '1', at: 0 },
  BadSigner: { tokenId: '2', at: 12 },
  BadNonce: { tokenId: '2', at: 40 },
  // Agent 5 is on epoch 2, so a submission naming epoch 1 is genuinely an epoch
  // the token has moved past rather than an invented value.
  BadEpoch: { tokenId: '5', at: 10 },
  BadHash: { tokenId: '2', at: 77 },
  NotOperator: { tokenId: '3', at: 0 },
  BadAnchor: { tokenId: '2', at: 120 },
};

function buildTamperTests(ledgers: Map<string, DecisionEntry[]>): {
  tests: DecisionEntry[];
  sources: Map<string, TamperSource>;
} {
  const rand = mulberry32(0x7a3b9e);
  const tests: DecisionEntry[] = [];
  const sources = new Map<string, TamperSource>();

  for (const [reason, spec] of Object.entries(TAMPER_SPECS) as [
    RejectReason,
    { tokenId: string; at: number },
  ][]) {
    const source = ledgers.get(spec.tokenId)?.[spec.at];
    if (!source) continue;

    const canonical = reason === 'BadCommit';
    const tx = canonical ? RED_TX : txHash(rand);
    // A replay lands a minute after the submission it copies.
    const blockTime = new Date(Date.parse(source.blockTime) + 60_000).toISOString();

    const test: DecisionEntry = {
      ...source,
      // v1.1 Q1: never stored on-chain, so there is no array slot to occupy.
      entryIndex: null,
      status: 'rejected',
      rejectReason: reason,
      isTamperTest: true,
      txHash: tx,
      chainScanUrl: CHAIN_SCAN_TX(tx),
      blockTime,

      // Per-reason mutation, so each red entry is internally consistent with
      // the reason it carries rather than merely labelled with it.
      //
      // BadCommit tampers the respData bytes, not a field — see
      // synthesizeRespData. NotOperator and BadAnchor are properties of the
      // SUBMISSION rather than the entry: who sent the transaction, and where
      // the commit line sits inside the envelope. Neither has a DecisionEntry
      // field to mutate, so those two stay faithful copies and the failing
      // check is what distinguishes them.
      ...(reason === 'BadSigner' ? { teeSigner: `0x${hex(rand, 40)}` as const } : {}),
      ...(reason === 'BadNonce' ? { nonce: source.nonce } : {}),
      ...(reason === 'BadEpoch' ? { epoch: Math.max(1, source.epoch - 1) } : {}),
      ...(reason === 'BadHash' ? { respSha: hash32(rand) } : {}),
    };

    tests.push(test);
    sources.set(tx.toLowerCase(), { tokenId: spec.tokenId, seed: source });
  }

  return { tests, sources };
}

/* ── Memoised access ──────────────────────────────────────────────────────── */

let entriesCache: Map<string, DecisionEntry[]> | null = null;
let agentsCache: Agent[] | null = null;
let tamperCache: DecisionEntry[] | null = null;
let tamperSourceCache: Map<string, TamperSource> | null = null;

function buildAll(): {
  agents: Agent[];
  entries: Map<string, DecisionEntry[]>;
  tamperTests: DecisionEntry[];
  tamperSources: Map<string, TamperSource>;
} {
  const entries = new Map<string, DecisionEntry[]>();
  const agents: Agent[] = [];

  for (const spec of AGENT_SPECS) {
    const list = generateEntries(spec);
    entries.set(spec.tokenId, list);

    agents.push({
      ...spec.agent,
      epoch: spec.epoch,
      strategyHash: spec.strategyHash,
      // DERIVED, never hardcoded (plan T6). The ledger is accepted-only
      // (v1.1 Q1), so the count is simply its length.
      decisionCount: list.length,
      // Not a percentage: every stored entry passed the on-chain check by
      // invariant I1, so there is no fraction to report (v1.1 Q1 / D15).
      verified: true,
    });
  }

  // Pin the canonical green to the documented demo tx hash so /proof, /verify
  // and the README all reference the same transaction.
  const green = entries.get('1')?.[0];
  if (green) {
    green.txHash = GREEN_TX;
    green.chainScanUrl = CHAIN_SCAN_TX(GREEN_TX);
  }

  // Built AFTER the green is pinned: the canonical red replays it, and seeds
  // its envelope from the green's tx hash.
  const { tests, sources } = buildTamperTests(entries);

  return { agents, entries, tamperTests: tests, tamperSources: sources };
}

function ensure() {
  if (
    agentsCache === null ||
    entriesCache === null ||
    tamperCache === null ||
    tamperSourceCache === null
  ) {
    const built = buildAll();
    agentsCache = built.agents;
    entriesCache = built.entries;
    tamperCache = built.tamperTests;
    tamperSourceCache = built.tamperSources;
  }
  return {
    agents: agentsCache,
    entries: entriesCache,
    tamperTests: tamperCache,
    tamperSources: tamperSourceCache,
  };
}

export function getAgents(): Agent[] {
  return ensure().agents;
}

/** Accepted entries only (v1.1 Q1). Tamper tests live in `getTamperTests()`. */
export function getEntriesFor(tokenId: string): DecisionEntry[] {
  return ensure().entries.get(tokenId) ?? [];
}

/**
 * The deliberate tamper tests — all 7 RejectReasons.
 *
 * These are NOT in any ledger and have no `entryIndex`. They exist so the red
 * receipt variants stay reachable from /proof, /verify and /design now that the
 * record itself is accepted-only.
 */
export function getTamperTests(): DecisionEntry[] {
  return ensure().tamperTests;
}

function getTamperSource(txHash: string): TamperSource | undefined {
  return ensure().tamperSources.get(txHash.toLowerCase());
}

/**
 * The canonical green/red pair used by the landing showcase, /proof and
 * <ByteDiffReveal>. Both carry their respData bytes.
 *
 * The green is a real accepted ledger entry; the red is the tamper test that
 * replays it. `agent` attributes the GREEN only (D14).
 */
export function getShowcasePair(): { green: DecisionEntry; red: DecisionEntry; agent: Agent } {
  const agent = getAgents().find((a) => a.tokenId === '1');
  const green = getEntriesFor('1').find((e) => e.txHash === GREEN_TX);
  const red = getTamperTests().find((e) => e.txHash === RED_TX);
  if (!agent || !green || !red) {
    throw new Error('fixtures: canonical showcase pair is missing');
  }
  return {
    agent,
    green: { ...green, ...getRespDataFor(green, '1') },
    red: { ...red, ...getRespDataFor(red) },
  };
}

/** Stress fixture for the §5.4 "graceful with 10k" requirement. Accepted-only. */
export function getStressEntries(count = 10_000): DecisionEntry[] {
  return generateEntries({
    tokenId: '1',
    seed: 0x577e55,
    count,
    epoch: 1,
    strategyHash: STRATEGY_1,
    startedAt: '2026-07-01T00:00:00.000Z',
  });
}

/* ── Listings / grants / settlements / audit grants ───────────────────────── */

const DAY_SECONDS = 86_400;

export function getListings(): Listing[] {
  // v1.1 Q3: the term is seconds on-chain (RentalDesk.list takes termSeconds),
  // so it is stored that way here rather than converted at the boundary.
  // maxDecisions is deliberately absent — it is derived at rent time from the
  // escrow the renter actually posts.
  return [
    {
      tokenId: '1',
      feePerDecisionWei: '10000000000000000',
      minEscrowWei: '100000000000000000',
      active: true,
      termSeconds: 30 * DAY_SECONDS,
    },
    {
      tokenId: '2',
      feePerDecisionWei: '4000000000000000',
      minEscrowWei: '50000000000000000',
      active: true,
      termSeconds: 14 * DAY_SECONDS,
    },
    {
      tokenId: '3',
      feePerDecisionWei: '2000000000000000',
      minEscrowWei: '20000000000000000',
      active: false,
      termSeconds: 7 * DAY_SECONDS,
    },
  ];
}

export function getGrants(): Grant[] {
  return [
    {
      tokenId: '1',
      renter: MOCK_RENTER,
      expiry: '2026-09-18T00:00:00.000Z',
      maxDecisions: 200,
      decisionsUsed: 137,
      remainingEscrowWei: '80000000000000000',
      status: 'active',
    },
    {
      tokenId: '2',
      renter: MOCK_RENTER,
      expiry: '2026-08-14T00:00:00.000Z',
      maxDecisions: 120,
      decisionsUsed: 120,
      remainingEscrowWei: '0',
      status: 'expired',
    },
  ];
}

const PROTOCOL_FEE_BPS = 200; // PRD §13

export function getSettlements(tokenId: string): Settlement[] {
  const listing = getListings().find((l) => l.tokenId === tokenId);
  if (!listing) return [];
  // Ledgers are accepted-only (v1.1 Q1), so the only filter that matters is
  // whether the entry is attributed to a renter — settle() pulls the fee per
  // accepted entry whose renter matches the grant (PRD §5 RentalDesk).
  const entries = getEntriesFor(tokenId).filter((e) => e.renter !== ZERO_ADDRESS);

  return entries.slice(0, 40).flatMap((e, i) => {
    // entryIndex is non-null for every stored entry by construction; the guard
    // exists because the type allows null and settle() is index-addressed.
    if (e.entryIndex === null) return [];
    const fee = BigInt(listing.feePerDecisionWei);
    const protocolFee = (fee * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;
    return [
      {
        tokenId,
        entryIndex: e.entryIndex,
        renter: e.renter,
        feeWei: fee.toString(),
        protocolFeeWei: protocolFee.toString(),
        netToOwnerWei: (fee - protocolFee).toString(),
        settled: i < 28,
        ...(i < 28 ? { txHash: e.txHash } : {}),
      },
    ];
  });
}

export function getAuditGrants(tokenId: string): AuditGrant[] {
  if (tokenId === '1') {
    return [
      {
        tokenId,
        auditor: MOCK_AUDITOR,
        grantedAt: '2026-08-19T10:15:00.000Z',
        status: 'active',
      },
    ];
  }
  return [];
}
