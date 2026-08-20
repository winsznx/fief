'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * Sheet wrapper for the intercepted entry route.
 *
 * Closing calls router.back() so the URL returns to the record page and the
 * browser's back/forward buttons behave as the user expects. Radix's Dialog
 * primitive underneath handles the focus trap, focus restore and Escape.
 */
export function EntrySheet({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-2xl"
        aria-describedby={undefined}
      >
        {/* Radix requires an accessible title; the visible heading lives in
            EntryDetail, so this one is screen-reader only. */}
        <SheetTitle className="sr-only">Decision entry detail</SheetTitle>
        <div className="px-5 pt-2 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
