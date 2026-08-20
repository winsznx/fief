'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/wallet/context';

/**
 * Network guard — handoff §4.
 *
 * "If a wallet is connected on the wrong chain, show a banner ... with a
 * one-click switch. Read-only pages never force a wallet." So this renders
 * only when a wallet is actually connected to the wrong chain — never as a
 * prompt to connect.
 */
export function NetworkGuard() {
  const { wrongNetwork, expectedChainId, expectedChainName, switchToExpectedChain } = useWallet();

  if (!wrongNetwork) return null;

  return (
    <div
      className="border-rejected-border bg-rejected-surface border-b px-4 py-2"
      role="alert"
    >
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3">
        <AlertTriangle className="text-rejected-fg size-4 shrink-0" aria-hidden />
        <p className="text-rejected-fg flex-1 text-sm">
          Wrong network. Switch to {expectedChainName} ({expectedChainId}) to continue.
        </p>
        <Button size="sm" variant="outline" onClick={() => void switchToExpectedChain()}>
          Switch to {expectedChainName}
        </Button>
      </div>
    </div>
  );
}
