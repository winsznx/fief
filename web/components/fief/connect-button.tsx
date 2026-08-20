'use client';

import { ChevronDown, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { truncateHex } from '@/lib/format';
import { useWallet } from '@/lib/wallet/context';
import type { WalletPersona } from '@/lib/wallet/types';

const PERSONA_LABELS: Record<WalletPersona, string> = {
  disconnected: 'Disconnected',
  owner: 'Owner (has agents)',
  renter: 'Renter (has grants)',
  'wrong-network': 'Wrong network',
};

/**
 * Connect control (D3).
 *
 * Backed by the mock WalletSource, so wallet writes stay stubbed per handoff
 * §5.5 / §5.7 while every wallet state remains reachable. In dev it doubles as
 * the persona switcher, which makes disconnected / connected / wrong-network
 * reproducible on demand for screenshots and the demo video — something a real
 * connect kit cannot do.
 */
export function ConnectButton() {
  const { status, address, connect, disconnect, persona, setPersona, wrongNetwork } = useWallet();

  const isDev = process.env.NODE_ENV !== 'production';

  if (status !== 'connected') {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void connect()}
          disabled={status === 'connecting'}
          className="h-8"
        >
          <Wallet className="size-3.5" aria-hidden />
          {status === 'connecting' ? 'Connecting…' : 'Connect'}
        </Button>
        {isDev && setPersona ? <PersonaMenu persona={persona} setPersona={setPersona} /> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 font-mono text-xs">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${wrongNetwork ? 'bg-rejected' : 'bg-accepted'}`}
            />
            {address ? truncateHex(address, 4) : 'Connected'}
            <ChevronDown className="size-3" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-mono text-xs break-all">{address}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void disconnect()}>Disconnect</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isDev && setPersona ? <PersonaMenu persona={persona} setPersona={setPersona} /> : null}
    </div>
  );
}

function PersonaMenu({
  persona,
  setPersona,
}: {
  persona: WalletPersona | null;
  setPersona: (p: WalletPersona) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground size-8 font-mono text-[0.625rem]"
          aria-label="Dev wallet persona switcher"
          title="Dev only — switch mock wallet persona"
        >
          dev
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Mock wallet persona
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(PERSONA_LABELS) as WalletPersona[]).map((p) => (
          <DropdownMenuItem
            key={p}
            onSelect={() => setPersona(p)}
            className={p === persona ? 'font-medium' : undefined}
          >
            {PERSONA_LABELS[p]}
            {p === persona ? <span className="ml-auto text-xs">●</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
