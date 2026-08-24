import { describe, expect, it } from 'vitest';
import { formatDuration, formatOg, truncateHex } from './format';

describe('formatDuration — v1.1 Q3 term rendering', () => {
  it('renders exact day terms, which is every listing term', () => {
    expect(formatDuration(30 * 86_400)).toBe('30 days');
    expect(formatDuration(14 * 86_400)).toBe('14 days');
    expect(formatDuration(86_400)).toBe('1 day');
  });

  it('falls back through hours and minutes', () => {
    expect(formatDuration(7_200)).toBe('2 hours');
    expect(formatDuration(3_600)).toBe('1 hour');
    expect(formatDuration(120)).toBe('2 minutes');
    expect(formatDuration(30)).toBe('30 seconds');
  });

  it('marks a ragged term as approximate rather than rounding it silently', () => {
    // A renter must not read "30 days" for a term that is not 30 days.
    expect(formatDuration(30 * 86_400 + 3_600)).toBe('~30 days');
  });

  it('refuses to invent a duration for a non-positive or non-finite value', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('formatOg', () => {
  it('renders whole and fractional wei without float error', () => {
    expect(formatOg('10000000000000000')).toBe('0.01');
    expect(formatOg('100000000000000000')).toBe('0.1');
    expect(formatOg('1000000000000000000')).toBe('1');
    expect(formatOg('0')).toBe('0');
  });

  it('returns an em dash for an unparseable amount rather than NaN', () => {
    expect(formatOg('not-a-number')).toBe('—');
  });
});

describe('truncateHex', () => {
  it('middle-truncates and leaves short values alone', () => {
    expect(truncateHex(`0x${'a'.repeat(64)}`, 6)).toBe('0xaaaaaa…aaaaaa');
    expect(truncateHex('0xabc', 6)).toBe('0xabc');
    expect(truncateHex('not-hex')).toBe('not-hex');
  });
});
