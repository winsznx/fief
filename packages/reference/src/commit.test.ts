import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  CONTENT_ANCHOR,
  ZERO_ADDRESS,
  ZERO_HASH,
  buildCommitLine,
  buildExpectedCommit,
  buildRespData,
  canonicalSnapshot,
  commitMatchesAt,
  findCommitOffset,
  firstDiffIndex,
  tamperStrategyByte,
} from './commit.js';
import type { Address, CommitLineParts, Hex } from './types.js';

const BOOK = '0x00000000000000000000000000000000000000b0' as Address;
const H = `0x${'ab'.repeat(32)}` as Hex;
const INPUT = `0x${'cd'.repeat(32)}` as Hex;

const parts = (over: Partial<CommitLineParts> = {}): CommitLineParts => ({
  book: BOOK,
  chainId: 16661,
  agentId: '1',
  epochId: 4,
  slot: 182,
  strategyHash: H,
  inputHash: INPUT,
  renter: ZERO_ADDRESS,
  ...over,
});

describe('COMMIT_LINE', () => {
  it('uses the v2 slot field, not the v1 nonce field', () => {
    const line = buildCommitLine(parts());
    expect(line).toContain('|slot:182|');
    expect(line).not.toContain('nonce:');
  });

  it('is JSON-string-safe so its bytes survive the envelope unchanged', () => {
    const line = buildCommitLine(parts());
    // Round-tripping through JSON must not alter a single byte.
    expect(JSON.stringify(line).slice(1, -1)).toBe(line);
    expect(line).not.toContain('/');
    expect(line).not.toContain('\\');
    expect(line).not.toContain('"');
  });

  it('canonicalises addresses and hashes to lowercase fixed widths', () => {
    const line = buildCommitLine(
      parts({
        book: BOOK.toUpperCase().replace('0X', '0x') as Address,
        strategyHash: H.toUpperCase().replace('0X', '0x') as Hex,
      }),
    );
    expect(line).toContain(`book:${BOOK}`);
    expect(line).toContain(`strategy:${H}`);
  });

  it('renders a null renter as the full zero address, never "0x0"', () => {
    const line = buildCommitLine(parts());
    expect(line).toContain(`renter:${ZERO_ADDRESS}`);
    expect(line).not.toContain('renter:0x0|');
    expect(line.endsWith(ZERO_ADDRESS)).toBe(true);
  });

  it('rejects a line that would need JSON escaping', () => {
    expect(() => buildCommitLine(parts({ agentId: 'a/b' }))).toThrow(/JSON-unsafe/);
  });
});

describe('EXP and the on-chain memcmp', () => {
  it('locates EXP in a live-shaped envelope and matches byte-for-byte', () => {
    const line = buildCommitLine(parts());
    const { respData, commitOffset } = buildRespData({
      chatId: 'chat-1',
      created: 1_755_600_000,
      model: 'glm-5.2',
      commitLine: line,
      decision: { dir: 'UP', conf: 0.7, size: 0.25 },
      promptTokens: 120,
      completionTokens: 40,
    });
    const exp = buildExpectedCommit(parts());

    expect(findCommitOffset(respData, exp)).toBe(commitOffset);
    expect(commitMatchesAt(respData, exp, commitOffset)).toBe(true);
  });

  it('uses the compact anchor confirmed against a live provider', () => {
    expect(CONTENT_ANCHOR).toBe('"content":"');
  });

  it('rejects a wrong offset', () => {
    const line = buildCommitLine(parts());
    const { respData, commitOffset } = buildRespData({
      chatId: 'c',
      created: 1,
      model: 'm',
      commitLine: line,
      decision: { dir: 'DOWN', conf: 0.5, size: 0.1 },
      promptTokens: 1,
      completionTokens: 1,
    });
    const exp = buildExpectedCommit(parts());
    expect(commitMatchesAt(respData, exp, commitOffset + 1)).toBe(false);
    expect(commitMatchesAt(respData, exp, commitOffset - 1)).toBe(false);
    expect(commitMatchesAt(respData, exp, -1)).toBe(false);
    expect(commitMatchesAt(respData, exp, 10_000_000)).toBe(false);
  });

  it('skips a decoy "content" field appearing before the real one', () => {
    const line = buildCommitLine(parts());
    const { respData, commitOffset } = buildRespData({
      chatId: 'c',
      created: 1,
      model: 'm',
      commitLine: line,
      decision: { dir: 'UP', conf: 0.9, size: 0.5 },
      promptTokens: 1,
      completionTokens: 1,
      decoy: 'not the commit line',
    });
    const exp = buildExpectedCommit(parts());

    const decoyAnchor = respData.indexOf(CONTENT_ANCHOR);
    const found = findCommitOffset(respData, exp);

    expect(decoyAnchor).toBeGreaterThanOrEqual(0);
    expect(found).toBeGreaterThan(decoyAnchor); // the decoy anchor came first
    expect(found).toBe(commitOffset);
    expect(commitMatchesAt(respData, exp, found)).toBe(true);
  });

  it('rejects a mismatched inputHash or renter', () => {
    const line = buildCommitLine(parts());
    const { respData, commitOffset } = buildRespData({
      chatId: 'c',
      created: 1,
      model: 'm',
      commitLine: line,
      decision: { dir: 'FLAT', conf: 0.1, size: 0 },
      promptTokens: 1,
      completionTokens: 1,
    });

    const wrongInput = buildExpectedCommit(parts({ inputHash: ZERO_HASH }));
    const wrongRenter = buildExpectedCommit(
      parts({ renter: '0x00000000000000000000000000000000000000ff' as Address }),
    );
    expect(commitMatchesAt(respData, wrongInput, commitOffset)).toBe(false);
    expect(commitMatchesAt(respData, wrongRenter, commitOffset)).toBe(false);
  });

  it('rejects every single-field mutation of the commit line', () => {
    const line = buildCommitLine(parts());
    const { respData, commitOffset } = buildRespData({
      chatId: 'c',
      created: 1,
      model: 'm',
      commitLine: line,
      decision: { dir: 'UP', conf: 0.5, size: 0.5 },
      promptTokens: 1,
      completionTokens: 1,
    });

    const mutations: CommitLineParts[] = [
      parts({ book: '0x00000000000000000000000000000000000000b1' as Address }),
      parts({ chainId: 16602 }),
      parts({ agentId: '2' }),
      parts({ epochId: 5 }),
      parts({ slot: 183 }),
      parts({ strategyHash: ZERO_HASH }),
      parts({ inputHash: ZERO_HASH }),
      parts({ renter: '0x00000000000000000000000000000000000000ff' as Address }),
    ];

    for (const m of mutations) {
      expect(commitMatchesAt(respData, buildExpectedCommit(m), commitOffset)).toBe(false);
    }
  });

  it('a one-byte strategy tamper breaks the match (the demo red tx)', () => {
    const line = buildCommitLine(parts());
    const t = tamperStrategyByte(line);

    expect(t.tampered).toHaveLength(line.length);
    expect(firstDiffIndex(line, t.tampered)).toBe(t.charIndex);

    const { respData, commitOffset } = buildRespData({
      chatId: 'c',
      created: 1,
      model: 'm',
      commitLine: t.tampered,
      decision: { dir: 'UP', conf: 0.5, size: 0.5 },
      promptTokens: 1,
      completionTokens: 1,
    });
    // The contract rebuilds EXP from its own untampered H, so this must fail.
    expect(commitMatchesAt(respData, buildExpectedCommit(parts()), commitOffset)).toBe(false);
  });

  it('offsets are byte offsets, not char offsets, when the envelope is non-ASCII', () => {
    const line = buildCommitLine(parts());
    // A multi-byte character before the anchor desynchronises char and byte
    // indexing; the contract only ever sees bytes.
    const envelope = `{"note":"héllo ✓","choices":[{"message":{${CONTENT_ANCHOR}${line}"}}]}`;
    const exp = buildExpectedCommit(parts());

    const byteOffset = findCommitOffset(envelope, exp);
    const charOffset = envelope.indexOf(exp);

    expect(byteOffset).toBeGreaterThan(charOffset);
    expect(commitMatchesAt(envelope, exp, byteOffset)).toBe(true);
    expect(commitMatchesAt(envelope, exp, charOffset)).toBe(false);
  });
});

describe('canonicalSnapshot', () => {
  it('is key-order independent', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.double({ noNaN: true })),
        (obj) => {
          const shuffled = Object.fromEntries(Object.entries(obj).reverse());
          expect(canonicalSnapshot(shuffled)).toBe(canonicalSnapshot(obj));
        },
      ),
    );
  });
});
