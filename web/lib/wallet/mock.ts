import { zeroGMainnet } from '@/lib/chain/zerog';
import { MOCK_OWNER, MOCK_RENTER } from '@/lib/data/fixtures';
import type { WalletPersona, WalletSource, WalletState } from './types';

/** A chain that is deliberately not 0G, to exercise the network guard. */
export const WRONG_CHAIN_ID = 1;

const STATES: Record<WalletPersona, WalletState> = {
  disconnected: { status: 'disconnected' },
  owner: { status: 'connected', address: MOCK_OWNER, chainId: zeroGMainnet.id },
  renter: { status: 'connected', address: MOCK_RENTER, chainId: zeroGMainnet.id },
  'wrong-network': { status: 'connected', address: MOCK_RENTER, chainId: WRONG_CHAIN_ID },
};

export function createMockWalletSource(
  initial: WalletPersona = 'disconnected',
): WalletSource {
  let persona: WalletPersona = initial;
  let state: WalletState = STATES[persona];
  const listeners = new Set<(s: WalletState) => void>();

  function emit(next: WalletState) {
    state = next;
    for (const l of listeners) l(state);
  }

  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async connect() {
      emit({ status: 'connecting' });
      await new Promise((r) => setTimeout(r, 220));
      // Connecting from a disconnected state assumes the renter persona —
      // the common case for the public marketplace flows.
      persona = persona === 'disconnected' ? 'renter' : persona;
      emit(STATES[persona]);
    },
    async disconnect() {
      persona = 'disconnected';
      emit(STATES.disconnected);
    },
    async switchChain(chainId) {
      if (state.status !== 'connected') return;
      // Switching to 0G from the wrong-network persona resolves the guard.
      if (chainId === zeroGMainnet.id && persona === 'wrong-network') {
        persona = 'renter';
        emit(STATES.renter);
        return;
      }
      emit({ ...state, chainId });
    },
    setPersona(next) {
      persona = next;
      emit(STATES[next]);
    },
    getPersona: () => persona,
  };
}
