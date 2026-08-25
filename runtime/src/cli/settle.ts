/**
 * Settle revealed slots against a renter's grant, then withdraw.
 *
 * A real operator task, not a demo script: settlement is how an author gets
 * paid, and it has to be runnable on its own because the rental flow and the
 * settlement cadence are independent. A renter might consume decisions for a
 * week before anyone settles.
 *
 * Only REVEALED slots that name this renter can be settled, so running it early
 * or against the wrong slots is safe: the contract simply finds nothing owed.
 *
 *   NETWORK=mainnet AGENT=6 RENTER=0x… SLOTS=0,1,2 pnpm settle
 */

import {formatEther} from 'viem';
import type {Hex as ViemHex} from 'viem';

import {BookClient} from '../book.js';
import {activeDeployment, requireEnv} from '../config.js';

const og = (v: bigint) => `${formatEther(v)} OG`;
const log = (...a: unknown[]) => console.log(...a);

async function main(): Promise<void> {
  const book = new BookClient(activeDeployment(), requireEnv('PRIVATE_KEY'));
  const agentId = BigInt(requireEnv('AGENT'));
  const epochId = BigInt(process.env.EPOCH ?? '0');
  const renter = requireEnv('RENTER') as ViemHex;
  const slots = (process.env.SLOTS ?? '0').split(',').map((s) => Number(s.trim()));

  log(`network ${book.deployment.network.chainId}  agent ${agentId}  epoch ${epochId}`);
  log(`renter  ${renter}`);

  const revealed: number[] = [];
  for (const s of slots) {
    const ok = await book.isRevealed(agentId, epochId, s);
    log(`   slot ${s}: ${ok ? 'revealed' : 'not revealed, skipping'}`);
    if (ok) revealed.push(s);
  }
  if (revealed.length === 0) {
    log('nothing revealed to settle yet');
    return;
  }

  const before = await book.grantOf(agentId, renter);
  log(
    `\ngrant before: escrow ${og(before.escrowedWei)}, remaining ${og(before.remainingWei)}, settled ${before.settledCount}/${before.maxDecisions}`,
  );

  const tx = await book.settle(agentId, renter, revealed);
  log(`settle       ${book.txUrl(tx)}`);

  const after = await book.grantOf(agentId, renter);
  log(
    `grant after : remaining ${og(after.remainingWei)}, settledWei ${og(after.settledWei)}, settled ${after.settledCount}/${after.maxDecisions}`,
  );

  const owed = await book.withdrawable(book.account.address as ViemHex);
  log(`\nowner withdrawable ${og(owed)}`);
  if (owed > 0n) {
    // Pull payment: settlement credits, the payee withdraws. A payee that
    // cannot accept ETH can only break their own withdrawal, never settlement.
    const w = await book.withdraw();
    log(`withdraw     ${book.txUrl(w)}`);
    log(`remaining owed ${og(await book.withdrawable(book.account.address as ViemHex))}`);
  }
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
