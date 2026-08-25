/**
 * COMMIT_LINE construction — mirrors PRD §4 / §5 byte-for-byte.
 *
 * This exists so the frontend fixtures are byte-consistent with what
 * `RecordBook.recordDecision` will actually check on-chain, rather than
 * carrying invented placeholder payloads. That makes <ByteDiffReveal> a
 * visualisation of a real difference instead of a fabricated one (D6).
 *
 * PRD v2 §4.3:
 *   COMMIT_LINE = "FIEFv1|book:<RecordBook 0x..40>|chain:16661|agent:<id>
 *                  |epoch:<E>|slot:<k>|strategy:<H 0x..64>
 *                  |input:<inputHash 0x..64>|renter:<0x..40>"
 *
 * v2 replaced v1's `nonce:<n>` with `slot:<k>`. In v1 the nonce carried both
 * ordering and replay protection; in v2 the slot index does both, because slots
 * are fixed by the epoch schedule and each (agent, epoch, slot) accepts exactly
 * one commit. Carrying both would be redundant and let them disagree.
 *
 * `packages/reference` is the source of truth for these bytes and the contract
 * is tested against its fixtures. `commit.parity.test.ts` asserts this file
 * agrees with it byte-for-byte, so the two cannot drift the way v1 and v2 did.
 *
 * Canonical encodings (PRD §5 step 5) — must match the runtime byte-for-byte:
 *   - addresses  : 42-char 0x-lowercase; a null renter is the ZERO ADDRESS,
 *                  never "0x0"
 *   - bytes32    : 66-char 0x-lowercase
 *   - ids/slots  : decimal ASCII
 *   - the line contains no '"', no '\', no control chars and no '/', so its
 *     bytes are identical inside a JSON string envelope (DECISIONS.md: the
 *     `FIEFv1` prefix is slash-free precisely so the optional JSON \/ escape
 *     can never affect on-chain byte matching)
 */

import type { Decision } from './types';

export const FIEF_PREFIX = 'FIEFv1';

/** The anchor the contract requires immediately before the commit line. */
export const CONTENT_ANCHOR = '"content":"';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export interface CommitLineParts {
  book: `0x${string}`;
  chainId: number;
  tokenId: string;
  epoch: number;
  slot: number;
  strategyHash: `0x${string}`;
  inputHash: `0x${string}`;
  renter: `0x${string}`;
}

export function buildCommitLine(p: CommitLineParts): string {
  return [
    FIEF_PREFIX,
    `book:${p.book.toLowerCase()}`,
    `chain:${p.chainId}`,
    `agent:${p.tokenId}`,
    `epoch:${p.epoch}`,
    `slot:${p.slot}`,
    `strategy:${p.strategyHash.toLowerCase()}`,
    `input:${p.inputHash.toLowerCase()}`,
    `renter:${p.renter.toLowerCase()}`,
  ].join('|');
}

/**
 * EXP — the exact bytes the contract rebuilds from its own state and asserts
 * at `commitOffset` (PRD §5 step 5).
 */
export function buildExpectedCommit(p: CommitLineParts): string {
  return CONTENT_ANCHOR + buildCommitLine(p);
}

export interface RespDataResult {
  /** utf-8 of the provider's OpenAI chat-completion envelope. */
  respData: string;
  /** Byte index of the `"content":"` anchor. ASCII-only, so char index === byte index. */
  commitOffset: number;
}

/**
 * Builds the provider's OpenAI-style envelope around a commit line.
 *
 * PRD §4.1 / correction 7: the TEE signs the provider's FULL JSON envelope, so
 * the echoed commit line is NOT at offset 0 — it lives inside
 * choices[0].message.content. The contract does one memcmp at a
 * caller-supplied offset that the compare itself fully validates.
 */
export function buildRespData(args: {
  chatId: string;
  created: number;
  model: string;
  commitLine: string;
  decision: Decision;
  promptTokens: number;
  completionTokens: number;
}): RespDataResult {
  const decisionJson = JSON.stringify({
    dir: args.decision.dir,
    conf: args.decision.conf,
    size: args.decision.size,
  });

  // Output contract (PRD §12): commit line, newline, then the decision JSON.
  const content = `${args.commitLine}\n${decisionJson}`;

  const head =
    `{"id":"${args.chatId}",` +
    `"object":"chat.completion",` +
    `"created":${args.created},` +
    `"model":"${args.model}",` +
    `"choices":[{"index":0,"message":{"role":"assistant",`;

  // JSON-escape the content body without its surrounding quotes. The commit
  // line survives byte-identical; only the "\n" and the decision JSON's
  // quotes are escaped.
  const encoded = JSON.stringify(content).slice(1, -1);

  const tail =
    `"},"finish_reason":"stop"}],` +
    `"usage":{"prompt_tokens":${args.promptTokens},` +
    `"completion_tokens":${args.completionTokens},` +
    `"total_tokens":${args.promptTokens + args.completionTokens}}}`;

  return {
    respData: head + CONTENT_ANCHOR + encoded + tail,
    commitOffset: head.length,
  };
}

export interface TamperResult {
  tampered: string;
  /** Index within the commit line of the single changed character. */
  charIndex: number;
  original: string;
  replacement: string;
}

/**
 * Flips exactly ONE hex character in the commit line's `strategy:` field.
 *
 * This is the demo's red transaction (PRD §2 headline proof, §17 step 3): the
 * same submission with one tampered byte. The contract builds EXP from its own
 * on-chain H, so the memcmp fails and the entry is rejected with BadCommit.
 *
 * Returned so <ByteDiffReveal> can highlight the genuinely differing byte
 * rather than simulating a diff.
 */
export function tamperStrategyByte(commitLine: string): TamperResult {
  const field = '|strategy:0x';
  const at = commitLine.indexOf(field);
  if (at === -1) throw new Error('tamperStrategyByte: no strategy field in commit line');

  // Target the final hex character of the 64-hex-char strategy hash — the
  // least conspicuous possible single-byte change.
  const charIndex = at + field.length + 63;
  const original = commitLine[charIndex];
  // Deterministic single-character substitution within the hex alphabet.
  const replacement = original === 'f' ? 'e' : 'f';

  return {
    tampered: commitLine.slice(0, charIndex) + replacement + commitLine.slice(charIndex + 1),
    charIndex,
    original,
    replacement,
  };
}

/** First differing character index between two strings, or -1 if identical. */
export function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
