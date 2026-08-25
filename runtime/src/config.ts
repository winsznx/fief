/**
 * Runtime configuration (PRD v2 §12).
 *
 * Deliberately split across two networks for P3. Fief's contracts are on 0G
 * testnet 16602 while 0G Compute inference runs on mainnet 16661, because the
 * funded Compute ledger lives on mainnet and creating a testnet one costs a
 * 3 OG minimum we do not have there. P4 collapses the split by putting the
 * contracts on mainnet too, where `getService` resolves the signer live.
 *
 * The consequence for P3 is that the testnet RecordBook cannot resolve a
 * mainnet provider through its local InferenceServing, so the TEE signer is
 * pinned via the documented `pinSigner` escape hatch (PRD v2 §5, §20). That
 * shifts the claim language from "read live from 0G's contract" to "pinned from
 * 0G's attestation, evidence linked", which is exactly what the escape hatch
 * exists to make explicit.
 */

export interface NetworkConfig {
  chainId: number;
  rpc: string;
  explorer: string;
}

export const ZG_MAINNET: NetworkConfig = {
  chainId: 16661,
  rpc: 'https://evmrpc.0g.ai',
  explorer: 'https://chainscan.0g.ai',
};

export const ZG_TESTNET: NetworkConfig = {
  chainId: 16602,
  rpc: 'https://evmrpc-testnet.0g.ai',
  explorer: 'https://chainscan.0g.ai',
};

export interface Deployment {
  network: NetworkConfig;
  fiefAgent: `0x${string}`;
  epochBook: `0x${string}`;
  recordBook: `0x${string}`;
  rentalDesk: `0x${string}`;
}

/** Redeployed 2026-08-25 after the Slither audit fixes (see contracts/SLITHER.md). */
export const TESTNET_DEPLOYMENT: Deployment = {
  network: ZG_TESTNET,
  fiefAgent: '0x8D8A527695E22f3a54ea9D34681C02FE310E3c8C',
  epochBook: '0x4e24bE72a76c014734B444596d15257c968BeD4D',
  recordBook: '0x2F13E70b79cfFc330Df8cccfAc880149749698E1',
  rentalDesk: '0x78C6a6A5A16738bB3Bda6d0C071eA89ec43EaeD8',
};

/**
 * 0G mainnet 16661, deployed 2026-08-25 after the Slither audit.
 *
 * On mainnet the split disappears: Compute and the contracts are on the same
 * chain, so `RecordBook.expectedTeeSigner` resolves the enclave key live from
 * `InferenceServing.getService` and no `pinSigner` override is needed. That is
 * the stronger claim the PRD reserves for mainnet.
 */
export const MAINNET_DEPLOYMENT: Deployment = {
  network: ZG_MAINNET,
  fiefAgent: '0x4db74faF047160893Aa0dabC9A1B8F3297570a68',
  epochBook: '0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8',
  recordBook: '0x40eB003340f467e096F8Ae30f8696bE40Eba922c',
  rentalDesk: '0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57',
};

/** Select by env: NETWORK=mainnet uses 16661, anything else uses testnet. */
export function activeDeployment(): Deployment {
  return process.env.NETWORK === 'mainnet' ? MAINNET_DEPLOYMENT : TESTNET_DEPLOYMENT;
}

/**
 * The TeeML provider proven working on mainnet 2026-08-25 (PRD v2 §0.6.1).
 *
 * `gpt-5.4-mini` (`0x25F8f01c…`) is deliberately excluded: it returns a
 * deterministic 502 `zktls_error` even with a funded sub-account. Provider
 * health is a live variable, which is why the epoch pins a set and the runtime
 * fails over inside the commit deadline rather than trusting one endpoint.
 */
export const PROVIDERS = {
  glm: {
    address: '0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D' as const,
    model: 'glm-5.2',
    teeSigner: '0xA46EA4FC5889AD35A1487e1Ed04dCcfa872146B9' as const,
  },
} as const;

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`missing required env var: ${name}`);
  return v;
}

/** Reasoning models spend the budget before emitting content, so keep headroom. */
export const MAX_TOKENS = Number(process.env.MAX_TOKENS ?? '4096');
