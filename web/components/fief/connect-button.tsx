'use client';

import { AlertTriangle, ChevronDown, Wallet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { truncateHex } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useWallet } from '@/lib/wallet/context';
import type { WalletPersona } from '@/lib/wallet/types';

const PERSONA_LABELS: Record<WalletPersona, string> = {
  disconnected: 'Disconnected',
  owner: 'Owner (has agents)',
  renter: 'Renter (has grants)',
  'wrong-network': 'Wrong network',
};

/**
 * Every wallet state renders at the SAME height and radius, so the header chrome
 * does not resize when the wallet connects. That was a real defect: the previous
 * control swapped an `xs` outline button for a mono-text button plus a second
 * chip, so the right-hand cluster changed width on connect and the nav visibly
 * reflowed.
 */
const PILL =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[0.8125rem] font-medium tracking-tight transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none';

/**
 * Connect control (D3).
 *
 * Backed by the mock WalletSource, so wallet writes stay stubbed per handoff
 * §5.5 / §5.7 while every wallet state remains reachable.
 *
 * The connect action is the only PRIMARY affordance in the header, so it is the
 * only inverted (solid) element there — everything else in the bar is a ghost or
 * a hairline. Previously it was an `outline` button sitting beside three other
 * outline chips, which is why the cluster read as four competing controls with no
 * evident hierarchy.
 */
export function ConnectButton() {
  const { status, address, connect, disconnect, wrongNetwork } = useWallet();

  if (status !== 'connected') {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        disabled={status === 'connecting'}
        className={cn(
          PILL,
          'bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60',
        )}
      >
        <Wallet className="size-3.5" aria-hidden />
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(PILL, 'bg-rejected-surface text-rejected-fg border-rejected/40 border')}
          >
            <AlertTriangle className="size-3.5" aria-hidden />
            Wrong network
          </button>
        </DropdownMenuTrigger>
        <AccountMenu address={address} disconnect={disconnect} />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(PILL, 'bg-foreground text-background hover:bg-foreground/90')}>
          <span aria-hidden className="bg-accepted size-1.5 rounded-full" />
          <span className="tnum font-mono text-[0.75rem]">
            {address ? truncateHex(address, 4) : 'Connected'}
          </span>
          <ChevronDown className="size-3 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <AccountMenu address={address} disconnect={disconnect} />
    </DropdownMenu>
  );
}

function AccountMenu({
  address,
  disconnect,
}: {
  address?: string | null;
  disconnect: () => void | Promise<void>;
}) {
  return (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel className="font-mono text-xs break-all">{address}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void disconnect()}>Disconnect</DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/**
 * Dev-only persona switcher. Lifted OUT of <ConnectButton> so it can sit with the
 * other build-state metadata on the left of the header rather than beside the
 * primary action — it is not something a user acts on, and putting it next to
 * Connect implied it was.
 */
export function DevPersonaMenu() {
  const { persona, setPersona } = useWallet();
  if (process.env.NODE_ENV === 'production' || !setPersona) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 hidden shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.18em] uppercase focus-visible:ring-2 focus-visible:outline-none lg:inline-flex"
          aria-label="Dev wallet persona switcher"
          title="Dev only — switch mock wallet persona"
        >
          dev
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
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
