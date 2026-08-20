import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';

/**
 * The independent-verification command (handoff §5.2 / §5.4 / §5.8).
 *
 * This is the product's "don't trust us" affordance, so it renders as a real
 * terminal line rather than a decorative badge.
 */
export function VerifyCommand({
  txHash,
  className,
  label = 'Verify independently',
}: {
  txHash: string;
  className?: string;
  label?: string;
}) {
  const command = `pnpm fief-verify --tx ${txHash}`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="eyebrow">{label}</span>
      <div className="border-border-strong bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2">
        <Terminal className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <code className="tnum min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">
          {command}
        </code>
        <CopyButton value={command} label="Copy verify command" />
      </div>
    </div>
  );
}
