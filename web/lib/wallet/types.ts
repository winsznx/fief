/**
 * WalletSource — plan §4.1 / D3.
 *
 * Nothing in DataSource v1.0 supplied the address that `getAgentsForOwner`
 * and `getGrantsForRenter` require, and no wallet layer existed. This mirrors
 * the DataSource pattern: components depend only on this interface, so the
 * owner can drop a wagmi-backed implementation in behind it without touching
 * a single component.
 *
 * Handoff §5.5 / §5.7 require wallet WRITES to stay stubbed, so the mock
 * implementation is the correct default for this pass — it also makes every
 * wallet state (disconnected / connected / wrong-network) reproducible on
 * demand for screenshots and the demo video, which a real connect kit does
 * not.
 */

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletState {
  status: WalletStatus;
  address?: `0x${string}`;
  chainId?: number;
}

/** Named personas the dev switcher can assume. Mock-only concept. */
export type WalletPersona = 'disconnected' | 'owner' | 'renter' | 'wrong-network';

export interface WalletSource {
  getState(): WalletState;
  subscribe(cb: (s: WalletState) => void): () => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  switchChain(chainId: number): Promise<void>;
  /** Mock-only. A wagmi-backed implementation omits this. */
  setPersona?(persona: WalletPersona): void;
  /** Mock-only. */
  getPersona?(): WalletPersona;
}
