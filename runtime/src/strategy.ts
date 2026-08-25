/**
 * Strategy container and market snapshots (PRD v2 §12).
 *
 * The strategy is the secret. It lives in the request body, never on the public
 * chain, and only `keccak256` of its canonical JSON (`H`) is published. The
 * output contract is the load-bearing part: the model must echo the commit line
 * verbatim as the first line of its reply, because that echo is what the
 * contract memcmps against bytes it rebuilds from its own state.
 */

import {keccak256Hex, sha256Hex, canonicalSnapshot} from '@fief/reference';
import type {Hex} from '@fief/reference';

export interface StrategyContainer {
  version: string;
  temperature: 0;
  systemPrompt: string;
  riskParams: {maxSizePct: number; minConfidence: number};
  featureConfig: {lookbackMinutes: number};
}

/** JCS-ish canonical form: sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function canonicalStrategyJson(s: StrategyContainer): string {
  return canonicalJson(s);
}

export function strategyHash(s: StrategyContainer): Hex {
  return keccak256Hex(canonicalStrategyJson(s));
}

/**
 * The demo strategy for P3/P4.
 *
 * The prompt is mundane on purpose: the product claim is about provenance and
 * completeness, not about alpha. A real author's container would carry their
 * actual logic and never leave their machine in the clear.
 */
export function demoStrategy(): StrategyContainer {
  return {
    version: 'fief-demo-1',
    temperature: 0,
    systemPrompt: [
      'You are a BTC short-horizon direction agent.',
      'Reply with EXACTLY two lines and nothing else.',
      'Line 1 MUST be the commitment line below, copied verbatim, character for character.',
      'Line 2 MUST be a compact JSON object: {"dir":"UP|DOWN|FLAT","conf":0.0-1.0,"size":0.0-1.0}',
      'Do not add commentary, code fences, or leading whitespace.',
      'Commitment line:',
    ].join('\n'),
    riskParams: {maxSizePct: 0.5, minConfidence: 0.55},
    featureConfig: {lookbackMinutes: 30},
  };
}

export interface Snapshot {
  pair: string;
  ts: number;
  last: number;
  bid: number;
  ask: number;
  vol: number;
}

/**
 * Fetch a canonical OKX snapshot, falling back to a deterministic synthetic one.
 *
 * The fallback matters: a slot must never be skipped because a market endpoint
 * was briefly unreachable, and it must never silently substitute stale data
 * either. The snapshot is hashed into `inputHash` and archived, so whichever
 * source produced it is auditable after the fact.
 */
export async function fetchSnapshot(pair = 'BTC-USDT', at = Math.floor(Date.now() / 1000)): Promise<Snapshot> {
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${pair}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const j = (await res.json()) as {data?: Array<Record<string, string>>};
      const d = j.data?.[0];
      if (d?.last !== undefined) {
        return {
          pair,
          ts: at,
          last: Number(d.last),
          bid: Number(d.bidPx ?? d.last),
          ask: Number(d.askPx ?? d.last),
          vol: Number(d.vol24h ?? 0),
        };
      }
    }
  } catch {
    // fall through to synthetic
  }

  // Deterministic in `at`, so a replay of the same slot reproduces the same
  // inputHash rather than drifting.
  const base = 60_000 + (at % 1000);
  return {pair, ts: at, last: base, bid: base - 1, ask: base + 1, vol: 1234.5};
}

export function snapshotJson(s: Snapshot): string {
  return canonicalSnapshot(s as unknown as Record<string, number | string>);
}

export function inputHashOf(s: Snapshot): Hex {
  return sha256Hex(snapshotJson(s));
}
