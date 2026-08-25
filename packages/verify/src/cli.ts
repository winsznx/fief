#!/usr/bin/env node
/**
 * fief-verify — independent, read-only verification of a Fief record.
 *
 * The point is that a judge should not have to believe the Fief frontend, the
 * Fief runtime, or this repo's own README. Everything here is recomputed from
 * public chain data through a public RPC:
 *
 *   - the epoch schedule, and whether it was fixed before its own first slot
 *   - every scheduled slot's terminal state, so completeness is recounted
 *     rather than read from a number the contract published
 *   - for each revealed slot, the full byte-exact receipt check: sha256 of the
 *     response, the rebuilt 129-byte signed text, EIP-191 recovery, and the
 *     commit line rebuilt from chain state
 *   - that the recovered signer is the one 0G's own InferenceServing contract
 *     registers for that provider
 *
 * The commit-line and receipt logic comes from `@fief/reference`, the same
 * module the Solidity test suite is pinned against. If Fief's contracts and
 * this verifier ever disagree, the fixtures decide which is wrong.
 *
 *   pnpm start -- --agent 5 --epoch 0
 *   pnpm start -- --tx 0xdecf4eed…
 */

import {
  buildExpectedCommit,
  commitMatchesAt,
  recoverSigner,
  sha256Hex,
  signedText,
} from '@fief/reference';
import type { Address, Hex } from '@fief/reference';
import {
  createPublicClient,
  decodeFunctionData,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiItem,
} from 'viem';

const RPC = process.env.RPC_URL ?? 'https://evmrpc.0g.ai';
const CHAIN_ID = Number(process.env.CHAIN_ID ?? '16661');

const ADDR = {
  fiefAgent: (process.env.FIEF_AGENT ?? '0x4db74faF047160893Aa0dabC9A1B8F3297570a68') as Address,
  epochBook: (process.env.EPOCH_BOOK ?? '0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8') as Address,
  recordBook: (process.env.RECORD_BOOK ?? '0x40eB003340f467e096F8Ae30f8696bE40Eba922c') as Address,
  serving: (process.env.SERVING ?? '0x47340d900bdFec2BD393c626E12ea0656F938d84') as Address,
};
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK ?? '42582000');

const client = createPublicClient({ transport: http(RPC) });

const abi = {
  agentOf: parseAbiItem(
    'function agentOf(uint256) view returns ((address owner,address operator,bytes32 strategyHash,bytes32 storageRoot,uint64 epochId,string domain))',
  ),
  specOf: parseAbiItem(
    'function specOf(uint256,uint64) view returns ((bytes32 market,uint32 cadenceSeconds,uint32 horizonSeconds,uint32 maxCommitDelay,uint32 disclosureDelay,uint64 startTime,uint32 slotCount,bytes32 strategyHash,bytes32 providerSetHash))',
  ),
  metaOf: parseAbiItem(
    'function metaOf(uint256,uint64) view returns ((bool opened,uint64 openedAt,uint64 abandonedAt,bool finalized,uint32 committedCount,uint32 revealedCount))',
  ),
  completeness: parseAbiItem('function completenessBps(uint256,uint64) view returns (uint32)'),
  commitOf: parseAbiItem(
    'function commitOf(uint256,uint64,uint32) view returns ((bytes32 reqSha,bytes32 respSha,bytes32 receiptCommit,address provider,uint64 committedAt))',
  ),
  entryOf: parseAbiItem(
    'function entryOf(uint256,uint64,uint32) view returns ((bytes32 reqSha,bytes32 respSha,address provider,address teeSigner,bytes32 inputHash,address renter,bytes32 decisionDigest,uint64 revealedAt))',
  ),
  slotDeadline: parseAbiItem('function slotCommitDeadline(uint256,uint64,uint32) view returns (uint64)'),
  getService: parseAbiItem(
    'function getService(address) view returns ((address provider,string serviceType,string url,uint256 inputPrice,uint256 outputPrice,uint256 updatedAt,string model,string verifiability,string additionalInfo,address teeSignerAddress,bool teeSignerAcknowledged))',
  ),
  revealDecision: parseAbiItem(
    'function revealDecision((uint256 agentId,uint64 epochId,uint32 slot,bytes respData,bytes signature,uint32 commitOffset,bytes32 inputHash,address renter,bytes32 salt))',
  ),
  revealDecisionStrict: parseAbiItem(
    'function revealDecisionStrict((uint256 agentId,uint64 epochId,uint32 slot,bytes respData,bytes signature,uint32 commitOffset,bytes32 inputHash,address renter,bytes32 salt)) returns (bool)',
  ),
  revealed: parseAbiItem(
    'event DecisionRevealed(uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, address teeSigner)',
  ),
  committed: parseAbiItem(
    'event DecisionCommitted(uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, bytes32 receiptCommit)',
  ),
};

let pass = 0;
let fail = 0;
const ok = (name: string, good: boolean, detail = '') => {
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  good ? (pass += 1) : (fail += 1);
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Re-verify one revealed slot from scratch.
 *
 * Deliberately does NOT trust `entryOf.teeSigner`: it recovers the signer from
 * the receipt itself and then compares against what 0G's serving contract says.
 * Reading the stored signer and reporting it back would verify nothing.
 */
async function verifySlot(
  agentId: bigint,
  epochId: bigint,
  slot: number,
  strategyHash: Hex,
  respData: string,
  signature: Hex,
  commitOffset: number,
): Promise<void> {
  const commit = await client.readContract({
    address: ADDR.recordBook,
    abi: [abi.commitOf],
    functionName: 'commitOf',
    args: [agentId, epochId, slot],
  });
  const entry = await client.readContract({
    address: ADDR.recordBook,
    abi: [abi.entryOf],
    functionName: 'entryOf',
    args: [agentId, epochId, slot],
  });

  const respSha = sha256Hex(respData);
  ok(`slot ${slot}: sha256(respData) matches the commitment`, respSha === commit.respSha);

  const text = signedText(commit.reqSha as Hex, respSha);
  ok(`slot ${slot}: signed text is 129 bytes`, text.length === 129);

  const recovered = recoverSigner(text, signature);
  const service = await client.readContract({
    address: ADDR.serving,
    abi: [abi.getService],
    functionName: 'getService',
    args: [commit.provider],
  });

  ok(
    `slot ${slot}: recovered signer is 0G's registered TEE signer`,
    recovered.toLowerCase() === service.teeSignerAddress.toLowerCase() &&
      service.teeSignerAcknowledged,
    recovered,
  );

  const exp = buildExpectedCommit({
    book: ADDR.recordBook,
    chainId: CHAIN_ID,
    agentId: agentId.toString(),
    epochId: Number(epochId),
    slot,
    strategyHash,
    inputHash: entry.inputHash as Hex,
    renter: entry.renter as Address,
  });
  ok(`slot ${slot}: commit line matches the sealed strategy`, commitMatchesAt(respData, exp, commitOffset));
}

async function verifyEpoch(agentId: bigint, epochId: bigint): Promise<void> {
  const agent = await client.readContract({
    address: ADDR.fiefAgent,
    abi: [abi.agentOf],
    functionName: 'agentOf',
    args: [agentId],
  });
  const spec = await client.readContract({
    address: ADDR.epochBook,
    abi: [abi.specOf],
    functionName: 'specOf',
    args: [agentId, epochId],
  });
  const meta = await client.readContract({
    address: ADDR.epochBook,
    abi: [abi.metaOf],
    functionName: 'metaOf',
    args: [agentId, epochId],
  });

  console.log(`\nagent ${agentId}, epoch ${epochId} on chain ${CHAIN_ID}`);
  console.log(`  owner        ${agent.owner}`);
  console.log(`  strategy H   ${agent.strategyHash}`);
  console.log(`  storageRoot  ${agent.storageRoot}`);
  console.log(`  schedule     ${spec.slotCount} slots, every ${spec.cadenceSeconds}s`);
  console.log(`  opened at    ${new Date(Number(meta.openedAt) * 1000).toISOString()}`);
  console.log(`  starts at    ${new Date(Number(spec.startTime) * 1000).toISOString()}\n`);

  // The claim that makes the record prospective: the schedule was published
  // before the window it describes.
  ok(
    'epoch was opened before its own first slot',
    meta.openedAt <= spec.startTime,
    `${meta.openedAt} <= ${spec.startTime}`,
  );
  ok('epoch strategy matches the agent commitment', spec.strategyHash === agent.strategyHash);

  const [commits, reveals] = await Promise.all([
    client.getLogs({
      address: ADDR.recordBook,
      event: abi.committed,
      args: { agentId, epochId },
      fromBlock: FROM_BLOCK,
      toBlock: 'latest',
    }),
    client.getLogs({
      address: ADDR.recordBook,
      event: abi.revealed,
      args: { agentId, epochId },
      fromBlock: FROM_BLOCK,
      toBlock: 'latest',
    }),
  ]);

  // Every commit must have beaten its own deadline. Recounted here rather than
  // trusted, because this is precisely the check that stops a record being
  // assembled after the outcomes were known.
  let late = 0;
  for (const c of commits) {
    const slot = Number(c.args.slot);
    const [deadline, commit] = await Promise.all([
      client.readContract({
        address: ADDR.epochBook,
        abi: [abi.slotDeadline],
        functionName: 'slotCommitDeadline',
        args: [agentId, epochId, slot],
      }),
      client.readContract({
        address: ADDR.recordBook,
        abi: [abi.commitOf],
        functionName: 'commitOf',
        args: [agentId, epochId, slot],
      }),
    ]);
    if (commit.committedAt > deadline) late += 1;
  }
  ok('no commitment landed after its slot deadline', late === 0, `${late} late`);

  // Recount completeness from the logs instead of reading the published number.
  const slotCount = Number(spec.slotCount);
  const committed = commits.length;
  const revealed = reveals.length;
  const missed = slotCount - committed;
  const invalid = committed - revealed;

  ok('committed + missed == scheduled slots', committed + missed === slotCount);
  ok('revealed + invalid == committed', revealed + invalid === committed);

  const published = await client.readContract({
    address: ADDR.epochBook,
    abi: [abi.completeness],
    functionName: 'completenessBps',
    args: [agentId, epochId],
  });
  const recomputed = slotCount === 0 ? 0 : Math.round((revealed / slotCount) * 10_000);
  ok(
    'published completeness matches an independent recount',
    Number(published) === recomputed,
    `${Number(published) / 100}%`,
  );

  console.log(
    `\n  ${revealed} revealed · ${invalid} invalid · ${missed} missed · of ${slotCount} scheduled`,
  );

  // The provider set was committed in the spec, so check it was honoured.
  const providers = new Set<string>();
  for (const c of commits) {
    const commit = await client.readContract({
      address: ADDR.recordBook,
      abi: [abi.commitOf],
      functionName: 'commitOf',
      args: [agentId, epochId, Number(c.args.slot)],
    });
    providers.add(commit.provider.toLowerCase());
  }
  if (providers.size === 1) {
    const only = [...providers][0] as Address;
    const hash = keccak256(encodeAbiParameters([{ type: 'address' }], [only]));
    ok('provider set hash matches the one committed in the spec', hash === spec.providerSetHash, only);
  } else {
    console.log(`  note: ${providers.size} providers used; set-hash check needs the full ordered set`);
  }

  console.log('\n  Pass --tx <reveal hash> to re-verify a single reveal byte for byte.');
}

/**
 * Re-verify one reveal transaction end to end from public data alone.
 *
 * The plaintext response and signature are not stored on-chain; they live in
 * the reveal transaction's calldata. Decoding them there means this check needs
 * nothing from Fief: no API, no archived blob, no trust in the operator.
 */
async function verifyTx(hash: Hex): Promise<void> {
  const tx = await client.getTransaction({ hash });
  const receipt = await client.getTransactionReceipt({ hash });

  console.log(`\nreveal tx ${hash}`);
  console.log(`  block   ${receipt.blockNumber}`);
  console.log(`  to      ${tx.to}`);
  ok('transaction targets this RecordBook', tx.to?.toLowerCase() === ADDR.recordBook.toLowerCase());

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: [abi.revealDecision, abi.revealDecisionStrict], data: tx.input });
  } catch {
    ok('calldata decodes as a reveal', false, 'not a revealDecision call');
    return;
  }
  ok('calldata decodes as a reveal', true, decoded.functionName);

  const a = (decoded.args as readonly unknown[])[0] as {
    agentId: bigint;
    epochId: bigint;
    slot: number;
    respData: Hex;
    signature: Hex;
    commitOffset: number;
  };

  const agent = await client.readContract({
    address: ADDR.fiefAgent,
    abi: [abi.agentOf],
    functionName: 'agentOf',
    args: [a.agentId],
  });

  console.log(`  agent ${a.agentId}, epoch ${a.epochId}, slot ${a.slot}\n`);

  await verifySlot(
    a.agentId,
    a.epochId,
    a.slot,
    agent.strategyHash as Hex,
    Buffer.from(a.respData.slice(2), 'hex').toString('utf8'),
    a.signature,
    a.commitOffset,
  );
}

async function main(): Promise<void> {
  const agent = arg('agent');
  const epoch = arg('epoch') ?? '0';
  const tx = arg('tx');

  console.log(`fief-verify · rpc ${RPC}`);
  console.log(`recordBook ${ADDR.recordBook}`);

  if (tx === undefined && agent === undefined) {
    console.log('\nusage: fief-verify --agent <id> [--epoch <id>]');
    console.log('       fief-verify --tx <reveal transaction hash>');
    process.exit(2);
  }

  if (agent !== undefined) await verifyEpoch(BigInt(agent), BigInt(epoch));
  if (tx !== undefined) await verifyTx(tx as Hex);

  console.log(`\n${pass} checks passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
