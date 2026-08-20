'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { zeroGMainnet, zeroGTestnet } from '@/lib/chain/zerog';
import { createMockWalletSource } from './mock';
import type { WalletPersona, WalletSource, WalletState } from './types';

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchToExpectedChain: () => Promise<void>;
  /** True when connected to a chain that is not the configured 0G network. */
  wrongNetwork: boolean;
  expectedChainId: number;
  expectedChainName: string;
  /** Mock-only, dev switcher. */
  persona: WalletPersona | null;
  setPersona: ((p: WalletPersona) => void) | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function expectedChain() {
  return process.env.NEXT_PUBLIC_NETWORK === 'testnet' ? zeroGTestnet : zeroGMainnet;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Lazily constructed once via useState's initializer rather than a ref:
  // reading `ref.current` during render is disallowed by the React Compiler
  // rules that ship with Next 16.
  const [source] = useState<WalletSource>(() => createMockWalletSource());

  const [state, setState] = useState<WalletState>(() => source.getState());
  const [persona, setPersonaState] = useState<WalletPersona | null>(
    () => source.getPersona?.() ?? null,
  );

  useEffect(() => source.subscribe(setState), [source]);

  const chain = expectedChain();

  const setPersona = useCallback(
    (p: WalletPersona) => {
      source.setPersona?.(p);
      setPersonaState(p);
    },
    [source],
  );

  const canSetPersona = source.setPersona !== undefined;

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      connect: () => source.connect(),
      disconnect: () => source.disconnect(),
      switchToExpectedChain: () => source.switchChain(chain.id),
      wrongNetwork: state.status === 'connected' && state.chainId !== chain.id,
      expectedChainId: chain.id,
      expectedChainName: chain.name,
      persona,
      setPersona: canSetPersona ? setPersona : null,
    }),
    [state, source, chain.id, chain.name, persona, setPersona, canSetPersona],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within <WalletProvider>');
  return ctx;
}
