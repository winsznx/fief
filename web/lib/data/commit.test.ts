import { describe, expect, it } from 'vitest';
import {
  buildCommitLine,
  buildExpectedCommit,
  buildRespData,
  CONTENT_ANCHOR,
  firstDiffIndex,
  tamperStrategyByte,
  ZERO_ADDRESS,
} from './commit';
import type { CommitLineParts } from './commit';

/**
 * These assert that the fixtures are byte-faithful to PRD §4 / §5.
 *
 * The point of the exercise is that <ByteDiffReveal> and the receipt display
 * REAL commitment bytes, not invented placeholders — so the byte layout the
 * contract will check has to actually hold here.
 */

const PARTS: CommitLineParts = {
  book: '0x5c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d',
  chainId: 16661,
  tokenId: '1',
  epoch: 1,
  slot: 42,
  strategyHash: '0x7d1f4a9c2e6b80d35f1a7c4e9b2d60f8a3c5e7b9d1f4a6c8e0b2d4f6a8c0e2b4',
  inputHash: '0xa1c3e5f7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3',
  renter: ZERO_ADDRESS,
};

describe('buildCommitLine — PRD §4 canonical layout', () => {
  const line = buildCommitLine(PARTS);

  it('starts with the slash-free FIEFv1 prefix', () => {
    // DECISIONS.md: the prefix is slash-free so the optional JSON \/ escape
    // can never affect on-chain byte matching.
    expect(line.startsWith('FIEFv1|')).toBe(true);
    expect(line).not.toContain('/');
  });

  it('emits the fields in PRD order', () => {
    expect(line.split('|').map((f) => f.split(':')[0])).toEqual([
      'FIEFv1',
      'book',
      'chain',
      'agent',
      'epoch',
      'slot',
      'strategy',
      'input',
      'renter',
    ]);
  });

  it('uses canonical fixed widths', () => {
    const fields = Object.fromEntries(
      line
        .split('|')
        .slice(1)
        .map((f) => [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)]),
    );
    expect(fields.book).toHaveLength(42); // 0x + 40
    expect(fields.renter).toHaveLength(42);
    expect(fields.strategy).toHaveLength(66); // 0x + 64
    expect(fields.input).toHaveLength(66);
    expect(fields.chain).toBe('16661');
    expect(fields.agent).toBe('1');
    expect(fields.slot).toBe('42');
  });

  it('renders a null renter as the zero address, never "0x0"', () => {
    // PRD §5 step 5 calls this out explicitly.
    expect(line).toContain(`renter:${ZERO_ADDRESS}`);
    expect(line).not.toContain('renter:0x0|');
    expect(line.endsWith('0'.repeat(40))).toBe(true);
  });

  it('contains no JSON-escapable characters', () => {
    // Guarantees the bytes are identical inside a JSON string envelope.
    expect(line).not.toMatch(/["\\]/);
    expect(line).not.toMatch(/[\u0000-\u001f]/);
  });

  it('lowercases hex input', () => {
    const upper = buildCommitLine({
      ...PARTS,
      strategyHash: PARTS.strategyHash.toUpperCase() as `0x${string}`,
    });
    expect(upper).toContain(PARTS.strategyHash.toLowerCase());
  });
});

describe('buildRespData — PRD §4.1 envelope', () => {
  const line = buildCommitLine(PARTS);
  const { respData, commitOffset } = buildRespData({
    chatId: 'chatcmpl-deadbeefdeadbeefdeadbeef',
    created: 1_786_000_000,
    model: 'llama-3.3-70b-instruct',
    commitLine: line,
    decision: { dir: 'UP', conf: 0.72, size: 0.4 },
    promptTokens: 900,
    completionTokens: 110,
  });

  it('is valid JSON and an OpenAI-shaped envelope', () => {
    const parsed = JSON.parse(respData) as {
      choices: { message: { content: string } }[];
    };
    expect(parsed.choices[0].message.content.startsWith(line)).toBe(true);
  });

  it('does NOT put the commitment at offset 0', () => {
    // PRD §0.5 correction 7 — the TEE signs the full envelope, so the echoed
    // commit line lives inside choices[0].message.content.
    expect(commitOffset).toBeGreaterThan(0);
    expect(respData.startsWith('FIEFv1')).toBe(false);
  });

  it('places the `"content":"` anchor exactly at commitOffset', () => {
    expect(respData.slice(commitOffset, commitOffset + CONTENT_ANCHOR.length)).toBe(
      CONTENT_ANCHOR,
    );
  });

  it('satisfies the on-chain memcmp: respData[offset..offset+EXP.len] === EXP', () => {
    // This is the exact assertion RecordBook.recordDecision performs.
    const exp = buildExpectedCommit(PARTS);
    expect(respData.slice(commitOffset, commitOffset + exp.length)).toBe(exp);
  });

  it('is pure ASCII, so char offsets equal byte offsets', () => {
    expect(/^[\x20-\x7e]*$/.test(respData)).toBe(true);
    expect(Buffer.byteLength(respData, 'utf8')).toBe(respData.length);
  });

  it('rejects a decoy earlier `"content":"` by offset mismatch', () => {
    // A wrong offset must not satisfy the compare.
    const exp = buildExpectedCommit(PARTS);
    expect(respData.slice(commitOffset - 1, commitOffset - 1 + exp.length)).not.toBe(exp);
  });
});

describe('tamperStrategyByte — the red transaction', () => {
  const line = buildCommitLine(PARTS);
  const { tampered, charIndex, original, replacement } = tamperStrategyByte(line);

  it('changes exactly one character', () => {
    expect(tampered).toHaveLength(line.length);
    let diffs = 0;
    for (let i = 0; i < line.length; i += 1) if (line[i] !== tampered[i]) diffs += 1;
    expect(diffs).toBe(1);
  });

  it('changes a character inside the strategy field', () => {
    const strategyStart = line.indexOf('|strategy:') + '|strategy:'.length;
    const strategyEnd = strategyStart + 66;
    expect(charIndex).toBeGreaterThanOrEqual(strategyStart);
    expect(charIndex).toBeLessThan(strategyEnd);
  });

  it('substitutes within the hex alphabet, so the field stays well-formed', () => {
    expect(original).toMatch(/^[0-9a-f]$/);
    expect(replacement).toMatch(/^[0-9a-f]$/);
    expect(replacement).not.toBe(original);
    const field = tampered.slice(
      tampered.indexOf('|strategy:') + '|strategy:'.length,
      tampered.indexOf('|strategy:') + '|strategy:'.length + 66,
    );
    expect(field).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is detectable by firstDiffIndex at the tampered position', () => {
    expect(firstDiffIndex(line, tampered)).toBe(charIndex);
  });

  it('would fail the on-chain memcmp against untampered state', () => {
    const exp = buildExpectedCommit(PARTS);
    expect(CONTENT_ANCHOR + tampered).not.toBe(exp);
  });
});

describe('firstDiffIndex', () => {
  it('returns -1 for identical strings', () => {
    expect(firstDiffIndex('abc', 'abc')).toBe(-1);
  });
  it('returns the first differing index', () => {
    expect(firstDiffIndex('abcd', 'abXd')).toBe(2);
  });
  it('returns the shorter length when one is a prefix of the other', () => {
    expect(firstDiffIndex('ab', 'abcd')).toBe(2);
  });
});
