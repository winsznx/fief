'use client';

import { Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/wallet/context';
import { EmptyState } from './states';

/**
 * Gate for the three wallet-requiring routes (§5.5 rent, §5.6 dashboard,
 * §5.7 console).
 *
 * Handoff §4: read-only pages never force a wallet, so this is used ONLY on
 * those three. It renders the disconnected and wrong-network states explicitly
 * rather than silently showing an empty page, which is what the §5.5/§5.7 state
 * lists require.
 *
 * `children` receives the connected address, so downstream components never
 * have to handle an undefined one.
 */
export function WalletGate({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (address: `0x${string}`) => ReactNode;
}) {
  const {
    status,
    address,
    connect,
    wrongNetwork,
    expectedChainName,
    switchToExpectedChain,
  } = useWallet();

  if (status !== 'connected' || !address) {
    return (
      <EmptyState
        icon={Wallet}
        title={title}
        description={description}
        action={
          <Button size="sm" onClick={() => void connect()} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
          </Button>
        }
      />
    );
  }

  if (wrongNetwork) {
    return (
      <EmptyState
        icon={Wallet}
        title={`Switch to ${expectedChainName}`}
        description="Your wallet is connected to a different network. Fief records live on 0G, so the wrong chain would read the wrong state."
        action={
          <Button size="sm" onClick={() => void switchToExpectedChain()}>
            Switch network
          </Button>
        }
      />
    );
  }

  return <>{children(address)}</>;
}
