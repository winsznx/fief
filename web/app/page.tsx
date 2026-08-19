import Link from 'next/link';
import { APPROVED } from '@/lib/copy';

const PAGES = [
  { href: '/', label: 'Landing', section: '§5.1', note: 'this page — replace with the mechanism + green/red proof' },
  { href: '/proof', label: 'Proof', section: '§5.2', note: '2-minute judge path' },
  { href: '/agents', label: 'Marketplace', section: '§5.3', note: 'browse listed agents' },
  { href: '/agents/1', label: 'Agent record', section: '§5.4', note: 'star page — decision ledger' },
  { href: '/agents/1/rent', label: 'Rent', section: '§5.5', note: 'escrow + grant, mock write' },
  { href: '/dashboard', label: 'Renter dashboard', section: '§5.6', note: 'live verified feed' },
  { href: '/console', label: 'Owner console', section: '§5.7', note: 'mint / reseal / list, stubbed writes' },
  { href: '/verify', label: 'Verify', section: '§5.8', note: 'paste a tx hash' },
  { href: '/about', label: 'About / Security', section: '§5.9', note: 'honest limits' },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Fief · frontend scaffold
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Rent or buy a trading agent whose track record is signed by its own sealed brain.
        </h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          Pages below are stubs. Build them against{' '}
          <code className="font-mono text-sm">getDataSource()</code> as specified in{' '}
          <span className="font-mono text-sm text-foreground">docs/frontend-handoff.md</span>.
          Branch → PR into <code className="font-mono text-sm">main</code> → review @winsznx.
        </p>
        <p className="text-sm text-muted-foreground">{APPROVED.sealed}.</p>
      </header>

      <ol className="divide-y divide-border border-y border-border">
        {PAGES.map((page) => (
          <li key={page.href} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6">
            <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{page.section}</span>
            <Link href={page.href} className="font-medium underline-offset-4 hover:underline">
              {page.label}
            </Link>
            <span className="text-sm text-muted-foreground sm:ml-auto">{page.note}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
