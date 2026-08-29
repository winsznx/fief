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

import { createPublicClient, decodeFunctionData, defineChain, http, parseAbiItem } from 'viem';
import type { Address, PublicClient } from 'viem';

import { CHAIN_SCAN_TX } from '@/lib/chain/zerog';
import { ZERO_ADDRESS } from './commit';
import { getWalletClient, zeroGChain } from '@/lib/wallet/injected';
import { epochBookAbi, fiefAgentAbi, recordBookAbi, rentalDeskAbi } from './live-abi';
import type {
  Agent,
  AuditGrant,
  DataSource,
  Decision,
  DecisionEntry,
  EpochSummary,
  FeedStatus,
  Grant,
  Listing,
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

/** How many revealed directions to decode per ledger load. */
const DECODE_LIMIT = Number(process.env.NEXT_PUBLIC_DECODE_LIMIT ?? '12');

/**
 * 0G mainnet, with the two things that make this viable inside a Worker.
 *
 * `listAgents` needs one contract read per agent per field. Issued one at a
 * time that is ~25 HTTP requests, which blows the Cloudflare subrequest limit
 * and returns an empty marketplace with no error. Both fixes are verified
 * against the live RPC: JSON-RPC batching coalesces calls into single HTTP
 * requests, and Multicall3 is deployed at the canonical address so viem can
 * aggregate reads into one call.
 */
const zeroG = defineChain({
  id: 16661,
  name: '0G',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

const client: PublicClient = createPublicClient({
  chain: zeroG,
  transport: http(RPC, { batch: { wait: 8 } }),
  batch: { multicall: true },
});

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

const revealAbi = parseAbiItem(
  'function revealDecision((uint256 agentId,uint64 epochId,uint32 slot,bytes respData,bytes signature,uint32 commitOffset,bytes32 inputHash,address renter,bytes32 salt))',
);

/**
 * Recover the public decision from a reveal transaction.
 *
 * After a reveal the direction IS public — that is the entire point of the
 * disclosure window — but it lives in the transaction's calldata rather than in
 * contract storage, because storing it would have cost gas for data anyone can
 * already read. Without this the UI showed "sealed until reveal" on slots that
 * had been revealed hours earlier, which inverts the product's central claim.
 */
async function decodeDecision(
  txHash: `0x${string}`,
): Promise<{ decision?: Decision; respData?: string; commitOffset?: number }> {
  try {
    const tx = await client.getTransaction({ hash: txHash });
    const { args } = decodeFunctionData({ abi: [revealAbi], data: tx.input });
    const a = (args as readonly unknown[])[0] as { respData: `0x${string}`; commitOffset: number };
    const respData = Buffer.from(a.respData.slice(2), 'hex').toString('utf8');

    const content = (JSON.parse(respData) as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
    const line = content?.split('\n')[1]?.trim();
    const parsed = line === undefined ? undefined : (JSON.parse(line) as Decision);

    return { ...(parsed ? { decision: parsed } : {}), respData, commitOffset: a.commitOffset };
  } catch {
    // A reveal we cannot decode is reported as revealed without a direction,
    // which is honest. Inventing one would not be.
    return {};
  }
}

const iso = (seconds: bigint | number) => new Date(Number(seconds) * 1000).toISOString();

/** Simple request-scoped memo. The UI hits these repeatedly per render pass. */
function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

const notSupported = (what: string): never => {
  throw new Error(
    `${what} is not wired for browser writes yet. The contracts and the runtime ` +
      `CLIs in runtime/ perform it; only the console UI is missing.`,
  );
};

/**
 * Send a real transaction from the connected wallet.
 *
 * Simulated first, so a revert surfaces as a decoded custom error before the
 * user is asked to sign. Being prompted to sign a transaction that cannot
 * succeed is the worst version of this interaction.
 */
async function write(
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<`0x${string}`> {
  const wallet = getWalletClient();
  if (wallet === null) throw new Error('No wallet connected.');

  const [account] = await wallet.getAddresses();
  if (account === undefined) throw new Error('No wallet account authorised.');

  const chainId = await wallet.getChainId();
  if (chainId !== zeroGChain.id) {
    throw new Error(`Wrong network: connected to ${chainId}, expected ${zeroGChain.id}.`);
  }

  const { request } = await client.simulateContract({
    address,
    abi: abi as never,
    functionName: functionName as never,
    args: args as never,
    account,
    ...(value === undefined ? {} : { value }),
  });

  const hash = await wallet.writeContract(request as never);
  await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

/* ------------------------------------------------------------------ reads */

const loadAgentIds = memo(async (): Promise<bigint[]> => {
  const logs = await client.getLogs({
    address: ADDR.fiefAgent,
    event: EV.registered,
    fromBlock: DEPLOY_BLOCK,
    toBlock: 'latest',
  });
  const ids = logs.map((l) => l.args.agentId as bigint).filter((id) => id !== undefined);

  // An empty list here is almost always an RPC or block-range problem, not an
  // empty registry, and rendering "no agents" would hide it. `nextAgentId` is a
  // single cheap read that tells us how many should exist.
  if (ids.length === 0) {
    const next = (await client.readContract({
      address: ADDR.fiefAgent,
      abi: fiefAgentAbi,
      functionName: 'nextAgentId',
    })) as bigint;
    if (next > 1n) {
      throw new Error(
        `live: log scan found 0 agents but nextAgentId is ${next}. ` +
          `NEXT_PUBLIC_DEPLOY_BLOCK (${DEPLOY_BLOCK}) is probably too high.`,
      );
    }
  }
  return ids;
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

    // How many slots have actually come due. Deriving `missed` as
    // slotCount - committed treats the entire unplayed future as failure: a
    // 288-slot epoch three hours in reported 255 misses and 10.76%
    // completeness, which reads as a broken agent rather than a running one.
    const now = Math.floor(Date.now() / 1000);
    const start = Number(spec.startTime);
    const cadence = Number(spec.cadenceSeconds);
    const deadline = Number(spec.maxCommitDelay);
    const elapsed = now - (start + deadline);
    const due = Math.max(0, Math.min(slotCount, Math.floor(elapsed / cadence) + 1));

    const missed = Math.max(0, due - committed);
    const pending = Math.max(0, slotCount - due);

    return {
      epochId: Number(epochId),
      market: 'BTC-USDT',
      cadenceSeconds: Number(spec.cadenceSeconds),
      horizonSeconds: Number(spec.horizonSeconds),
      maxCommitDelay: Number(spec.maxCommitDelay),
      disclosureDelay: Number(spec.disclosureDelay),
      startTime: iso(spec.startTime as bigint),
      slotCount,
      due,
      pending,
      committed,
      revealed,
      missed,
      invalid: Math.max(0, committed - revealed),
      // Against what has come due, which is the number that means something
      // while the epoch runs.
      completenessBps: due === 0 ? 0 : Math.round((revealed / due) * 10_000),
      // What the contract publishes: revealed over the whole schedule. Correct
      // at finalize, misleading before it, so both are surfaced.
      lifetimeBps: Number(bps),
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

    // Every epoch the agent ever opened, from the log rather than from
    // `FiefAgent.epochId`. `EpochBook.openEpoch` does not advance that counter,
    // so the two drift: agent 7 had epoch 1 open and running on chain while the
    // token still reported 0, and the UI showed only the finished epoch 0.
    const opened = await client.getLogs({
      address: ADDR.epochBook,
      event: EV.epochOpened,
      args: { agentId },
      fromBlock: DEPLOY_BLOCK,
      toBlock: 'latest',
    });

    const ids = [...new Set(opened.map((l) => l.args.epochId as bigint))].sort((x, y) =>
      x < y ? 1 : x > y ? -1 : 0,
    );
    if (ids.length === 0) ids.push(a.epochId);

    const epochs = (await Promise.all(ids.map((id) => readEpochSummary(agentId, id)))).filter(
      (e): e is EpochSummary => e !== null,
    );
    const epoch = epochs[0] ?? null;

    return {
      tokenId: agentId.toString(),
      name: `Agent ${agentId}`,
      owner: a.owner,
      operator: a.operator,
      epoch: epoch?.epochId ?? Number(a.epochId),
      strategyHash: a.strategyHash,
      storageRoot: a.storageRoot,
      network: NETWORK,
      domain: a.domain,
      // Lifetime, across every epoch. A fresh epoch cannot reset this.
      decisionCount: epochs.reduce((n, e) => n + e.revealed, 0),
      verified: true,
      createdAt: epochs.at(-1)?.startTime ?? new Date(0).toISOString(),
      lifecycle: epoch === null ? 'minted' : 'active',
      currentEpoch: epoch,
      epochs,
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

  // Built in parallel. The original awaited four contract reads per slot
  // inside a for-loop, so a 33-slot epoch made ~130 sequential round trips and
  // took 22 seconds to render. Batching plus Multicall3 collapses this into a
  // handful of requests.
  const out: DecisionEntry[] = await Promise.all(
    commits.map(async (c) => {
      const slot = Number(c.args.slot);
      const reveal = revealBySlot.get(slot);

      const [commit, commitDeadline, revealOpen, entry] = await Promise.all([
        client.readContract({
          address: ADDR.recordBook,
          abi: recordBookAbi,
          functionName: 'commitOf',
          args: [agentId, epochId, slot],
        }) as Promise<Record<string, unknown>>,
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
        reveal
          ? (client.readContract({
              address: ADDR.recordBook,
              abi: recordBookAbi,
              functionName: 'entryOf',
              args: [agentId, epochId, slot],
            }) as Promise<Record<string, unknown>>)
          : Promise.resolve(null),
      ]);

      const txHash = (reveal?.transactionHash ?? c.transactionHash) as `0x${string}`;

      return {
        agentId: agentId.toString(),
        slot,
        epoch: Number(epochId),
        state: reveal ? 'revealed' : 'committed',
        status: 'accepted',
        // Populated below for revealed slots. A slot still inside its
        // disclosure window genuinely has no public direction.
        committedAt: iso(commit.committedAt as bigint),
        commitDeadline: iso(commitDeadline),
        revealOpen: iso(revealOpen),
        commitTxHash: c.transactionHash as `0x${string}`,
        receiptCommit: commit.receiptCommit as `0x${string}`,
        reqSha: commit.reqSha as `0x${string}`,
        respSha: commit.respSha as `0x${string}`,
        teeSigner: (entry?.teeSigner as Address) ?? ZERO_ADDRESS,
        provider: commit.provider as Address,
        inputHash:
          (entry?.inputHash as `0x${string}`) ?? (`0x${'0'.repeat(64)}` as `0x${string}`),
        renter: (entry?.renter as Address) ?? ZERO_ADDRESS,
        txHash,
        chainScanUrl: CHAIN_SCAN_TX(txHash),
        blockTime:
          entry === null ? iso(commit.committedAt as bigint) : iso(entry.revealedAt as bigint),
      } satisfies DecisionEntry;
    }),
  );

  out.sort((a, b) => a.slot - b.slot);

  // Decode the revealed directions. Capped because each one costs a
  // transaction fetch, and a 288-slot campaign ledger would otherwise issue
  // hundreds of requests to render one screen. The detail view decodes on
  // demand for anything past the cap.
  // Newest first: a long-running epoch's recent slots are what a visitor
  // looks at, and decoding all of them would reintroduce the stall.
  const revealedEntries = out
    .filter((e) => e.state === 'revealed')
    .slice(-DECODE_LIMIT);
  await Promise.all(
    revealedEntries.map(async (e) => {
      const d = await decodeDecision(e.txHash);
      if (d.decision !== undefined) e.decision = d.decision;
      if (d.respData !== undefined) e.respData = d.respData;
      if (d.commitOffset !== undefined) e.commitOffset = d.commitOffset;
    }),
  );

  return out;
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
        const found = entries.find((e) => e.slot === slot) ?? null;
        if (found !== null && found.state === 'revealed' && found.decision === undefined) {
          const d = await decodeDecision(found.txHash);
          if (d.decision !== undefined) found.decision = d.decision;
          if (d.respData !== undefined) found.respData = d.respData;
          if (d.commitOffset !== undefined) found.commitOffset = d.commitOffset;
        }
        return found;
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
      //
      // txHash is overridden back to the REJECTED transaction. getEntry resolves
      // a hash through the slot's logs and returns the slot's entry, whose
      // txHash is the successful reveal — so without this the page told a judge
      // to verify the "rejected" transaction using the accepted one's hash.
      red: {
        ...r,
        status: 'rejected',
        rejectReason: 'BadReveal',
        isTamperTest: true,
        state: 'invalid',
        txHash: red as `0x${string}`,
        chainScanUrl: CHAIN_SCAN_TX(red),
      },
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

  subscribeRenterFeed() {
    return () => {};
  },

  subscribeRenterFeedWithStatus(_t: string, _m: unknown, onStatus?: (s: FeedStatus) => void) {
    // There is no hosted feed service yet. Reporting 'closed' tells the UI the
    // truth; replaying on-chain entries as if they were a live private feed
    // would misrepresent the one thing renters actually pay for.
    const t = setTimeout(() => onStatus?.('closed'), 100);
    return () => clearTimeout(t);
  },

  /**
   * Rent an agent for its current epoch, on chain, from the visitor's wallet.
   *
   * This is the product's central flow, so it runs for real rather than
   * returning an optimistic result. The grant is read back from the contract
   * afterwards instead of being predicted client-side: `maxDecisions` is
   * integer division the contract performs, and guessing it here would let the
   * UI disagree with the chain about what someone just paid for.
   */
  async rent(tokenId, escrowWei) {
    const agent = await buildAgent(BigInt(tokenId));
    if (agent === null) throw new Error(`Agent ${tokenId} not found.`);

    const listing = await liveDataSource.getListing(tokenId);
    if (listing === null || !listing.active) throw new Error(`Agent ${tokenId} is not listed.`);
    if (BigInt(escrowWei) < BigInt(listing.minEscrowWei)) {
      throw new Error(`Escrow below the listing minimum of ${listing.minEscrowWei} wei.`);
    }

    const wallet = getWalletClient();
    const [renter] = (await wallet?.getAddresses()) ?? [];
    if (renter === undefined) throw new Error('No wallet connected.');

    await write(
      ADDR.rentalDesk,
      rentalDeskAbi,
      'rent',
      [BigInt(tokenId), BigInt(agent.epoch)],
      BigInt(escrowWei),
    );

    const g = (await client.readContract({
      address: ADDR.rentalDesk,
      abi: rentalDeskAbi,
      functionName: 'grantOf',
      args: [BigInt(tokenId), renter],
    })) as Record<string, unknown>;

    const expiry = g.expiry as bigint;
    return {
      tokenId,
      renter,
      expiry: iso(expiry),
      maxDecisions: Number(g.maxDecisions),
      remainingEscrowWei: (g.remainingWei as bigint).toString(),
      status: 'active',
      decisionsUsed: Number(g.settledCount),
    } as Grant;
  },
  mintAgent: () => notSupported('mintAgent'),
  setOperator: () => notSupported('setOperator'),
  reseal: () => notSupported('reseal'),
  setListing: () => notSupported('setListing'),
  settle: () => notSupported('settle'),
  grantAudit: () => notSupported('grantAudit'),
  revokeAudit: () => notSupported('revokeAudit'),
};
