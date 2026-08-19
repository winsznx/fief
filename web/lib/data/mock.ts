import { CHAIN_SCAN_TX } from '@/lib/chain/zerog';
import type {
  Agent,
  DataSource,
  Decision,
  DecisionEntry,
  Grant,
  Listing,
  RenterFeedMessage,
  VerifyResult,
} from './types';

const ZERO = '0x0000000000000000000000000000000000000000' as const;
const OWNER = '0x8f3a1c9d2e4b70a6c5d8e1f0a2b3c4d5e6f70819' as const;
const OPERATOR = '0x2c4e6a8b0d1f3e5c7a9b1d3e5f708192a3b4c5d6' as const;
const TEE = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f' as const;
const PROVIDER = '0x9a4b2c8d6e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6b' as const;
const RENTER = '0x3d5f7a9c1e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f' as const;

const GREEN_TX = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
const RED_TX = '0x2222222222222222222222222222222222222222222222222222222222222222' as const;

function h(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(64, '0')}`;
}

function entry(partial: Omit<DecisionEntry, 'chainScanUrl'>): DecisionEntry {
  return { ...partial, chainScanUrl: CHAIN_SCAN_TX(partial.txHash) };
}

const agents: Agent[] = [
  {
    tokenId: '1',
    name: 'Delphi-BTC',
    owner: OWNER,
    operator: OPERATOR,
    epoch: 1,
    strategyHash: h(0xabc1),
    storageRoot: h(0xdef1),
    network: 'mainnet',
    domain: 'BTC short-horizon direction',
    decisionCount: 3,
    brainBoundPct: 100,
    createdAt: '2026-08-12T14:00:00.000Z',
    pnlContext: {
      window: '7d',
      note: 'context — provenance only, not verified',
      series: [
        { t: '2026-08-13T00:00:00.000Z', v: 0 },
        { t: '2026-08-15T00:00:00.000Z', v: 1.2 },
        { t: '2026-08-18T00:00:00.000Z', v: 0.8 },
      ],
    },
  },
  {
    tokenId: '2',
    name: 'LICTOR-BTC',
    owner: OWNER,
    operator: OPERATOR,
    epoch: 1,
    strategyHash: h(0xabc2),
    storageRoot: h(0xdef2),
    network: 'mainnet',
    domain: 'BTC short-horizon direction',
    decisionCount: 2,
    brainBoundPct: 100,
    createdAt: '2026-08-16T09:30:00.000Z',
  },
];

const listings: Listing[] = [
  {
    tokenId: '1',
    feePerDecisionWei: '10000000000000000',
    minEscrowWei: '100000000000000000',
    active: true,
  },
];

const decision = (dir: Decision['dir'], conf: number, size: number): Decision => ({
  dir,
  conf,
  size,
});

const entriesByToken: Record<string, DecisionEntry[]> = {
  '1': [
    entry({
      index: 0,
      status: 'accepted',
      decision: decision('UP', 0.72, 0.4),
      nonce: 1,
      epoch: 1,
      reqSha: h(0x11),
      respSha: h(0x21),
      teeSigner: TEE,
      provider: PROVIDER,
      inputHash: h(0x31),
      renter: ZERO,
      txHash: GREEN_TX,
      blockTime: '2026-08-18T16:02:11.000Z',
    }),
    entry({
      index: 1,
      status: 'rejected',
      rejectReason: 'BadCommit',
      decision: decision('UP', 0.72, 0.4),
      nonce: 2,
      epoch: 1,
      reqSha: h(0x12),
      respSha: h(0x22),
      teeSigner: TEE,
      provider: PROVIDER,
      inputHash: h(0x32),
      renter: ZERO,
      txHash: RED_TX,
      blockTime: '2026-08-18T16:03:40.000Z',
    }),
    entry({
      index: 2,
      status: 'accepted',
      decision: decision('DOWN', 0.61, 0.25),
      nonce: 2,
      epoch: 1,
      reqSha: h(0x13),
      respSha: h(0x23),
      teeSigner: TEE,
      provider: PROVIDER,
      inputHash: h(0x33),
      renter: RENTER,
      txHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
      blockTime: '2026-08-18T16:08:02.000Z',
    }),
  ],
  '2': [
    entry({
      index: 0,
      status: 'accepted',
      decision: decision('FLAT', 0.54, 0.1),
      nonce: 1,
      epoch: 1,
      reqSha: h(0x41),
      respSha: h(0x51),
      teeSigner: TEE,
      provider: PROVIDER,
      inputHash: h(0x61),
      renter: ZERO,
      txHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
      blockTime: '2026-08-17T11:20:00.000Z',
    }),
    entry({
      index: 1,
      status: 'accepted',
      decision: decision('UP', 0.68, 0.35),
      nonce: 2,
      epoch: 1,
      reqSha: h(0x42),
      respSha: h(0x52),
      teeSigner: TEE,
      provider: PROVIDER,
      inputHash: h(0x62),
      renter: ZERO,
      txHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
      blockTime: '2026-08-17T11:25:00.000Z',
    }),
  ],
};

const grants: Grant[] = [
  {
    tokenId: '1',
    renter: RENTER,
    expiry: '2026-09-18T00:00:00.000Z',
    maxDecisions: 200,
    remainingEscrowWei: '80000000000000000',
    status: 'active',
  },
];

function delay<T>(value: T, ms = 40): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const MOCK_GREEN_TX = GREEN_TX;
export const MOCK_RED_TX = RED_TX;
export const MOCK_RENTER = RENTER;
export const MOCK_OWNER = OWNER;

export const mockDataSource: DataSource = {
  async listAgents() {
    return delay([...agents]);
  },
  async getAgent(tokenId) {
    return delay(agents.find((a) => a.tokenId === tokenId) ?? null);
  },
  async getEntries(tokenId, opts) {
    const all = entriesByToken[tokenId] ?? [];
    const cursor = opts?.cursor ?? 0;
    const limit = opts?.limit ?? 50;
    return delay(all.slice(cursor, cursor + limit));
  },
  async getListing(tokenId) {
    return delay(listings.find((l) => l.tokenId === tokenId) ?? null);
  },
  async getAgentsForOwner(address) {
    const needle = address.toLowerCase();
    return delay(agents.filter((a) => a.owner.toLowerCase() === needle));
  },
  async getGrantsForRenter(address) {
    const needle = address.toLowerCase();
    return delay(grants.filter((g) => g.renter.toLowerCase() === needle));
  },
  subscribeRenterFeed(tokenId, onMessage) {
    const sample = entriesByToken[tokenId]?.filter((e) => e.status === 'accepted') ?? [];
    let i = 0;
    const timer = setInterval(() => {
      const e = sample[i % Math.max(sample.length, 1)];
      if (!e) return;
      const msg: RenterFeedMessage = {
        entryIndex: e.index,
        tokenId,
        decision: e.decision,
        at: new Date().toISOString(),
        txHash: e.txHash,
      };
      onMessage(msg);
      i += 1;
    }, 4000);
    return () => clearInterval(timer);
  },
  async verifyTx(txHash) {
    const normalized = txHash.toLowerCase();
    const all = Object.values(entriesByToken).flat();
    const found = all.find((e) => e.txHash.toLowerCase() === normalized);
    if (!found) {
      const empty: VerifyResult = {
        txHash: txHash.startsWith('0x') ? (txHash as `0x${string}`) : `0x${txHash}`,
        ok: false,
        network: 'mainnet',
        checks: [{ name: 'tx found on 0G mainnet', pass: false, detail: 'not in mock ledger' }],
      };
      return delay(empty);
    }
    const accepted = found.status === 'accepted';
    const result: VerifyResult = {
      txHash: found.txHash,
      ok: accepted,
      network: 'mainnet',
      entry: found,
      checks: [
        {
          name: 'signer matches getService().teeSignerAddress',
          pass: found.rejectReason !== 'BadSigner',
        },
        {
          name: 'commit matches sealed strategy + epoch + nonce',
          pass: found.rejectReason !== 'BadCommit',
          detail: found.rejectReason === 'BadCommit' ? 'one byte tampered — rejected on-chain' : undefined,
        },
        {
          name: 'nonce fresh for this (token, epoch)',
          pass: found.rejectReason !== 'BadNonce',
        },
      ],
    };
    return delay(result);
  },
  async rent(tokenId, escrowWei) {
    const grant: Grant = {
      tokenId,
      renter: RENTER,
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      maxDecisions: 200,
      remainingEscrowWei: escrowWei,
      status: 'active',
    };
    return delay(grant, 200);
  },
};
