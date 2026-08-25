#!/usr/bin/env node
/**
 * Fail if the README asserts something the claims ledger does not back.
 *
 * The point is narrow and worth stating: this project's pitch is that numbers
 * cannot be quietly edited. A README that drifts ahead of its evidence would be
 * the exact failure the product exists to prevent, committed by the product's
 * own marketing.
 *
 * So every contract address and transaction hash the README shows must appear
 * in claims.yaml, and every claim marked verified must carry evidence.
 *
 *   node scripts/check-claims.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const ledgerRaw = readFileSync(join(root, 'claims.yaml'), 'utf8');

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures += 1;
};
const ok = (msg) => console.log(`  ok    ${msg}`);

/* Addresses and hashes the README puts in front of a reader. */
const addresses = [...new Set(readme.match(/0x[0-9a-fA-F]{40}\b/g) ?? [])];
const hashes = [...new Set(readme.match(/0x[0-9a-fA-F]{64}\b/g) ?? [])];

const ledgerLower = ledgerRaw.toLowerCase();

for (const a of addresses) {
  if (ledgerLower.includes(a.toLowerCase())) ok(`address in ledger: ${a}`);
  else fail(`README shows ${a} but claims.yaml never mentions it`);
}

for (const h of hashes) {
  // The README abbreviates hashes in link text but carries the full value in
  // the href, so match on the full form.
  if (ledgerLower.includes(h.toLowerCase())) ok(`tx in ledger: ${h.slice(0, 12)}…`);
  else fail(`README shows tx ${h.slice(0, 12)}… but claims.yaml never mentions it`);
}

/* Every verified claim needs evidence. A verified row with no evidence is the
   same thing as an unverified claim wearing a badge. */
const blocks = ledgerRaw.split(/\n  - id: /).slice(1);
for (const b of blocks) {
  const id = b.split('\n')[0].trim();
  const status = /status:\s*(\S+)/.exec(b)?.[1];
  const hasEvidence = /evidence:\s*\n\s+- /.test(b);
  if (status === 'verified' && !hasEvidence) fail(`claim "${id}" is verified with no evidence`);
}

/* A percentage in the README must appear in the ledger too. This is the check
   that would have caught a "100%" written while the chain said 99.92%. */
for (const pct of new Set(readme.match(/\b\d{1,3}(?:\.\d+)?%/g) ?? [])) {
  if (ledgerLower.includes(pct.toLowerCase())) ok(`percentage in ledger: ${pct}`);
  else fail(`README claims ${pct} but claims.yaml does not record it`);
}

console.log(
  failures === 0
    ? `\n✓ claims: README is backed by the ledger (${addresses.length} addresses, ${hashes.length} txs)`
    : `\n✗ claims: ${failures} unbacked assertion(s) in README.md`,
);
process.exit(failures === 0 ? 0 : 1);
