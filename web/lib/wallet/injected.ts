/**
 * InjectedWalletSource — a real EIP-1193 wallet behind the existing interface.
 *
 * The mock implementation stays the default for `NEXT_PUBLIC_DATA_MODE=mock`,
 * because reproducing every wallet state on demand is genuinely useful for
 * screenshots and the demo. This one takes over in live mode, so the deployed
 * product can complete its own central flow rather than describing it.
 *
 * Deliberately no connect-kit dependency. One injected provider is all the rent
 * flow needs, and a modal library would add bundle weight and a second source
 * of truth for connection state.
 */

import { createWalletClient, custom, defineChain } from 'viem';
import type { Address, WalletClient } from 'viem';

import type { WalletSource, WalletState } from './types';

/** Minimal EIP-1193 surface. Avoids depending on a wallet library's types. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

function provider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

export function hasInjectedWallet(): boolean {
  return provider() !== null;
}

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_NETWORK === 'testnet' ? 16602 : 16661);
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://evmrpc.0g.ai';

export const zeroGChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 16661 ? '0G Mainnet' : '0G Galileo Testnet',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: '0G Scan', url: 'https://chainscan.0g.ai' } },
});

/** The wallet client the data layer uses for writes, or null when disconnected. */
export function getWalletClient(): WalletClient | null {
  const eth = provider();
  if (eth === null) return null;
  return createWalletClient({ chain: zeroGChain, transport: custom(eth) });
}

export class InjectedWalletSource implements WalletSource {
  private state: WalletState = { status: 'disconnected' };
  private subscribers = new Set<(s: WalletState) => void>();

  constructor() {
    const eth = provider();
    if (eth?.on === undefined) return;

    // Track the wallet rather than assuming our own last write is still true.
    // A user switching account or network in their extension must not leave the
    // UI showing an address that can no longer sign.
    eth.on('accountsChanged', ((accounts: string[]) => {
      this.set(
        accounts.length === 0
          ? { status: 'disconnected' }
          : { ...this.state, status: 'connected', address: accounts[0] as Address },
      );
    }) as never);

    eth.on('chainChanged', ((hex: string) => {
      this.set({ ...this.state, chainId: Number.parseInt(hex, 16) });
    }) as never);
  }

  private set(s: WalletState): void {
    this.state = s;
    for (const cb of this.subscribers) cb(s);
  }

  getState(): WalletState {
    return this.state;
  }

  subscribe(cb: (s: WalletState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  async connect(): Promise<void> {
    const eth = provider();
    if (eth === null) throw new Error('No wallet found. Install MetaMask or another EIP-1193 wallet.');

    this.set({ status: 'connecting' });
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      const chainHex = (await eth.request({ method: 'eth_chainId' })) as string;
      if (accounts.length === 0) throw new Error('Wallet returned no accounts');

      this.set({
        status: 'connected',
        address: accounts[0] as Address,
        chainId: Number.parseInt(chainHex, 16),
      });
    } catch (e) {
      this.set({ status: 'disconnected' });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    // EIP-1193 has no disconnect. Clearing local state is the honest extent of
    // what a dapp can do; the wallet keeps its own permission.
    this.set({ status: 'disconnected' });
  }

  async switchChain(chainId: number): Promise<void> {
    const eth = provider();
    if (eth === null) throw new Error('No wallet found');
    const hex = `0x${chainId.toString(16)}`;

    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (e) {
      // 4902 means the wallet has never heard of this chain, which is the
      // common case for 0G. Add it, then the switch succeeds.
      if ((e as { code?: number }).code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hex,
              chainName: zeroGChain.name,
              nativeCurrency: zeroGChain.nativeCurrency,
              rpcUrls: [RPC],
              blockExplorerUrls: ['https://chainscan.0g.ai'],
            },
          ],
        });
      } else {
        throw e;
      }
    }
    this.set({ ...this.state, chainId });
  }
}
