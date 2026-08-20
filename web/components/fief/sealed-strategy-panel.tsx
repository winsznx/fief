import { Lock } from 'lucide-react';
import { HashRow } from '@/components/fief/hash';
import { APPROVED } from '@/lib/copy';
import type { Agent } from '@/lib/data/types';
import { cn } from '@/lib/utils';

/**
 * Sealed strategy panel — handoff §5.4.
 *
 * "Anywhere the strategy is shown, show a ciphertext blob / hash, never
 * plaintext." So this renders ONLY the two real 32-byte commitments the chain
 * carries. There is deliberately no decorative pseudo-ciphertext blob: the mock
 * has no ciphertext bytes, and inventing a convincing-looking one would present
 * fabricated data as the sealed artifact.
 */
export function SealedStrategyPanel({
  agent,
  className,
}: {
  agent: Agent;
  className?: string;
}) {
  return (
    <section
      className={cn('border-border-strong flex flex-col gap-3 rounded-lg border p-5', className)}
      aria-label="Sealed strategy"
    >
      <header className="flex items-center gap-2">
        <Lock className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">Sealed strategy</h2>
        <span className="border-border-strong text-muted-foreground ml-auto rounded-sm border px-2 py-0.5 font-mono text-[0.6875rem]">
          epoch {agent.epoch}
        </span>
      </header>

      <p className="text-muted-foreground text-sm leading-relaxed">
        {APPROVED.sealed}. Only these commitments are public — the strategy itself stays encrypted.
      </p>

      <div className="border-border divide-border divide-y border-t pt-1">
        <HashRow label="Strategy commitment (H)" value={agent.strategyHash} />
        <HashRow label="0G Storage root" value={agent.storageRoot} />
        <HashRow label="Operator" value={agent.operator} chars={6} />
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {APPROVED.audit}. A prospective buyer can be granted access to recompute the request hash
        for any past entry and confirm it matches the value recorded on-chain.
      </p>
    </section>
  );
}
