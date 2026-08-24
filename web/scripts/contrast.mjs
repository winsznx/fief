#!/usr/bin/env node
/**
 * Contrast audit for the semantic tokens (plan §11).
 *
 * The plan requires the eight accepted/rejected tokens to be MEASURED, not
 * assumed: light-mode `--accepted` on white is only ~3:1, which is why the
 * design system splits each semantic into a fill role and a separate
 * AA-compliant `-fg` text role (plan §2.1).
 *
 * Converts oklch() -> OKLab -> linear sRGB -> WCAG relative luminance, then
 * reports contrast ratios per theme. Alpha tokens are composited over their
 * theme background first.
 *
 * Targets: 4.5:1 for text, 3:1 for UI components / large text.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(
  fileURLToPath(new URL('../app/globals.css', import.meta.url)),
  'utf8',
);

/* ── oklch parsing ────────────────────────────────────────────────────────── */

function parseOklch(value) {
  const m = value
    .trim()
    .match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/);
  if (!m) return null;
  return {
    L: Number(m[1]),
    C: Number(m[2]),
    h: Number(m[3]),
    alpha: m[4] === undefined ? 1 : Number(m[4]) / 100,
  };
}

/** OKLCH -> linear-light sRGB. */
function oklchToLinearRgb({ L, C, h }) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** WCAG 2.x relative luminance from linear-light sRGB. */
function luminance({ r, g, b }) {
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b);
}

/** Alpha-composite `fg` over `bg` in linear-light space. */
function composite(fg, alpha, bg) {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

function contrast(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── extract a theme's token block ────────────────────────────────────────── */

function extractBlock(selector) {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const m = CSS.match(re);
  if (!m) throw new Error(`contrast: could not find ${selector} block`);
  const tokens = {};
  for (const line of m[1].split('\n')) {
    const t = line.trim().match(/^(--[\w-]+):\s*([^;]+);/);
    if (t) tokens[t[1]] = t[2].trim();
  }
  return tokens;
}

const THEMES = [
  { name: 'light', tokens: extractBlock(':root') },
  { name: 'dark', tokens: extractBlock('\\.dark') },
];

/* ── checks ───────────────────────────────────────────────────────────────── */

const CHECKS = [
  { token: '--accepted-fg', on: '--background', min: 4.5, role: 'text' },
  { token: '--rejected-fg', on: '--background', min: 4.5, role: 'text' },
  { token: '--accepted-fg', on: '--card', min: 4.5, role: 'text on card' },
  { token: '--rejected-fg', on: '--card', min: 4.5, role: 'text on card' },
  { token: '--accepted', on: '--background', min: 3, role: 'UI fill' },
  { token: '--rejected', on: '--background', min: 3, role: 'UI fill' },
  { token: '--accepted-border', on: '--background', min: 1.5, role: 'border' },
  { token: '--rejected-border', on: '--background', min: 1.5, role: 'border' },
  { token: '--muted-foreground', on: '--background', min: 4.5, role: 'secondary text' },
  { token: '--foreground', on: '--background', min: 4.5, role: 'body text' },
];

/**
 * `-fg` tokens are most often rendered on the tinted `-surface`, so also check
 * that pairing: a token can pass on --background yet fail on its own surface.
 */
const SURFACE_CHECKS = [
  { token: '--accepted-fg', surface: '--accepted-surface', min: 4.5 },
  { token: '--rejected-fg', surface: '--rejected-surface', min: 4.5 },
];

let failures = 0;
const rows = [];

for (const theme of THEMES) {
  const bgRaw = parseOklch(theme.tokens['--background']);
  const bgLin = oklchToLinearRgb(bgRaw);

  const resolve = (name) => {
    const raw = theme.tokens[name];
    if (!raw) throw new Error(`contrast: ${theme.name} missing ${name}`);
    const parsed = parseOklch(raw);
    if (!parsed) throw new Error(`contrast: ${theme.name} ${name} is not oklch(): ${raw}`);
    const lin = oklchToLinearRgb(parsed);
    return parsed.alpha < 1 ? composite(lin, parsed.alpha, bgLin) : lin;
  };

  for (const c of CHECKS) {
    const ratio = contrast(luminance(resolve(c.token)), luminance(resolve(c.on)));
    const pass = ratio >= c.min;
    if (!pass) failures += 1;
    rows.push({
      theme: theme.name,
      pair: `${c.token} on ${c.on}`,
      role: c.role,
      ratio,
      min: c.min,
      pass,
    });
  }

  for (const c of SURFACE_CHECKS) {
    const ratio = contrast(luminance(resolve(c.token)), luminance(resolve(c.surface)));
    const pass = ratio >= c.min;
    if (!pass) failures += 1;
    rows.push({
      theme: theme.name,
      pair: `${c.token} on ${c.surface}`,
      role: 'text on own surface',
      ratio,
      min: c.min,
      pass,
    });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log(
  `  ${pad('THEME', 7)}${pad('PAIR', 46)}${pad('ROLE', 22)}${pad('RATIO', 9)}${pad('MIN', 6)}`,
);
console.log(`  ${'-'.repeat(88)}`);
for (const r of rows) {
  console.log(
    `  ${pad(r.theme, 7)}${pad(r.pair, 46)}${pad(r.role, 22)}${pad(
      `${r.ratio.toFixed(2)}:1`,
      9,
    )}${pad(`${r.min}:1`, 6)}${r.pass ? 'ok' : 'FAIL'}`,
  );
}
console.log('');

if (failures > 0) {
  console.error(`✖ contrast: ${failures} pairing(s) below target.\n`);
  process.exit(1);
}
console.log(`✓ contrast: ${rows.length} pairings meet target across both themes\n`);
