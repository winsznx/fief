'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { zeroGMainnet, zeroGTestnet } from '@/lib/chain/zerog';
import { cn } from '@/lib/utils';
import { ConnectButton } from './connect-button';
import { ThemeToggle } from './theme-toggle';

const LINKS = [
  { href: '/agents', label: 'Marketplace' },
  { href: '/proof', label: 'Proof' },
  { href: '/verify', label: 'Verify' },
  { href: '/about', label: 'About' },
] as const;

function NetworkIndicator() {
  const chain = process.env.NEXT_PUBLIC_NETWORK === 'testnet' ? zeroGTestnet : zeroGMainnet;
  return (
    <span className="border-border-strong text-muted-foreground hidden items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[0.6875rem] sm:inline-flex">
      {chain.name}
      <span className="tnum opacity-70">{chain.id}</span>
    </span>
  );
}

/** Typographic wordmark + seal glyph (D1 — no brand hue, monochrome only). */
function Wordmark() {
  return (
    <Link
      href="/"
      className="focus-visible:ring-ring/60 group flex items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
      aria-label="Fief — home"
    >
      <svg
        viewBox="0 0 20 20"
        className="text-foreground size-4 shrink-0"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        {/* Seal / sigil: a wax-seal ring around a bound ledger mark. */}
        <circle cx="10" cy="10" r="8.25" />
        <path d="M6.5 7.25h7M6.5 10h7M6.5 12.75h4" strokeLinecap="round" />
      </svg>
      <span className="font-mono text-sm font-semibold tracking-[0.2em] uppercase">Fief</span>
    </Link>
  );
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="border-border-strong bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <nav
        className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-3"
        aria-label="Primary"
      >
        <Wordmark />

        <ul className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-visible:ring-ring/60 rounded-sm px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <NetworkIndicator />
          <ThemeToggle />
          <ConnectButton />
        </div>
      </nav>

      {/* Mobile link row — kept outside the flex row so it wraps cleanly. */}
      <ul className="border-border flex items-center gap-1 overflow-x-auto border-t px-4 py-2 md:hidden">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-sm px-2.5 py-1 text-sm whitespace-nowrap',
                  active ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </header>
  );
}
