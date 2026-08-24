import { AlertTriangle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="text-muted-foreground size-6" aria-hidden /> : null}
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-rejected-border bg-rejected-surface flex flex-col items-start gap-3 rounded-lg border border-dashed px-5 py-5',
        className,
      )}
      role="alert"
    >
      <span className="text-rejected-fg flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {title}
      </span>
      {description ? (
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Ledger loading placeholder sized to the fixed virtualized row height. */
export function LedgerSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-border flex h-row items-center gap-4 border-b px-3">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="border-border flex flex-col gap-3 rounded-lg border p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
