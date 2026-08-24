#!/usr/bin/env node
/**
 * Copy guard — handoff §3 / §10.
 *
 * Fails the build if a forbidden phrase appears anywhere in the source of
 * app/, components/ or lib/. This is the real enforcement: `lib/copy.ts` can
 * only ever check strings that are routed through it, whereas a forbidden word
 * is most likely to be typed straight into JSX.
 *
 * `lib/copy.ts` itself is scanned only outside its FORBIDDEN declaration —
 * that array necessarily contains the words.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FORBIDDEN = ['trustless', 'unextractable', 'impossible to fake', 'guaranteed profit'];

const ROOTS = ['app', 'components', 'lib'];
const EXTS = new Set(['.ts', '.tsx', '.mts', '.css']);

/** The FORBIDDEN declaration in lib/copy.ts is the allowed exception. */
const ALLOWLIST = new Set(['lib/copy.ts']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(name))) out.push(full);
  }
  return out;
}

const files = [];
for (const root of ROOTS) {
  const abs = join(WEB_ROOT, root);
  try {
    if (statSync(abs).isDirectory()) walk(abs, files);
  } catch {
    // root not present — skip
  }
}

const hits = [];
for (const file of files) {
  const rel = relative(WEB_ROOT, file).split('\\').join('/');
  if (ALLOWLIST.has(rel)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const word of FORBIDDEN) {
      if (lower.includes(word)) {
        hits.push({ file: rel, line: i + 1, word, text: line.trim() });
      }
    }
  });
}

if (hits.length > 0) {
  console.error('\n✖ copy-guard: forbidden phrase(s) found.\n');
  console.error('  Handoff §3 forbids these in shipped copy. Use lib/copy.ts APPROVED phrases.\n');
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  "${h.word}"`);
    console.error(`    ${h.text}\n`);
  }
  process.exit(1);
}

console.log(`✓ copy-guard: ${files.length} files clean (${FORBIDDEN.length} phrases checked)`);
