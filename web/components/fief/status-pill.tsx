import { CheckCircle2, XCircle } from 'lucide-react';
import type { DecisionStatus, RejectReason } from '@/lib/data/types';
import { cn } from '@/lib/utils';

/**
 * The Accepted / Rejected semantic.
 *
 * D8 — redundant encoding. Colour is NEVER the sole carrier:
 *   1. icon          check vs cross
 *   2. text label    "Accepted" vs "Rejected — BadCommit"
 *   3. border weight solid 1px vs dashed 1px
 *   4. fill density  tinted surface vs stronger tinted surface
 *
 * Acceptance test: desaturate a screenshot to greyscale — the two states must
 * still be unambiguous. ~8% of men cannot use the green/red axis, and this is
 * the core product semantic.
 */

export const REJECT_REASON_COPY: Record<RejectReason, string> = {
  BadSigner: 'signature did not recover to the registered TEE signer',
  BadNonce: 'nonce was already consumed for this token and epoch',
  BadEpoch: 'entry names an epoch the token has moved past',
  BadCommit: 'commit line does not match the sealed strategy commitment',
  BadHash: 'response bytes do not hash to the signed text',
  NotOperator: 'submitter is not the token’s registered operator',
  BadAnchor: 'commit line is not at the head of the message content',
};

const SIZES = {
  sm: 'h-6 gap-1.5 px-2 text-[0.6875rem]',
  md: 'h-7 gap-2 px-2.5 text-xs',
  lg: 'h-9 gap-2.5 px-3.5 text-sm',
} as const;

const ICON_SIZES = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
} as const;

export function StatusPill({
  status,
  rejectReason,
  size = 'md',
  showReason = true,
  className,
}: {
  status: DecisionStatus;
  rejectReason?: RejectReason;
  size?: keyof typeof SIZES;
  showReason?: boolean;
  className?: string;
}) {
  const accepted = status === 'accepted';
  const Icon = accepted ? CheckCircle2 : XCircle;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm font-medium tracking-tight uppercase',
        SIZES[size],
        accepted
          ? 'border-accepted-border bg-accepted-surface text-accepted-fg border border-solid'
          : 'border-rejected-border bg-rejected-surface text-rejected-fg border border-dashed',
        className,
      )}
    >
      <Icon className={cn('shrink-0', ICON_SIZES[size])} aria-hidden />
      <span className="whitespace-nowrap">
        {accepted ? 'Accepted' : 'Rejected'}
        {!accepted && showReason && rejectReason ? (
          <span className="font-mono normal-case"> · {rejectReason}</span>
        ) : null}
      </span>
    </span>
  );
}
