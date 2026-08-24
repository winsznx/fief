import { defineChain } from 'viem';

export const zeroGMainnet = defineChain({
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: { default: { name: 'ChainScan', url: 'https://chainscan.0g.ai' } },
});

export const zeroGTestnet = defineChain({
  id: 16602,
  name: '0G Testnet (Galileo)',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: { default: { name: 'ChainScan (testnet)', url: 'https://chainscan-galileo.0g.ai' } },
});

export const CHAIN_SCAN_TX = (txHash: string, network: 'mainnet' | 'testnet' = 'mainnet') =>
  network === 'mainnet'
    ? `https://chainscan.0g.ai/tx/${txHash}`
    : `https://chainscan-galileo.0g.ai/tx/${txHash}`;

/**
 * A 32-byte transaction hash.
 *
 * The single validator for it, because v1.1 (Q1) makes txHash the routing key
 * for entry detail: the deep-linked route, the intercepting sheet and
 * `verifyTx` must all accept and reject exactly the same strings, or a link
 * that verifies would 404 (or worse, the reverse).
 */
export const TX_HASH_RE = /^0x[0-9a-f]{64}$/i;

export function isTxHash(value: string): value is `0x${string}` {
  return TX_HASH_RE.test(value);
}

/**
 * A 20-byte address.
 *
 * Case-insensitive on purpose: EIP-55 checksums are an integrity nicety, and
 * rejecting a correctly-typed all-lowercase address (which is what every
 * explorer and the fixtures themselves emit) would be a worse form failure than
 * accepting an unchecksummed one.
 */
export const ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

export function isAddress(value: string): value is `0x${string}` {
  return ADDRESS_RE.test(value);
}

/** Inference serving (mainnet). Live wiring only — unused in mock mode. */
export const INFERENCE_SERVING_MAINNET = '0x47340d900bdFec2BD393c626E12ea0656F938d84' as const;
