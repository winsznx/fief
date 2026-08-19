/**
 * Approved / forbidden public copy. Keep every user-facing string in this
 * module (or import constants from here) so the guard below can scan them.
 */

export const APPROVED = {
  sealed: 'strategy sealed on 0G Storage, never on the public chain',
  attested: 'decisions attested by 0G TeeML',
  audit: 'request commitment sealed, auditable under authorized access',
  verified: 'verified on-chain against the agent\'s sealed strategy commitment',
  pnlContext: 'context — provenance only, not verified',
  accepted: 'Accepted — brain-bound',
} as const;

export const FORBIDDEN = [
  'trustless',
  'unextractable',
  'impossible to fake',
  'guaranteed profit',
] as const;

/** Dev-time scan of copy constants. Returns hits; never throws in prod. */
export function forbiddenCopyHits(corpus: string = JSON.stringify(APPROVED)): string[] {
  const lower = corpus.toLowerCase();
  return FORBIDDEN.filter((word) => lower.includes(word));
}

if (process.env.NODE_ENV !== 'production') {
  const hits = forbiddenCopyHits();
  if (hits.length > 0) {
    console.warn(`[fief/copy] forbidden phrase(s) in APPROVED constants: ${hits.join(', ')}`);
  }
}
