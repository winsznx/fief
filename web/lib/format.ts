/**
 * Formatting helpers. Every numeric/hash render path goes through here so the
 * `.tnum` tabular-numeral rule and truncation behaviour stay consistent
 * (plan §2.3).
 */

/** Middle-truncates a hash or address: 0x1234…abcd */
export function truncateHex(value: string, chars = 6): string {
  if (!value.startsWith('0x')) return value;
  const body = value.slice(2);
  if (body.length <= chars * 2) return value;
  return `0x${body.slice(0, chars)}…${body.slice(-chars)}`;
}

/** OG amount from a wei string. Never rounds silently past 6 dp. */
export function formatOg(wei: string, dp = 4): string {
  let value: bigint;
  try {
    value = BigInt(wei);
  } catch {
    return '—';
  }
  const base = 10n ** 18n;
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, '0').slice(0, dp).replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

/** Percentage with no trailing .00 — 100 stays "100", 99.96 stays "99.96". */
export function formatPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Fixed-width confidence/size rendering: 0.72 → "0.72" */
export function formatUnit(value: number): string {
  return value.toFixed(2);
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
  hour12: false,
});

/** Deterministic UTC timestamp. Avoids locale/timezone drift in screenshots. */
export function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return `${DATE_FMT.format(new Date(t))} UTC`;
}

/** Compact time for dense ledger rows. */
export function formatTimeShort(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

/** Thousands-separated integer. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** "in 29 days" / "expired" — used by grant countdowns. */
export function formatRelativeExpiry(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const ms = t - now;
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `in ${mins} minute${mins === 1 ? '' : 's'}`;
}
