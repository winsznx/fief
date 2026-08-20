import { AlertTriangle } from 'lucide-react';
import { APPROVED } from '@/lib/copy';
import type { Agent } from '@/lib/data/types';
import { cn } from '@/lib/utils';
import { ContextLine } from './charts';

/**
 * P&L context — handoff §3 / §5.4, PRD §19.
 *
 * "P&L is context, not proof. Label any performance number 'context —
 * provenance only, not verified'." The label is not optional decoration here:
 * it is rendered unconditionally, above the number, and the chart is neutral
 * grey so it cannot borrow the credibility of the green/red provenance
 * semantic (D11).
 */
export function PnlContext({
  agent,
  className,
}: {
  agent: Agent;
  className?: string;
}) {
  if (!agent.pnlContext) return null;
  const { window: pnlWindow, series } = agent.pnlContext;

  return (
    <section
      className={cn('border-border flex flex-col gap-3 rounded-lg border border-dashed p-5', className)}
      aria-label="Unverified performance context"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-tight">
          Performance context
        </h2>
        <span className="border-border-strong text-muted-foreground rounded-sm border px-2 py-0.5 font-mono text-[0.6875rem]">
          {pnlWindow}
        </span>
      </header>

      {/* The label comes BEFORE the data, so it cannot be missed. */}
      <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>
          {APPROVED.pnlContext}. Fief records which sealed model produced which decision. It does
          not verify that the decisions were profitable.
        </span>
      </p>

      {series && series.length >= 2 ? (
        <ContextLine series={series} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Not enough recorded history in this window to plot context.
        </p>
      )}
    </section>
  );
}
