import { AlertTriangle } from 'lucide-react';
import { APPROVED } from '@/lib/copy';
import type { Agent } from '@/lib/data/types';
import { cn } from '@/lib/utils';
import { ContextLine } from './charts';

/**
 * Whether there is a P&L series worth rendering.
 *
 * Exported so a caller can choose its layout without duplicating the predicate
 * — `<PnlContext>` returning null (D16) would otherwise leave a dead grid
 * column that the caller has no honest way to detect.
 */
export function hasPnlContext(agent: Agent): boolean {
  const series = agent.pnlContext?.series;
  return series !== undefined && series.length >= 2;
}

/**
 * P&L context — handoff §3 / §5.4, PRD §19.
 *
 * "P&L is context, not proof. Label any performance number 'context —
 * provenance only, not verified'." The label is not optional decoration here:
 * it is rendered unconditionally, above the number, and the chart is neutral
 * grey so it cannot borrow the credibility of the green/red provenance
 * semantic (D11).
 *
 * D16 — returns null unless there is an actual series to plot. A permanent
 * "not enough history" panel on every agent page is noise that also implies the
 * data is coming; when no P&L series exists, the honest UI is no P&L section.
 * `/design` renders it with an explicitly synthetic series so the component
 * stays reviewable without attributing fabricated performance to a real agent.
 */
export function PnlContext({
  agent,
  className,
}: {
  agent: Agent;
  className?: string;
}) {
  const series = agent.pnlContext?.series;
  if (!agent.pnlContext || !hasPnlContext(agent) || !series) return null;

  const { window: pnlWindow } = agent.pnlContext;

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

      <ContextLine series={series} />
    </section>
  );
}
