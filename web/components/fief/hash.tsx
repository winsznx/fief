import { ExternalLink } from 'lucide-react';
import { truncateHex } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';

/**
 * The single render path for every 0x value in the product — hashes,
 * addresses, tx ids. Always monospace + tabular numerals (plan §2.3), always
 * copyable, always exposing the full value to assistive tech and on hover.
 */
export function Hash({
  value,
  chars = 6,
  label,
  href,
  copy = true,
  className,
  full = false,
}: {
  value: string;
  /** Characters kept either side of the ellipsis. */
  chars?: number;
  /** Accessible name for the copy control, e.g. "TEE signer". */
  label?: string;
  /** Renders an external link affordance (ChainScan). */
  href?: string;
  copy?: boolean;
  className?: string;
  /** Show the whole value rather than truncating. */
  full?: boolean;
}) {
  const shown = full ? value : truncateHex(value, chars);

  const text = (
    <span className="tnum font-mono text-[0.8125rem]" title={value}>
      {shown}
    </span>
  );

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-foreground focus-visible:ring-ring/60 inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {text}
          <ExternalLink className="size-3 shrink-0" aria-hidden />
          <span className="sr-only"> (opens ChainScan in a new tab)</span>
        </a>
      ) : (
        text
      )}
      {copy ? <CopyButton value={value} label={`Copy ${label ?? 'value'}`} /> : null}
    </span>
  );
}

/** Label + Hash pair used throughout the receipt and the sealed strategy panel. */
export function HashRow({
  label,
  value,
  href,
  chars = 8,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  chars?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5">
      <span className="eyebrow shrink-0">{label}</span>
      <span className="flex items-center gap-2">
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
        <Hash value={value} chars={chars} label={label} href={href} />
      </span>
    </div>
  );
}
