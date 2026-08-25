/**
 * Chain client for the Fief contracts (PRD v2 §12).
 *
 * Wraps the commit and reveal calls, and the epoch lifecycle. Uses viem rather
 * than the ethers instance the Compute SDK requires, because the two live on
 * different networks in P3 and mixing them in one provider would be a
 * foot-gun.
 */

import {createPublicClient, createWalletClient, defineChain, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Hex as ViemHex, PublicClient, WalletClient} from 'viem';

import {epochBookAbi, fiefAgentAbi, recordBookAbi, rentalDeskAbi} from './abi.js';
import type {Deployment} from './config.js';

export interface EpochSpecArgs {
  market: ViemHex;
  cadenceSeconds: number;
  horizonSeconds: number;
  maxCommitDelay: number;
  disclosureDelay: number;
  startTime: bigint;
  slotCount: number;
  strategyHash: ViemHex;
  providerSetHash: ViemHex;
}

export class BookClient {
  readonly account;
  private readonly chain;
  private readonly pub: PublicClient;
  private readonly wallet: WalletClient;

  constructor(
    readonly deployment: Deployment,
    privateKey: string,
  ) {
    this.account = privateKeyToAccount(
      (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as ViemHex,
    );
    this.chain = defineChain({
      id: deployment.network.chainId,
      name: `0G ${deployment.network.chainId}`,
      nativeCurrency: {name: '0G', symbol: 'OG', decimals: 18},
      rpcUrls: {default: {http: [deployment.network.rpc]}},
    });
    const transport = http(deployment.network.rpc);
    this.pub = createPublicClient({chain: this.chain, transport});
    this.wallet = createWalletClient({account: this.account, chain: this.chain, transport});
  }

  txUrl(hash: string): string {
    return `${this.deployment.network.explorer}/tx/${hash}`;
  }

  private async send(
    address: ViemHex,
    abi: readonly unknown[],
    functionName: string,
    args: readonly unknown[],
  ): Promise<ViemHex> {
    // Simulate first so a revert surfaces as a decoded custom error rather than
    // as a failed transaction the operator has to go and dig out of a receipt.
    const {request} = await this.pub.simulateContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
      args: args as never,
      account: this.account,
    });
    const hash = await this.wallet.writeContract(request as never);
    await this.pub.waitForTransactionReceipt({hash, timeout: 120_000});
    return hash;
  }

  private async sendValue(
    address: ViemHex,
    abi: readonly unknown[],
    functionName: string,
    args: readonly unknown[],
    value: bigint,
  ): Promise<ViemHex> {
    const {request} = await this.pub.simulateContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
      args: args as never,
      account: this.account,
      value,
    });
    const hash = await this.wallet.writeContract(request as never);
    await this.pub.waitForTransactionReceipt({hash, timeout: 120_000});
    return hash;
  }

  /* -------------------------------- agent ---------------------------------- */

  async register(strategyHash: ViemHex, storageRoot: ViemHex, domain: string) {
    const agentId = (await this.pub.readContract({
      address: this.deployment.fiefAgent,
      abi: fiefAgentAbi,
      functionName: 'nextAgentId',
    })) as bigint;
    const hash = await this.send(this.deployment.fiefAgent, fiefAgentAbi, 'register', [
      strategyHash,
      storageRoot,
      domain,
    ]);
    return {agentId, hash};
  }

  setOperator(agentId: bigint, operator: ViemHex) {
    return this.send(this.deployment.fiefAgent, fiefAgentAbi, 'setOperator', [agentId, operator]);
  }

  /* -------------------------------- epoch ---------------------------------- */

  openEpoch(agentId: bigint, epochId: bigint, spec: EpochSpecArgs, providers: ViemHex[]) {
    return this.send(this.deployment.epochBook, epochBookAbi, 'openEpoch', [
      agentId,
      epochId,
      spec,
      providers,
    ]);
  }

  pinProviders(agentId: bigint, epochId: bigint, providers: ViemHex[]) {
    return this.send(this.deployment.epochBook, epochBookAbi, 'pinProviders', [
      agentId,
      epochId,
      providers,
    ]);
  }

  async slotTimes(agentId: bigint, epochId: bigint, slot: number) {
    const read = (fn: 'slotSnapshotTime' | 'slotCommitDeadline' | 'slotRevealOpen') =>
      this.pub.readContract({
        address: this.deployment.epochBook,
        abi: epochBookAbi,
        functionName: fn,
        args: [agentId, epochId, slot],
      }) as Promise<bigint>;

    const [snapshotAt, commitDeadline, revealOpen] = await Promise.all([
      read('slotSnapshotTime'),
      read('slotCommitDeadline'),
      read('slotRevealOpen'),
    ]);
    return {snapshotAt, commitDeadline, revealOpen};
  }

  finalizeEpoch(agentId: bigint, epochId: bigint) {
    return this.send(this.deployment.epochBook, epochBookAbi, 'finalizeEpoch', [agentId, epochId]);
  }

  async epochMeta(agentId: bigint, epochId: bigint) {
    return (await this.pub.readContract({
      address: this.deployment.epochBook,
      abi: epochBookAbi,
      functionName: 'metaOf',
      args: [agentId, epochId],
    })) as {
      opened: boolean;
      abandonedAt: bigint;
      finalized: boolean;
      committedCount: number;
      revealedCount: number;
    };
  }

  async completenessBps(agentId: bigint, epochId: bigint) {
    return (await this.pub.readContract({
      address: this.deployment.epochBook,
      abi: epochBookAbi,
      functionName: 'completenessBps',
      args: [agentId, epochId],
    })) as number;
  }

  /* -------------------------------- record --------------------------------- */

  commitDecision(args: {
    agentId: bigint;
    epochId: bigint;
    slot: number;
    reqSha: ViemHex;
    respSha: ViemHex;
    receiptCommit: ViemHex;
    provider: ViemHex;
  }) {
    return this.send(this.deployment.recordBook, recordBookAbi, 'commitDecision', [
      args.agentId,
      args.epochId,
      args.slot,
      args.reqSha,
      args.respSha,
      args.receiptCommit,
      args.provider,
    ]);
  }

  revealDecision(args: {
    agentId: bigint;
    epochId: bigint;
    slot: number;
    respData: ViemHex;
    signature: ViemHex;
    commitOffset: number;
    inputHash: ViemHex;
    renter: ViemHex;
    salt: ViemHex;
  }) {
    return this.send(this.deployment.recordBook, recordBookAbi, 'revealDecision', [args]);
  }

  /// Demo variant: emits DecisionRejected instead of reverting, so the red
  /// transaction reads as a successful tx on the explorer rather than a failure.
  revealDecisionStrict(args: {
    agentId: bigint;
    epochId: bigint;
    slot: number;
    respData: ViemHex;
    signature: ViemHex;
    commitOffset: number;
    inputHash: ViemHex;
    renter: ViemHex;
    salt: ViemHex;
  }) {
    return this.send(this.deployment.recordBook, recordBookAbi, 'revealDecisionStrict', [args]);
  }

  pinSigner(provider: ViemHex, signer: ViemHex, evidenceURI: string) {
    return this.send(this.deployment.recordBook, recordBookAbi, 'pinSigner', [
      provider,
      signer,
      evidenceURI,
    ]);
  }

  async expectedTeeSigner(provider: ViemHex) {
    return (await this.pub.readContract({
      address: this.deployment.recordBook,
      abi: recordBookAbi,
      functionName: 'expectedTeeSigner',
      args: [provider],
    })) as ViemHex;
  }

  /**
   * Ask the contract for the exact bytes it will memcmp.
   *
   * Comparing this against the reference model's `buildExpectedCommit` before
   * spending gas is how a byte-level drift between the two implementations
   * surfaces as a readable diff instead of an opaque `BadCommit` revert.
   */
  async expectedCommitBytes(args: {
    agentId: bigint;
    epochId: bigint;
    slot: number;
    strategyHash: ViemHex;
    inputHash: ViemHex;
    renter: ViemHex;
  }) {
    return (await this.pub.readContract({
      address: this.deployment.recordBook,
      abi: recordBookAbi,
      functionName: 'expectedCommitBytes',
      args: [args.agentId, args.epochId, args.slot, args.strategyHash, args.inputHash, args.renter],
    })) as ViemHex;
  }

  /** The sealed commitment the chain holds for a slot, before any reveal. */
  async commitOf(agentId: bigint, epochId: bigint, slot: number) {
    return (await this.pub.readContract({
      address: this.deployment.recordBook,
      abi: recordBookAbi,
      functionName: 'commitOf',
      args: [agentId, epochId, slot],
    })) as {
      reqSha: ViemHex;
      respSha: ViemHex;
      receiptCommit: ViemHex;
      provider: ViemHex;
      committedAt: bigint;
    };
  }

  async isRevealed(agentId: bigint, epochId: bigint, slot: number) {
    return (await this.pub.readContract({
      address: this.deployment.recordBook,
      abi: recordBookAbi,
      functionName: 'isRevealed',
      args: [agentId, epochId, slot],
    })) as boolean;
  }

  /* -------------------------------- rental --------------------------------- */

  list(agentId: bigint, feePerDecisionWei: bigint, minEscrowWei: bigint, termSeconds: bigint) {
    return this.send(this.deployment.rentalDesk, rentalDeskAbi, 'list', [
      agentId,
      feePerDecisionWei,
      minEscrowWei,
      termSeconds,
    ]);
  }

  rent(agentId: bigint, epochId: bigint, valueWei: bigint) {
    return this.sendValue(
      this.deployment.rentalDesk,
      rentalDeskAbi,
      'rent',
      [agentId, epochId],
      valueWei,
    );
  }

  settle(agentId: bigint, renter: ViemHex, slots: number[]) {
    return this.send(this.deployment.rentalDesk, rentalDeskAbi, 'settle', [agentId, renter, slots]);
  }

  withdraw() {
    return this.send(this.deployment.rentalDesk, rentalDeskAbi, 'withdraw', []);
  }

  async withdrawable(payee: ViemHex): Promise<bigint> {
    return (await this.pub.readContract({
      address: this.deployment.rentalDesk,
      abi: rentalDeskAbi,
      functionName: 'withdrawable',
      args: [payee],
    })) as bigint;
  }

  async grantOf(agentId: bigint, renter: ViemHex) {
    return (await this.pub.readContract({
      address: this.deployment.rentalDesk,
      abi: rentalDeskAbi,
      functionName: 'grantOf',
      args: [agentId, renter],
    })) as {
      epochId: bigint;
      expiry: bigint;
      maxDecisions: number;
      settledCount: number;
      escrowedWei: bigint;
      remainingWei: bigint;
      settledWei: bigint;
      refundedWei: bigint;
      paused: boolean;
    };
  }

  /** Plain value transfer, used to fund the demo renter wallet. */
  async sendNative(to: ViemHex, valueWei: bigint): Promise<ViemHex> {
    const hash = await this.wallet.sendTransaction({
      account: this.account,
      chain: this.chain,
      to,
      value: valueWei,
    });
    await this.pub.waitForTransactionReceipt({hash, timeout: 120_000});
    return hash;
  }

  async now(): Promise<bigint> {
    const block = await this.pub.getBlock();
    return block.timestamp;
  }

  async balance(): Promise<bigint> {
    return this.pub.getBalance({address: this.account.address});
  }
}
