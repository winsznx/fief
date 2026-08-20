/**
 * Approved / forbidden public copy.
 *
 * Handoff §3 makes copy discipline a hard rule. Keep every user-facing claim
 * in this module (or import constants from here) so it is greppable and
 * reviewable in one place.
 *
 * Enforcement is THREE layers, because a constants-only check cannot catch a
 * forbidden word typed directly into JSX:
 *   1. `scripts/copy-guard.mjs` scans app/, components/ and lib/ sources and
 *      fails the build. This is the real guard.
 *   2. `no-restricted-syntax` ESLint rules on string literals and JSX text.
 *   3. `forbiddenCopyHits()` below, for ad-hoc checks in dev/tests.
 */

export const APPROVED = {
  sealed: 'strategy sealed on 0G Storage, never on the public chain',
  attested: 'decisions attested by 0G TeeML',
  audit: 'request commitment sealed, auditable under authorized access',
  verified: "verified on-chain against the agent's sealed strategy commitment",
  pnlContext: 'context — provenance only, not verified',
  accepted: 'Accepted — brain-bound',
} as const;

export const FORBIDDEN = [
  'trustless',
  'unextractable',
  'impossible to fake',
  'guaranteed profit',
] as const;

/**
 * Scans a corpus for forbidden phrases.
 *
 * NOTE: `corpus` is REQUIRED by design. It previously defaulted to
 * `JSON.stringify(APPROVED)`, which meant the guard only ever scanned itself
 * and could never fail — a silent no-op.
 */
export function forbiddenCopyHits(corpus: string): string[] {
  const lower = corpus.toLowerCase();
  return FORBIDDEN.filter((word) => lower.includes(word));
}

/** Convenience assertion for tests and dev-time checks. */
export function assertNoForbiddenCopy(corpus: string, where = 'copy'): void {
  const hits = forbiddenCopyHits(corpus);
  if (hits.length > 0) {
    throw new Error(`[fief/copy] forbidden phrase(s) in ${where}: ${hits.join(', ')}`);
  }
}

/* ── Honest-status copy ──────────────────────────────────────────────────────
   D4 — the badge must not claim live mainnet activity while the app is reading
   MockDataSource. Handoff §4's literal wording is only correct in live mode.
   -------------------------------------------------------------------------- */

export const HONEST_STATUS = {
  mockPrimary: 'Mock data · no live records yet',
  mockDetail:
    'This deployment reads a local mock data source. No decisions have been recorded on 0G mainnet from this build.',
  liveLabel: 'Live on 0G mainnet',
} as const;

export const LIMITS = {
  provenanceNotAlpha:
    'Fief proves provenance, not profitability. A record shows which sealed model produced which decision — it is not evidence that the decisions were good.',
  responseSideDeclaration:
    'The commitment is declared on the response side, so a dishonest owner could run a request that does not contain the sealed strategy yet instructs the model to echo its hash. The remedy is an authorized request audit: an auditor granted access recomputes the request hash for any past entry and confirms it matches the value recorded on-chain.',
  noCustody: 'No custody and no execution of renter funds. Trade execution stays with the renter.',
  strategyDistillation:
    'Observing an agent’s outputs over a long period may allow a renter to approximate its behaviour. This is a documented residual risk, mitigated by rate limits and disclosure-delay options, not eliminated.',
} as const;
