/**
 * Forward-performance metrics (PRD v2 §13).
 *
 * Every number here is recomputable by anyone from public post-reveal data,
 * which is the point: a judge or a buyer should never have to take Fief's
 * scoreboard on faith.
 *
 * Signal performance is deliberately kept separate from executed P&L. Fief does
 * not execute renter trades, so reporting a return as if it were realised would
 * be exactly the kind of overclaim §8 forbids.
 */

import type { Decision, Direction } from './types.js';

export interface ScoredSlot {
  slot: number;
  decision: Decision;
  /** Realised direction over the slot's horizon. */
  outcome: Direction;
  /** Snapshot-to-commit latency in seconds. */
  latencySeconds: number;
}

export interface Performance {
  /** Slots that were revealed and therefore scoreable. */
  sample: number;
  /** revealed / scheduled, from the epoch summary. Not derived here. */
  completeness: number;
  hits: number;
  /** hits / sample, in 0..1. Null when the sample is empty. */
  hitRate: number | null;
  /**
   * Mean Brier score over the directional call, in 0..1, lower is better.
   * Null when the sample is empty.
   */
  brier: number | null;
  medianLatencySeconds: number | null;
  /** Hypothetical fixed-rule return: +1 per hit, -1 per miss, FLAT scores 0. */
  fixedRuleReturn: number;
  maxDrawdown: number;
}

const isHit = (d: Decision, outcome: Direction): boolean => d.dir === outcome;

/**
 * Brier score for the directional call, treating `conf` as the probability
 * assigned to the stated direction. A FLAT call is scored against whether the
 * market was actually flat, so confident FLAT calls are not free.
 */
function brierFor(d: Decision, outcome: Direction): number {
  const p = Math.min(Math.max(d.conf, 0), 1);
  const actual = isHit(d, outcome) ? 1 : 0;
  return (p - actual) ** 2;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid] as number;
  return ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function scorePerformance(scored: ScoredSlot[], completeness: number): Performance {
  const sample = scored.length;
  let hits = 0;
  let brierSum = 0;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const latencies: number[] = [];

  for (const s of scored) {
    const hit = isHit(s.decision, s.outcome);
    if (hit) hits += 1;
    brierSum += brierFor(s.decision, s.outcome);
    latencies.push(s.latencySeconds);

    if (s.decision.dir !== 'FLAT') equity += hit ? 1 : -1;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  return {
    sample,
    completeness,
    hits,
    hitRate: sample === 0 ? null : hits / sample,
    brier: sample === 0 ? null : brierSum / sample,
    medianLatencySeconds: median(latencies),
    fixedRuleReturn: equity,
    maxDrawdown,
  };
}
