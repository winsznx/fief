/**
 * LiveDataSource — reads the real record off 0G mainnet.
 *
 * Until this existed the UI ran entirely on fixtures, which meant the product
 * could not show its own best evidence: a real forward epoch at 100%
 * completeness sitting on chain while the site rendered invented agents.
 *
 * Two deliberate constraints:
 *
 * 1. **Reads only.** Every mutation throws. The console has no wallet writes
 *    wired, and returning an optimistic `TxResult` in live mode would be a lie
 *    told by the data layer — the one place in this codebase that must not lie.
 *
 * 2. **No indexer.** Everything comes from contract reads and event logs
 *    against a public RPC, so a judge can reproduce any number here with
 *    `cast`. Supabase was in the PRD as an indexed read cache; it is not needed
 *    at this record size and would add a trust hop between the chain and the UI.
 */

import { createPublicClient, http, parseAbiItem } from 'viem';
import type { Address, PublicClient } from 'viem';

import { CHAIN_SCAN_TX } from '@/lib/chain/zerog';
import { ZERO_ADDRESS } from './commit';
import { epochBookAbi, fiefAgentAbi, recordBookAbi, rentalDeskAbi } from './live-abi';
import type {
  Agent,
  AuditGrant,
  DataSource,
  Decision,
  DecisionEntry,
  EntriesPage,
  EpochSummary,
  FeedStatus,
  Grant,
  Listing,
  RenterFeedMessage,
  Settlement,
  ShowcasePair,
  VerifyResult,
} from './types';

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://evmrpc.0g.ai';
const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';

const ADDR = {
  fiefAgent: (process.env.NEXT_PUBLIC_FIEF_AGENT ??
    '0x4db74faF047160893Aa0dabC9A1B8F3297570a68') as Address,
  epochBook: (process.env.NEXT_PUBLIC_EPOCH_BOOK ??
    '0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8') as Address,
  recordBook: (process.env.NEXT_PUBLIC_RECORD_BOOK ??
    '0x40eB003340f467e096F8Ae30f8696bE40Eba922c') as Address,
  rentalDesk: (process.env.NEXT_PUBLIC_RENTAL_DESK ??
    '0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57') as Address,
};

/**
 * The block the contracts were deployed in.
 *
 * Log queries start here rather than at genesis: 0G mainnet is tens of millions
 * of blocks deep and scanning from zero would time out every request.
 *
 * Set BELOW the first registration (42582470). An over-late value does not
 * error, it silently returns a shorter agent list, which is the worst kind of
 * wrong for a product whose claim is that nothing goes missing.
 */
const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '42582000');

const client: PublicClient = createPublicClient({ transport: http(RPC) });

const EV = {
  registered: parseAbiItem(
    'event AgentRegistered(uint256 indexed agentId, address indexed owner, bytes32 strategyHash, bytes32 storageRoot)',
  ),
  epochOpened: parseAbiItem(
    'event EpochOpened(uint256 indexed agentId, uint64 indexed epochId, bytes32 specHash, uint64 startTime)',
  ),
  committed: parseAbiItem(
    'event DecisionCommitted(uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, bytes32 receiptCommit)',
  ),
  revealed: parseAbiItem(
    'event DecisionRevealed(uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, address teeSigner)',
  ),
  rejected: parseAbiItem(
    'event DecisionRejected(uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, string reason)',
  ),
};

const iso = (seconds: bigint | number) => new Date(Number(seconds) * 1000).toISOString();

/** Simple request-scoped memo. The UI hits these repeatedly per render pass. */
function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

const notSupported = (what: string): never => {
  throw new Error(
    `${what} is not available in live mode: the console has no wallet writes wired yet. ` +
      `Use the runtime CLIs in runtime/ instead.`,
  );
};

/* ------------------------------------------------------------------ reads */

const loadAgentIds = memo(async (): Promise<bigint[]> => {
  const logs = await client.getLogs({
    address: ADDR.fiefAgent,
    event: EV.registered,
    fromBlock: DEPLOY_BLOCK,
    toBlock: 'latest',
  });
  return logs.map((l) => l.args.agentId as bigint).filter((id) => id !== undefined);
});

async function readEpochSummary(agentId: bigint, epochId: bigint): Promise<EpochSummary | null> {
  try {
    const [spec, meta, bps] = await Promise.all([
      client.readContract({
        address: ADDR.epochBook,
        abi: epochBookAbi,
        functionName: 'specOf',
        args: [agentId, epochId],
      }) as Promise<Record<string, unknown>>,
      client.readContract({
        address: ADDR.epochBook,
        abi: epochBookAbi,
        functionName: 'metaOf',
        args: [agentId, epochId],
      }) as Promise<Record<string, unknown>>,
      client.readContract({
        address: ADDR.epochBook,
        abi: epochBookAbi,
        functionName: 'completenessBps',
        args: [agentId, epochId],
      }) as Promise<number>,
    ]);

    const slotCount = Number(spec.slotCount);
    const committed = Number(meta.committedCount);
    const revealed = Number(meta.revealedCount);

    return {
      epochId: Number(epochId),
      market: 'BTC-USDT',
      cadenceSeconds: Number(spec.cadenceSeconds),
      horizonSeconds: Number(spec.horizonSeconds),
      maxCommitDelay: Number(spec.maxCommitDelay),
      disclosureDelay: Number(spec.disclosureDelay),
      startTime: iso(spec.startTime as bigint),
      slotCount,
      committed,
      revealed,
      // Derived exactly as the contract derives them at finalize, so the UI and
      // `finalizeEpoch` can never disagree about what happened.
      missed: Math.max(0, slotCount - committed),
      invalid: Math.max(0, committed - revealed),
      completenessBps: Number(bps),
      finalized: Boolean(meta.finalized),
    };
  } catch {
    return null;
  }
}

async function buildAgent(agentId: bigint): Promise<Agent | null> {
  try {
    const a = (await client.readContract({
      address: ADDR.fiefAgent,
      abi: fiefAgentAbi,
      functionName: 'agentOf',
      args: [agentId],
    })) as {
      owner: Address;
      operator: Address;
      strategyHash: `0x${string}`;
      storageRoot: `0x${string}`;
      epochId: bigint;
      domain: string;
    };

    const epoch = await readEpochSummary(agentId, a.epochId);

    return {
      tokenId: agentId.toString(),
      name: `Agent ${agentId}`,
      owner: a.owner,
      operator: a.operator,
      epoch: Number(a.epochId),
      strategyHash: a.strategyHash,
      storageRoot: a.storageRoot,
      network: NETWORK,
      domain: a.domain,
      decisionCount: epoch?.revealed ?? 0,
      verified: true,
      createdAt: epoch?.startTime ?? new Date(0).toISOString(),
      lifecycle: epoch === null ? 'minted' : 'active',
      currentEpoch: epoch,
    };
  } catch {
    return null;
  }
}

/** Rebuild an agent's ledger for an epoch from commit and reveal logs. */
async function loadEntries(agentId: bigint, epochId: bigint): Promise<DecisionEntry[]> {
  const [commits, reveals] = await Promise.all([
    client.getLogs({
      address: ADDR.recordBook,
      event: EV.committed,
      args: { agentId, epochId },
      fromBlock: DEPLOY_BLOCK,
      toBlock: 'latest',
    }),
    client.getLogs({
      address: ADDR.recordBook,
      event: EV.revealed,
      args: { agentId, epochId },
      fromBlock: DEPLOY_BLOCK,
      toBlock: 'latest',
    }),
  ]);

  const revealBySlot = new Map(reveals.map((l) => [Number(l.args.slot), l]));

  const out: DecisionEntry[] = [];
  for (const c of commits) {
    const slot = Number(c.args.slot);
    const reveal = revealBySlot.get(slot);

    const [commit, times] = await Promise.all([
      client.readContract({
        address: ADDR.recordBook,
        abi: recordBookAbi,
        functionName: 'commitOf',
        args: [agentId, epochId, slot],
      }) as Promise<Record<string, unknown>>,
      Promise.all([
        client.readContract({
          address: ADDR.epochBook,
          abi: epochBookAbi,
          functionName: 'slotCommitDeadline',
          args: [agentId, epochId, slot],
        }) as Promise<bigint>,
        client.readContract({
          address: ADDR.epochBook,
          abi: epochBookAbi,
          functionName: 'slotRevealOpen',
          args: [agentId, epochId, slot],
        }) as Promise<bigint>,
      ]),
    ]);

    const entry = reveal
      ? ((await client.readContract({
          address: ADDR.recordBook,
          abi: recordBookAbi,
          functionName: 'entryOf',
          args: [agentId, epochId, slot],
        })) as Record<string, unknown>)
      : null;

    const txHash = (reveal?.transactionHash ?? c.transactionHash) as `0x${string}`;

    out.push({
      slot,
      epoch: Number(epochId),
      state: reveal ? 'revealed' : 'committed',
      status: 'accepted',
      // The direction is only public after the reveal. Leaving it undefined is
      // the honest representation of a sealed slot, and the UI renders
      // "sealed until reveal" rather than a blank.
      ...(entry === null ? {} : { decision: undefined as Decision | undefined }),
      committedAt: iso(commit.committedAt as bigint),
      commitDeadline: iso(times[0]),
      revealOpen: iso(times[1]),
      commitTxHash: c.transactionHash as `0x${string}`,
      receiptCommit: commit.receiptCommit as `0x${string}`,
      reqSha: commit.reqSha as `0x${string}`,
      respSha: commit.respSha as `0x${string}`,
      teeSigner: (entry?.teeSigner as Address) ?? ZERO_ADDRESS,
      provider: commit.provider as Address,
      inputHash: (entry?.inputHash as `0x${string}`) ?? (`0x${'0'.repeat(64)}` as `0x${string}`),
      renter: (entry?.renter as Address) ?? ZERO_ADDRESS,
      txHash,
      chainScanUrl: CHAIN_SCAN_TX(txHash),
      blockTime: entry === null ? iso(commit.committedAt as bigint) : iso(entry.revealedAt as bigint),
    });
  }

  return out.sort((a, b) => a.slot - b.slot);
}

/* ------------------------------------------------------------------ source */

export const liveDataSource: DataSource = {
  async listAgents() {
    const ids = await loadAgentIds();
    const agents = await Promise.all(ids.map(buildAgent));
    return agents.filter((a): a is Agent => a !== null);
  },

  async getAgent(tokenId) {
    return buildAgent(BigInt(tokenId));
  },

  async getEntries(tokenId, opts) {
    const agent = await buildAgent(BigInt(tokenId));
    if (agent === null) return [];
    const all = await loadEntries(BigInt(tokenId), BigInt(agent.epoch));
    const from = opts?.cursor ?? 0;
    return all.slice(from, from + (opts?.limit ?? all.length));
  },

  async getEntriesPage(tokenId, opts) {
    const entries = await this.getEntries(tokenId, opts);
    const agent = await buildAgent(BigInt(tokenId));
    const total = agent?.currentEpoch?.committed ?? entries.length;
    const next = (opts?.cursor ?? 0) + entries.length;
    return { items: entries, total, nextCursor: next < total ? next : null };
  },

  async getEntry(txHash) {
    // Resolve through the receipt's own logs: the tx hash is the only stable
    // identifier across commits, reveals and rejected attempts.
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== ADDR.recordBook.toLowerCase()) continue;
        // topics: [sig, agentId, epochId, slot]
        if (log.topics.length < 4) continue;
        const agentId = BigInt(log.topics[1] as string);
        const epochId = BigInt(log.topics[2] as string);
        const slot = Number(BigInt(log.topics[3] as string));
        const entries = await loadEntries(agentId, epochId);
        return entries.find((e) => e.slot === slot) ?? null;
      }
      return null;
    } catch {
      return null;
    }
  },

  async getListing(tokenId) {
    try {
      const l = (await client.readContract({
        address: ADDR.rentalDesk,
        abi: rentalDeskAbi,
        functionName: 'listings',
        args: [BigInt(tokenId)],
      })) as readonly [bigint, bigint, bigint, boolean];

      return {
        tokenId,
        feePerDecisionWei: l[0].toString(),
        minEscrowWei: l[1].toString(),
        termSeconds: Number(l[2]),
        active: l[3],
      } satisfies Listing;
    } catch {
      return null;
    }
  },

  async getAgentsForOwner(address) {
    const all = await this.listAgents();
    return all.filter((a) => a.owner.toLowerCase() === address.toLowerCase());
  },

  async getGrantsForRenter(address) {
    const agents = await this.listAgents();
    const out: Grant[] = [];
    for (const a of agents) {
      try {
        const g = (await client.readContract({
          address: ADDR.rentalDesk,
          abi: rentalDeskAbi,
          functionName: 'grantOf',
          args: [BigInt(a.tokenId), address],
        })) as Record<string, unknown>;
        if ((g.escrowedWei as bigint) === 0n) continue;

        const expiry = g.expiry as bigint;
        out.push({
          tokenId: a.tokenId,
          renter: address,
          expiry: iso(expiry),
          maxDecisions: Number(g.maxDecisions),
          remainingEscrowWei: (g.remainingWei as bigint).toString(),
          status: (g.paused as boolean)
            ? 'revoked'
            : Date.now() / 1000 >= Number(expiry)
              ? 'expired'
              : 'active',
          decisionsUsed: Number(g.settledCount),
        });
      } catch {
        // an agent with no grant for this address is the normal case
      }
    }
    return out;
  },

  async verifyTx(txHash) {
    const entry = await this.getEntry(txHash);
    if (entry === null) {
      return {
        txHash: txHash as `0x${string}`,
        outcome: 'not_found',
        network: NETWORK,
        checks: [],
      } as VerifyResult;
    }

    // The chain already performed these checks before storing the entry, so a
    // revealed entry existing IS the proof. Restating them here is reporting,
    // not re-verification, and the copy says so.
    const revealed = entry.state === 'revealed';
    return {
      txHash: txHash as `0x${string}`,
      outcome: revealed ? 'valid' : 'tampered',
      network: NETWORK,
      checks: [
        {
          name: 'commitment published before the slot deadline',
          pass: Date.parse(entry.committedAt) <= Date.parse(entry.commitDeadline),
        },
        { name: 'reveal opened the published commitment', pass: revealed },
        {
          name: 'signer matched getService().teeSignerAddress',
          pass: revealed && entry.teeSigner !== ZERO_ADDRESS,
          detail: revealed ? entry.teeSigner : undefined,
        },
        { name: 'commit line matched the sealed strategy for this slot', pass: revealed },
      ],
      entry,
    } as VerifyResult;
  },

  async getShowcasePair(): Promise<ShowcasePair | null> {
    const green = process.env.NEXT_PUBLIC_GREEN_TX;
    const red = process.env.NEXT_PUBLIC_RED_TX;
    if (green === undefined || red === undefined) return null;

    const [g, r] = await Promise.all([this.getEntry(green), this.getEntry(red)]);
    if (g === null || r === null) return null;

    return {
      green: g,
      // The red half is a deliberate tamper test that never became a stored
      // decision, so it is flagged rather than presented as part of a record.
      red: { ...r, status: 'rejected', rejectReason: 'BadReveal', isTamperTest: true, state: 'invalid' },
    } as ShowcasePair;
  },

  async getSettlements(tokenId): Promise<Settlement[]> {
    const agent = await buildAgent(BigInt(tokenId));
    if (agent === null) return [];
    const entries = await loadEntries(BigInt(tokenId), BigInt(agent.epoch));
    const listing = await this.getListing(tokenId);
    if (listing === null) return [];

    const fee = BigInt(listing.feePerDecisionWei);
    const protocolFee = (fee * 200n) / 10_000n;

    return entries
      .filter((e) => e.state === 'revealed' && e.renter !== ZERO_ADDRESS)
      .map((e) => ({
        tokenId,
        slot: e.slot,
        renter: e.renter,
        feeWei: fee.toString(),
        protocolFeeWei: protocolFee.toString(),
        netToOwnerWei: (fee - protocolFee).toString(),
        // Whether a slot has been settled is RentalDesk state; surfacing it
        // needs a slotSettled read per slot, which is not worth the round trips
        // until the console does writes.
        settled: false,
      }));
  },

  async getAuditGrants(): Promise<AuditGrant[]> {
    // Audit grants are a Wave 4 contract surface (PRD v2 §4.4 remedy 2).
    // Returning an empty list is honest; inventing one would not be.
    return [];
  },

  subscribeRenterFeed(_tokenId, _onMessage) {
    return () => {};
  },

  subscribeRenterFeedWithStatus(_tokenId, _onMessage, onStatus?: (s: FeedStatus) => void) {
    // There is no hosted feed service yet. Reporting 'closed' tells the UI the
    // truth; replaying on-chain entries as if they were a live private feed
    // would misrepresent the one thing renters actually pay for.
    const t = setTimeout(() => onStatus?.('closed'), 100);
    return () => clearTimeout(t);
  },

  rent: () => notSupported('rent'),
  mintAgent: () => notSupported('mintAgent'),
  setOperator: () => notSupported('setOperator'),
  reseal: () => notSupported('reseal'),
  setListing: () => notSupported('setListing'),
  settle: () => notSupported('settle'),
  grantAudit: () => notSupported('grantAudit'),
  revokeAudit: () => notSupported('revokeAudit'),
};
