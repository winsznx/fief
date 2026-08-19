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

/** Inference serving (mainnet). Live wiring only — unused in mock mode. */
export const INFERENCE_SERVING_MAINNET = '0x47340d900bdFec2BD393c626E12ea0656F938d84' as const;
