import Link from 'next/link';
import { APPROVED } from '@/lib/copy';
import { asSentence } from '@/lib/format';

const REPO = 'https://github.com/winsznx/fief';
const ZEROG_DOCS = 'https://docs.0g.ai';

const LINKS = [
  { href: REPO, label: 'GitHub', external: true },
  { href: ZEROG_DOCS, label: '0G docs', external: true },
  { href: '/verify', label: 'Verify a transaction', external: false },
  { href: '/about', label: 'Honest limits', external: false },
] as const;

export function Footer() {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="container-page flex flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            {asSentence(APPROVED.sealed)}; {APPROVED.attested}; {APPROVED.audit}.
          </p>

          <nav
            className="flex flex-wrap items-center gap-x-1 gap-y-2 md:justify-end"
            aria-label="Footer"
          >
            {LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/60 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/60 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="border-border flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Provenance only. No custody, no execution, no verification of profit or loss.
          </p>
          <code className="text-muted-foreground border-border shrink-0 rounded-sm border px-3 py-1 font-mono text-xs">
            cd packages/verify &amp;&amp; pnpm fief-verify --tx &lt;hash&gt;
          </code>
        </div>
      </div>
    </footer>
  );
}

