'use client';

import { BookOpen, Menu, ScanLine, ShieldCheck, Store } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { zeroGMainnet, zeroGTestnet } from '@/lib/chain/zerog';
import { getDataMode } from '@/lib/data/source';
import { cn } from '@/lib/utils';
import { useWallet } from '@/lib/wallet/context';
import { ConnectButton, DevPersonaMenu } from './connect-button';
import { ThemeToggle } from './theme-toggle';

/**
 * Top navigation.
 *
 * Reduced to four kinds of thing: wordmark, ONE status pill, primary links, and
 * the connect action. The previous bar carried eleven competing elements —
 * wordmark, a mock-data badge, a network badge, six links, a dev badge, a theme
 * toggle and connect — none of which was visibly more important than any other.
 *
 * Two deliberate removals:
 *
 *   Dashboard / Console are no longer primary. Both are wallet-gated and mean
 *   nothing to a visitor who has not connected, so they were spending permanent
 *   header space to advertise a dead end. They now appear in the bar only once a
 *   wallet is connected, and remain reachable from the footer and from the
 *   rent-flow success screen regardless.
 *
 *   The two status badges are merged into one pill. "Mock data" and the chain
 *   name are a single fact about this deployment — where the records you are
 *   looking at come from — so they read as one statement.
 */
const PRIMARY_LINKS = [
  { href: '/agents', label: 'Marketplace', icon: Store },
  { href: '/proof', label: 'Proof', icon: ShieldCheck },
  { href: '/verify', label: 'Verify', icon: ScanLine },
  { href: '/about', label: 'About', icon: BookOpen },
] as const;

/** Wallet-gated. Surfaced in the bar only when a wallet is connected. */
const ACCOUNT_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/console', label: 'Console' },
] as const;

/**
 * Where the records on screen come from, as one pill. In mock mode that fact is
 * load-bearing and non-dismissible (the project's own honesty rule): everything
 * rendered is fixture data, and a visitor — including a judge on a preview
 * deployment — has to be able to see that without hunting for it.
 */
function ProvenancePill() {
  const chain = process.env.NEXT_PUBLIC_NETWORK === 'testnet' ? zeroGTestnet : zeroGMainnet;
  const mock = getDataMode() !== 'live';

  return (
    <Link
      href="/about"
      title={mock ? `Fixture data. No entries recorded on ${chain.name} from this build.` : chain.name}
      className="border-border/70 text-muted-foreground hover:text-foreground hover:border-border focus-visible:ring-ring/60 hidden shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-[0.625rem] font-medium tracking-[0.14em] whitespace-nowrap uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none sm:inline-flex"
    >
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', mock ? 'bg-muted-foreground' : 'bg-accepted')}
      />
      {mock ? 'Mock data' : 'Live'}
      <span aria-hidden className="opacity-30">
        ·
      </span>
      {chain.name}
    </Link>
  );
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="focus-visible:ring-ring/60 flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
      aria-label="Fief — home"
    >
      <span className="bg-foreground text-background inline-flex size-7 shrink-0 items-center justify-center rounded-sm">
        <svg
          viewBox="0 0 20 20"
          className="size-3.5"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7 7.5h6M7 10h6M7 12.5h3.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-heading text-[0.9375rem] font-semibold tracking-[-0.02em]">Fief</span>
    </Link>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      {/* Full-bleed with a fixed gutter, so the wordmark sits in the true
          top-left corner and the connect action in the true top-right. Under the
          80rem page container the bar was inset by ~360px on a wide display,
          which left both corners conspicuously empty. */}
      <nav
        className="mx-auto flex h-16 w-full max-w-[120rem] items-center gap-4 px-4 sm:px-6 lg:px-8"
        aria-label="Primary"
      >
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <Wordmark />
          <ProvenancePill />
        </div>

        <ul className="mx-auto hidden items-center gap-0.5 lg:flex">
          {PRIMARY_LINKS.map((link) => (
            <li key={link.href}>
              <NavItem href={link.href} label={link.label} active={isActive(link.href)} />
            </li>
          ))}
          <AccountLinks isActive={isActive} />
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
          <DevPersonaMenu />
          <ThemeToggle />
          <ConnectButton />
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="size-4" aria-hidden />
          </Button>
        </div>
      </nav>

      {/* Mobile menu. A disclosure rather than the previous horizontally
          scrolling strip: that strip put six equally-weighted targets in a
          15px-tall overflow rail that gave no indication it scrolled, so links
          past "About" were effectively unreachable on a phone. */}
      {open ? (
        <ul
          id="mobile-nav"
          className="border-border flex flex-col gap-0.5 border-t px-4 py-3 sm:px-6 lg:hidden"
        >
          {PRIMARY_LINKS.map((link) => (
            <li key={link.href}>
              <MobileItem
                href={link.href}
                label={link.label}
                icon={link.icon}
                active={isActive(link.href)}
                onNavigate={() => setOpen(false)}
              />
            </li>
          ))}
          <MobileAccountLinks isActive={isActive} onNavigate={() => setOpen(false)} />
        </ul>
      ) : null}
    </header>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'focus-visible:ring-ring/60 inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium tracking-tight whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
        // Icons dropped from the desktop bar. With four short, dissimilar labels
        // a glyph adds a second thing to parse per target without making any of
        // them faster to recognise; they stay in the mobile list, where the rows
        // are wide and the icon is the only thing scannable at a glance.
        active
          ? 'bg-foreground/[0.07] text-foreground'
          : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]',
      )}
    >
      {label}
    </Link>
  );
}

function MobileItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon?: typeof Store;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'focus-visible:ring-ring/60 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
        active ? 'bg-foreground/[0.07] text-foreground' : 'text-foreground/60 hover:text-foreground',
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0 opacity-70" aria-hidden /> : null}
      {label}
    </Link>
  );
}

/**
 * Wallet-gated links, shown in the desktop bar only once connected. Rendered
 * behind a divider so it is evident they are a different class of destination
 * from the four public ones.
 */
function AccountLinks({ isActive }: { isActive: (href: string) => boolean }) {
  const { status } = useWallet();
  if (status !== 'connected') return null;

  return (
    <>
      <li aria-hidden className="bg-border mx-1.5 h-4 w-px" />
      {ACCOUNT_LINKS.map((link) => (
        <li key={link.href}>
          <NavItem href={link.href} label={link.label} active={isActive(link.href)} />
        </li>
      ))}
    </>
  );
}

function MobileAccountLinks({
  isActive,
  onNavigate,
}: {
  isActive: (href: string) => boolean;
  onNavigate: () => void;
}) {
  const { status } = useWallet();
  if (status !== 'connected') return null;

  return (
    <>
      <li aria-hidden className="bg-border my-1.5 h-px w-full" />
      {ACCOUNT_LINKS.map((link) => (
        <li key={link.href}>
          <MobileItem
            href={link.href}
            label={link.label}
            active={isActive(link.href)}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </>
  );
}
