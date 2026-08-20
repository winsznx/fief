import Link from 'next/link';
import { APPROVED } from '@/lib/copy';

const REPO = 'https://github.com/winsznx/fief';
const ZEROG_DOCS = 'https://docs.0g.ai';

export function Footer() {
  return (
    <footer className="border-border-strong mt-auto border-t">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-8">
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {APPROVED.sealed}; {APPROVED.attested}; {APPROVED.audit}.
        </p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            GitHub
          </a>
          <a
            href={ZEROG_DOCS}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            0G docs
          </a>
          <Link
            href="/verify"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Verify a transaction
          </Link>
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Honest limits
          </Link>
          <code className="text-muted-foreground ml-auto font-mono text-xs">
            pnpm fief-verify --tx &lt;hash&gt;
          </code>
        </div>

        <p className="text-muted-foreground text-xs">
          Provenance only. No custody, no execution, no verification of profit or loss.
        </p>
      </div>
    </footer>
  );
}
