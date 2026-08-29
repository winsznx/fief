/**
 * Print an epoch's schedule, and the one comparison that makes it a schedule
 * rather than a log: it was fixed on chain before its own first slot.
 *
 * Exists because the contracts are not source-verified on ChainScan, so the
 * explorer renders `openEpoch` calldata as raw hex. The most important claim
 * Fief makes had no legible rendering anywhere, which is a poor place to leave
 * it. Reads only; it sends nothing and spends nothing.
 *
 * For a genuinely key-free check use `packages/verify`, which recomputes the
 * same schedule from public RPC data with no wallet at all.
 *
 *   NETWORK=mainnet AGENT=7 EPOCH=0 pnpm schedule
 */

import {hexToString, trim} from 'viem';

import {BookClient} from '../book.js';
import {activeDeployment, requireEnv} from '../config.js';

const AGENT = BigInt(process.env.AGENT ?? '7');
const EPOCH = BigInt(process.env.EPOCH ?? '0');

const KNOWN_MARKETS: Record<string, string> = {
  '0xa92bcb5bc51aa5535ed0cc3f522992dd9a6fb2e8dd6dcf484705d93eb3cd167a': 'BTC-USDT',
};

const utc = (t: bigint | number) =>
  new Date(Number(t) * 1000).toISOString().replace('T', ' ').slice(0, 19);

async function main(): Promise<void> {
  const book = new BookClient(activeDeployment(), requireEnv('PRIVATE_KEY'));
  const [spec, meta] = await Promise.all([
    book.epochSpec(AGENT, EPOCH),
    book.epochMeta(AGENT, EPOCH),
  ]);

  // The market is stored hashed, so the label can only be recovered by knowing
  // the preimage. Resolving the ones we publish beats printing 32 bytes that
  // nobody can read; anything else stays a hash rather than being guessed at.
  let market = spec.market as string;
  const known = KNOWN_MARKETS[market.toLowerCase()];
  if (known !== undefined) {
    market = `${known}  (keccak256)`;
  } else {
    try {
      const ascii = hexToString(trim(spec.market, {dir: 'right'}));
      if (/^[\x20-\x7e]+$/.test(ascii)) market = ascii;
    } catch {
      // An unrecognised hash stays a hash. Not worth failing over.
    }
  }

  const end = Number(spec.startTime) + spec.cadenceSeconds * spec.slotCount;

  console.log(`\nagent ${AGENT}, epoch ${EPOCH} on chain ${book.deployment.network.chainId}\n`);
  console.log(`  market            ${market}`);
  console.log(`  slots scheduled   ${spec.slotCount}`);
  console.log(`  cadence           ${spec.cadenceSeconds}s`);
  console.log(`  commit deadline   ${spec.maxCommitDelay}s after each slot opens`);
  console.log(`  horizon           ${spec.horizonSeconds}s`);
  console.log(`  disclosure delay  ${spec.disclosureDelay}s`);
  console.log(`  strategy          ${spec.strategyHash}`);

  console.log(`\n  schedule fixed    ${utc(meta.openedAt)} UTC`);
  console.log(`  first slot        ${utc(spec.startTime)} UTC`);
  console.log(`  last slot         ${utc(end)} UTC`);

  // The whole argument in one line. If this ever prints the failure branch the
  // epoch is not prospective and nothing downstream of it means anything.
  const lead = Number(spec.startTime) - Number(meta.openedAt);
  console.log(
    lead >= 0
      ? `\n  the schedule was fixed ${lead}s BEFORE its first slot — no outcome existed yet`
      : `\n  FAIL: opened ${-lead}s AFTER its first slot`,
  );

  console.log(`  committed ${meta.committedCount} · revealed ${meta.revealedCount}`);
  console.log(`  completeness ${(await book.completenessBps(AGENT, EPOCH)) / 100}%\n`);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
