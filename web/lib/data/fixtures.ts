/**
 * Deterministic mock fixtures.
 *
 * Every value is derived from a fixed seed via mulberry32, so screenshots,
 * the demo video and PR review captures are byte-stable across runs. Nothing
 * here uses Math.random() or Date.now() at module scope.
 *
 * Data shape rationale (plan T6):
 *   agent 1  ~2400 accepted + 1 deliberate BadCommit tamper test  (flagship)
 *   agent 2  ~180 entries carrying ALL 7 RejectReasons            (receipt coverage)
 *   agent 3  1 entry                                             (edge case)
 *   agent 4  0 entries, retired                                  (empty ledger)
 *   agent 5  epoch 2, unlisted                                   (epoch boundary)
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

/** All 7 reasons, so every red receipt variant is exercised (plan T6). */
const ALL_REJECT_REASONS: RejectReason[] = [
  'BadCommit',
  'BadSigner',
  'BadNonce',
  'BadEpoch',
  'BadHash',
  'NotOperator',
  'BadAnchor',
];

interface GenSpec {
  tokenId: string;
  seed: number;
  count: number;
  epoch: number;
  strategyHash: `0x${string}`;
  /** Reject reasons to inject, spread evenly through the ledger. */
  rejects: RejectReason[];
  /** ISO start; entries advance on a 5-minute cadence (PRD §13). */
  startedAt: string;
  /** Indices that carry the renter address rather than the zero address. */
  renterFrom?: number;
}

function generateEntries(spec: GenSpec): DecisionEntry[] {
  const rand = mulberry32(spec.seed);
  const start = Date.parse(spec.startedAt);
  const entries: DecisionEntry[] = [];

  // Spread the injected rejections evenly, never at index 0 (so every agent
  // opens with a clean accepted entry).
  const rejectAt = new Map<number, RejectReason>();
  spec.rejects.forEach((reason, i) => {
    const idx = Math.max(1, Math.floor(((i + 1) * spec.count) / (spec.rejects.length + 1)));
    rejectAt.set(idx, reason);
  });

  let nonce = 0;
  for (let i = 0; i < spec.count; i += 1) {
    const reason = rejectAt.get(i);
    const accepted = reason === undefined;

    // A rejected submission never consumes a nonce (PRD §10: the nonce is
    // assigned in order of successful local verification).
    if (accepted) nonce += 1;

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
      index: i,
      status: accepted ? 'accepted' : 'rejected',
      ...(reason ? { rejectReason: reason } : {}),
      decision,
      nonce: accepted ? nonce : nonce + 1,
      epoch: spec.epoch,
      reqSha: hash32(rand),
      respSha: hash32(rand),
      teeSigner: reason === 'BadSigner' ? `0x${hex(rand, 40)}` : MOCK_TEE_SIGNER,
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
 * Synthesises the public respData envelope for an entry on demand.
 *
 * Kept out of `generateEntries` so the ledger fixture stays light: only the
 * detail view and the showcase pair need the bytes.
 *
 * `seedFrom` exists because the canonical red transaction is the SAME provider
 * response as the green one with a single byte flipped (PRD §2). Both must
 * therefore share envelope metadata — chatId, created, token counts — or they
 * would differ in far more than one byte. Always reach this through
 * `getRespDataFor` so every surface renders identical bytes for a given tx.
 */
export function synthesizeRespData(
  entry: DecisionEntry,
  agent: Pick<Agent, 'tokenId' | 'strategyHash'>,
  opts?: { tamper?: boolean; seedFrom?: DecisionEntry },
): { respData: string; commitOffset: number } {
  const seedEntry = opts?.seedFrom ?? entry;
  const rand = mulberry32(seedEntry.index * 7919 + Number(agent.tokenId) * 104729);

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
 * The canonical red entry is seeded from the green one so the two envelopes are
 * byte-identical apart from the tampered strategy byte. Every surface — /proof,
 * /verify, the entry detail route — must call this rather than
 * `synthesizeRespData` directly, or the same transaction would render different
 * bytes on different pages.
 */
export function getRespDataFor(
  tokenId: string,
  entry: DecisionEntry,
): { respData: string; commitOffset: number } {
  const agent = getAgents().find((a) => a.tokenId === tokenId);
  if (!agent) return { respData: '', commitOffset: 0 };

  if (tokenId === '1' && entry.txHash === RED_TX) {
    const green = getEntriesFor('1').find((e) => e.txHash === GREEN_TX);
    if (green) {
      return synthesizeRespData(entry, agent, { tamper: true, seedFrom: green });
    }
  }

  return synthesizeRespData(entry, agent);
}

/* ── Agents ───────────────────────────────────────────────────────────────── */

const STRATEGY_1 = '0x7d1f4a9c2e6b80d35f1a7c4e9b2d60f8a3c5e7b9d1f4a6c8e0b2d4f6a8c0e2b4' as const;
const STRATEGY_2 = '0x2b8e4c0a6f1d93b57e2c8a4f0d6b93e18c5a7f2d4b6e8c0a2f4d6b8e0c2a4f6d' as const;
const STRATEGY_3 = '0xc4a7e1f93b5d0286e4c9a7f1d3b5e70c92a4f6d8b0e2c4a6f8d0b2e4c6a8f0d2' as const;
const STRATEGY_4 = '0x91e3c7a5f2d08b46e1c3a5f7d9b1e3c5a7f9d1b3e5c7a9f1d3b5e7c9a1f3d5b7' as const;
const STRATEGY_5 = '0x5f0d2b4e6c8a0f2d4b6e8c0a2f4d6b8e0c2a4f6d8b0e2c4a6f8d0b2e4c6a8f0d' as const;

interface AgentSpec extends GenSpec {
  agent: Omit<Agent, 'decisionCount' | 'brainBoundPct' | 'strategyHash' | 'epoch'>;
}

const AGENT_SPECS: AgentSpec[] = [
  {
    tokenId: '1',
    seed: 0x5eed01,
    count: 2401,
    epoch: 1,
    strategyHash: STRATEGY_1,
    // The single deliberate tamper test that produces the canonical red tx.
    rejects: ['BadCommit'],
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
    // Carries every reject reason so all red receipt variants are reachable.
    rejects: ALL_REJECT_REASONS,
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
    rejects: [],
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
    rejects: [],
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
    rejects: ['BadEpoch'],
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

/* ── Memoised access ──────────────────────────────────────────────────────── */

let entriesCache: Map<string, DecisionEntry[]> | null = null;
let agentsCache: Agent[] | null = null;

function buildAll(): { agents: Agent[]; entries: Map<string, DecisionEntry[]> } {
  const entries = new Map<string, DecisionEntry[]>();
  const agents: Agent[] = [];

  for (const spec of AGENT_SPECS) {
    const list = generateEntries(spec);
    entries.set(spec.tokenId, list);

    const accepted = list.filter((e) => e.status === 'accepted').length;
    const rejected = list.length - accepted;

    agents.push({
      ...spec.agent,
      epoch: spec.epoch,
      strategyHash: spec.strategyHash,
      // DERIVED, never hardcoded (plan T6). PRD §5: rejections revert, so the
      // stored record is the accepted set; rejected submissions surface as
      // DecisionRejected events and are shown alongside for legibility.
      // See plan §10 item 1 — semantics pending @winsznx confirmation.
      decisionCount: accepted,
      brainBoundPct:
        list.length === 0 ? 100 : round((accepted / (accepted + rejected)) * 100, 2),
    });
  }

  // Pin the canonical showcase pair to the fixed demo tx hashes so /proof,
  // /verify and the README all reference the same two transactions.
  const first = entries.get('1');
  if (first) {
    const green = first.find((e) => e.status === 'accepted');
    const red = first.find((e) => e.rejectReason === 'BadCommit');
    if (green) {
      green.txHash = GREEN_TX;
      green.chainScanUrl = CHAIN_SCAN_TX(GREEN_TX);
    }
    if (red) {
      red.txHash = RED_TX;
      red.chainScanUrl = CHAIN_SCAN_TX(RED_TX);
      // The red submission is the green one re-sent with a tampered byte, so
      // it must declare the same nonce and inputHash to be a faithful replay.
      if (green) {
        red.nonce = green.nonce;
        red.inputHash = green.inputHash;
        red.reqSha = green.reqSha;
        red.decision = { ...green.decision };
      }
    }
  }

  return { agents, entries };
}

function ensure() {
  if (agentsCache === null || entriesCache === null) {
    const built = buildAll();
    agentsCache = built.agents;
    entriesCache = built.entries;
  }
  return { agents: agentsCache, entries: entriesCache };
}

export function getAgents(): Agent[] {
  return ensure().agents;
}

export function getEntriesFor(tokenId: string): DecisionEntry[] {
  return ensure().entries.get(tokenId) ?? [];
}

/**
 * The canonical green/red pair used by the landing showcase, /proof and
 * <ByteDiffReveal>. Both carry their respData bytes.
 */
export function getShowcasePair(): { green: DecisionEntry; red: DecisionEntry; agent: Agent } {
  const agent = getAgents().find((a) => a.tokenId === '1');
  const list = getEntriesFor('1');
  const green = list.find((e) => e.txHash === GREEN_TX);
  const red = list.find((e) => e.txHash === RED_TX);
  if (!agent || !green || !red) {
    throw new Error('fixtures: canonical showcase pair is missing');
  }
  return {
    agent,
    green: { ...green, ...getRespDataFor('1', green) },
    red: { ...red, ...getRespDataFor('1', red) },
  };
}

/** Stress fixture for the §5.4 "graceful with 10k" requirement. */
export function getStressEntries(count = 10_000): DecisionEntry[] {
  return generateEntries({
    tokenId: '1',
    seed: 0x577e55,
    count,
    epoch: 1,
    strategyHash: STRATEGY_1,
    rejects: ALL_REJECT_REASONS,
    startedAt: '2026-07-01T00:00:00.000Z',
  });
}

/* ── Listings / grants / settlements / audit grants ───────────────────────── */

export function getListings(): Listing[] {
  return [
    {
      tokenId: '1',
      feePerDecisionWei: '10000000000000000',
      minEscrowWei: '100000000000000000',
      active: true,
      termDays: 30,
      maxDecisions: 200,
    },
    {
      tokenId: '2',
      feePerDecisionWei: '4000000000000000',
      minEscrowWei: '50000000000000000',
      active: true,
      termDays: 14,
      maxDecisions: 120,
    },
    {
      tokenId: '3',
      feePerDecisionWei: '2000000000000000',
      minEscrowWei: '20000000000000000',
      active: false,
      termDays: 7,
      maxDecisions: 60,
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
  const entries = getEntriesFor(tokenId).filter(
    (e) => e.status === 'accepted' && e.renter !== ZERO_ADDRESS,
  );

  return entries.slice(0, 40).map((e, i) => {
    const fee = BigInt(listing.feePerDecisionWei);
    const protocolFee = (fee * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;
    return {
      tokenId,
      entryIndex: e.index,
      renter: e.renter,
      feeWei: fee.toString(),
      protocolFeeWei: protocolFee.toString(),
      netToOwnerWei: (fee - protocolFee).toString(),
      settled: i < 28,
      ...(i < 28 ? { txHash: e.txHash } : {}),
    };
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
