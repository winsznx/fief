'use client';

import { FlaskConical } from 'lucide-react';
import { HONEST_STATUS } from '@/lib/copy';
import { getDataMode } from '@/lib/data/source';

/**
 * Persistent mock-mode ribbon (D4).
 *
 * Deliberately NOT dismissible. Everything on screen in mock mode is fixture
 * data, and the project's own honesty rule (README, PRD §8) means that has to
 * be stated where it cannot be missed — including by a judge looking at a
 * pre-launch preview deployment.
 *
 * Renders nothing in live mode.
 */
export function MockModeRibbon() {
  if (getDataMode() === 'live') return null;

  return (
    <div className="border-border-strong bg-muted/60 border-b px-4 py-1.5" role="status">
      <p className="text-muted-foreground mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.6875rem]">
        <FlaskConical className="size-3 shrink-0" aria-hidden />
        <span className="text-foreground font-medium">{HONEST_STATUS.mockPrimary}.</span>
        <span>{HONEST_STATUS.mockDetail}</span>
      </p>
    </div>
  );
}
