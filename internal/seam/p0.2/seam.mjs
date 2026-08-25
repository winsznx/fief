#!/usr/bin/env node
/**
 * FIEF — P0.2 compute seam spike (independent verification, no product code).
 *
 * Purpose: prove the exact seam the on-chain RecordBook will depend on, BEFORE
 * we write any product code. It performs, end to end, against a live 0G Compute
 * TeeML provider:
 *
 *   1. list acknowledged TeeML decentralized providers on the target network
 *   2. fund ledger (>=3 OG) + provider sub-account (>=1 OG) if needed
 *   3. run ONE real inference sending our EXACT canonical request bytes
 *   4. fetch the TEE signature: GET {endpoint}/signature/{chatID}?model={model}
 *   5. HARD: recompute sha256hex(reqBody):sha256hex(respData) and assert it
 *      equals the provider-signed `text` (== no broker proxy mutation of bytes)
 *   6. HARD: assert `text` is exactly 129 ASCII bytes
 *   7. HARD: EIP-191 recover the signer and assert == returned signing_address
 *   8. HARD (P0.3): independently staticcall InferenceServing.getService(provider)
 *      and assert recovered signer == teeSignerAddress AND teeSignerAcknowledged.
 *      This is the exact read the future Solidity RecordBook will perform.
 *
 * It also records, as NON-fatal observations feeding contract design:
 *   - the concrete shape of respData (the signed bytes) — the OpenAI JSON
 *     envelope, so COMMIT_LINE lives inside choices[0].message.content, NOT at
 *     offset 0 of respData (revisit PRD §5 "parse COMMIT_LINE at offset 0").
 *   - on mismatch, a canonicalization prober that tries several serializations
 *     to pinpoint how the broker normalized the request before hashing.
 *   - the SDK's own processResponse() result, to contrast with our (stronger) check.
 *
 * Artifacts + PASS/FAIL report are written to ./report/. Secrets are never logged.
 *
 * Run:  NETWORK=mainnet PRIVATE_KEY=0x... node seam.mjs
 *       NETWORK=testnet PRIVATE_KEY=0x... node seam.mjs   (pre-approved narrowing)
 */

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(HERE, 'report');

// ---------------------------------------------------------------- config ----
const NETWORK = (process.env.NETWORK || 'mainnet').toLowerCase();
const RPC =
  process.env.RPC ||
  (NETWORK === 'testnet' ? 'https://evmrpc-testnet.0g.ai' : 'https://evmrpc.0g.ai');
const CHAIN_ID = NETWORK === 'testnet' ? 16602 : 16661;
const INFERENCE_CA =
  NETWORK === 'testnet'
    ? '0xa79F4c8311FF93C06b8CfB403690cc987c93F91E'
    : '0x47340d900bdFec2BD393c626E12ea0656F938d84';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PIN_PROVIDER = (process.env.PROVIDER || '').trim(); // optional: force a provider address
const PIN_MODEL = (process.env.MODEL || '').trim();       // optional: force a model id
const LEDGER_OG = Number(process.env.LEDGER_OG || '3');   // initial ledger (>=3)
const SUBACCOUNT_OG = Number(process.env.SUBACCOUNT_OG || '1'); // per-provider (>=1)

// COMMIT_LINE fields — canonical fixed-width; must match what the model echoes AND what the
// Solidity RecordBook rebuilds (PRD §5). Addresses 0x-lowercase 42 chars; bytes32 0x-lowercase 66 chars.
const ZERO_ADDR = '0x' + '0'.repeat(40);
const ZERO_H = '0x' + '0'.repeat(64);
const BOOK = (process.env.BOOK || ZERO_ADDR).toLowerCase();          // placeholder RecordBook until P4 deploys it
const STRATEGY_H = (process.env.STRATEGY_H || ZERO_H).toLowerCase(); // placeholder strategy hash until sealing
const RENTER = (process.env.RENTER || ZERO_ADDR).toLowerCase();      // zero-address == no renter
const AGENT_ID = process.env.AGENT_ID || '1';
const EPOCH = process.env.EPOCH || '0';
const NONCE = process.env.NONCE || '1';

// getService(address) — minimal human-readable ABI. Field order/types confirmed
// 2026-08-19 against the SDK's InferenceServing typechain bindings. We also
// cross-check the decoded teeSignerAddress against the SDK, so a wrong ABI fails loud.
const SERVING_ABI = [
  'function getService(address provider) view returns ((address provider,string serviceType,string url,uint256 inputPrice,uint256 outputPrice,uint256 updatedAt,string model,string verifiability,string additionalInfo,address teeSignerAddress,bool teeSignerAcknowledged))',
];

// ---------------------------------------------------------------- helpers ----
const sha256hex = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const lc = (s) => (s || '').toString().toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let step = 0;
const log = (...a) => console.log(...a);
const stepLog = (msg) => log(`\n[${String(++step).padStart(2, '0')}] ${msg}`);

const checks = [];
function check(name, pass, detail = undefined, advisory = false) {
  checks.push({ name, pass: !!pass, advisory, detail });
  const tag = pass ? 'PASS' : advisory ? 'WARN' : 'FAIL';
  log(`   ${tag}  ${name}${advisory ? '  (advisory)' : ''}`);
  if (detail !== undefined && !pass) log(`         detail: ${JSON.stringify(detail)}`);
}

const notes = [];
const note = (k, v) => {
  notes.push({ k, v });
  log(`   NOTE  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
};

function fail(msg) {
  console.error(`\nFATAL: ${msg}`);
  writeReport(false, msg);
  process.exit(1);
}

function writeReport(passed, fatal = null) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    spike: 'P0.2 compute seam',
    when: new Date().toISOString(),
    network: NETWORK,
    chainId: CHAIN_ID,
    rpc: RPC,
    inferenceContract: INFERENCE_CA,
    passed,
    fatal,
    checks,
    notes,
  };
  writeFileSync(join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  log(`\nReport written to ${join(REPORT_DIR, 'report.json')}`);
}

// ------------------------------------------------------------------- main ----
async function main() {
  if (!PRIVATE_KEY) fail('Set PRIVATE_KEY (a funded wallet). Never commit it.');
  mkdirSync(REPORT_DIR, { recursive: true });

  stepLog(`Connect ${NETWORK} (chainId ${CHAIN_ID}) via ${RPC}`);
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const bal = await provider.getBalance(wallet.address);
  log(`   wallet ${wallet.address}  balance ${ethers.formatEther(bal)} OG`);
  check('wallet has gas (> 0)', bal > 0n);

  stepLog('Init 0G Compute broker');
  const broker = await createZGComputeNetworkBroker(wallet);

  stepLog('Ensure ledger + provider sub-account funded');
  let ledgerOk = true;
  try {
    const led = await broker.ledger.getLedger();
    log(`   ledger exists (balance field present: ${led !== undefined})`);
  } catch {
    ledgerOk = false;
  }
  if (!ledgerOk) {
    log(`   no ledger -> addLedger(${LEDGER_OG})`);
    await broker.ledger.addLedger(LEDGER_OG);
  }

  stepLog('Discover a TeeML decentralized provider (acknowledged-only list)');
  const services = await broker.inference.listService(); // default: acknowledged only
  const teeml = services.filter((s) => {
    const verif = (s.verifiability || '').toString();
    let ptype = 'decentralized';
    try {
      ptype = JSON.parse(s.additionalInfo || '{}').ProviderType || 'decentralized';
    } catch {}
    return verif.includes('TeeML') && ptype !== 'centralized';
  });
  log(`   ${services.length} acknowledged services, ${teeml.length} are TeeML/decentralized`);
  note(
    'teeml_providers',
    teeml.map((s) => ({ provider: s.provider, model: s.model, verifiability: s.verifiability })),
  );

  const chosen = PIN_PROVIDER
    ? services.find((s) => lc(s.provider) === lc(PIN_PROVIDER))
    : teeml[0];
  if (!chosen) {
    fail(
      PIN_PROVIDER
        ? `PROVIDER ${PIN_PROVIDER} not found in the acknowledged service list.`
        : `No TeeML decentralized provider on ${NETWORK}. Try NETWORK=testnet (pre-approved narrowing) or escalate to 0G DevRel.`,
    );
  }
  const providerAddr = chosen.provider;
  log(`   using provider ${providerAddr} (model ${chosen.model})`);

  stepLog('Confirm provider TEE signer acknowledged; fund sub-account; user-acknowledge');
  const status = await broker.inference.checkProviderSignerStatus(providerAddr);
  check('provider teeSigner acknowledged by contract owner', status.isAcknowledged, {
    teeSignerAddress: status.teeSignerAddress,
  });
  if (!status.isAcknowledged) fail('Chosen provider is not acknowledged; pick another.');

  try {
    await broker.ledger.transferFund(providerAddr, 'inference', BigInt(SUBACCOUNT_OG) * 10n ** 18n);
    log(`   sub-account funded (${SUBACCOUNT_OG} OG) — auto-acknowledges TEE signer`);
  } catch (e) {
    log(`   transferFund note (may already be funded): ${e.message}`);
  }
  try {
    if (!(await broker.inference.acknowledged(providerAddr))) {
      await broker.inference.acknowledgeProviderSigner(providerAddr);
      log('   user acknowledgeProviderSigner: done');
    }
  } catch (e) {
    log(`   acknowledgeProviderSigner note: ${e.message}`);
  }

  stepLog('Build EXACT canonical request bytes + demo COMMIT_LINE output contract');
  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddr,
    PIN_MODEL || undefined,
  );
  log(`   endpoint ${endpoint}  model ${model}`);

  const snapshot = { pair: 'BTC-USDT', ts: 1755600000, last: 60000, bid: 59999, ask: 60001, vol: 1234.5 };
  const snapshotStr = JSON.stringify(snapshot);
  const inputHash = '0x' + sha256hex(snapshotStr); // bytes32, canonical 0x + 64 hex
  const COMMIT_LINE =
    `FIEFv1|book:${BOOK}|chain:${CHAIN_ID}|agent:${AGENT_ID}|epoch:${EPOCH}|nonce:${NONCE}|strategy:${STRATEGY_H}|input:${inputHash}|renter:${RENTER}`;

  const system =
    'You are a BTC short-horizon direction agent. Output the following commitment ' +
    'line as the FIRST line of your reply, verbatim, then a newline, then a compact ' +
    'JSON decision {"dir":"UP|DOWN|FLAT","conf":0..1,"size":0..1}. Commitment line:\n' +
    COMMIT_LINE;
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Snapshot: ${snapshotStr}` },
    ],
    temperature: 0,
    // Reasoning models (e.g. glm-5.2) spend this budget on reasoning tokens before
    // emitting any content. At 256 the live run returned finish_reason=length with a
    // single character of content, which looked like a model-compliance failure but was
    // truncation. Keep generous headroom so the COMMIT_LINE echo can actually complete.
    max_tokens: Number(process.env.MAX_TOKENS || '4096'),
    stream: false,
  };
  const bodyStr = JSON.stringify(body); // <-- these are the exact bytes we send + hash
  const reqSha = sha256hex(bodyStr);
  writeFileSync(join(REPORT_DIR, 'request.json'), bodyStr);
  log(`   sha256(reqBody) = ${reqSha}`);

  stepLog('Send inference (our exact bytes; auth header only, no SDK re-serialize)');
  const authHeaders = Object.fromEntries(
    Object.entries(await broker.inference.getRequestHeaders(providerAddr)).filter(
      ([, v]) => typeof v === 'string',
    ),
  );
  const chatUrl = `${endpoint}/chat/completions`;
  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: bodyStr,
  });
  const respText = await res.text(); // <-- exact response bytes we hash
  writeFileSync(join(REPORT_DIR, 'response.json'), respText);
  const respSha = sha256hex(respText);
  log(`   HTTP ${res.status}  sha256(respData) = ${respSha}`);
  check('inference HTTP 200', res.status === 200, { status: res.status, bodyPreview: respText.slice(0, 300) });
  if (res.status !== 200) fail('Inference call failed; see report/response.json');

  const chatID =
    res.headers.get('ZG-Res-Key') ||
    res.headers.get('zg-res-key') ||
    (() => {
      try {
        return JSON.parse(respText).id;
      } catch {
        return null;
      }
    })();
  check('chatID present (ZG-Res-Key header or data.id)', !!chatID, { chatID });
  if (!chatID) fail('No chatID; cannot fetch signature.');

  stepLog('Fetch TEE signature (retry a few times; may lag the response)');
  const sigUrl = `${endpoint}/signature/${chatID}?model=${model}`;
  let sig = null;
  for (let i = 0; i < 6 && !sig; i++) {
    const r = await fetch(sigUrl, { headers: { 'Content-Type': 'application/json' } });
    if (r.status === 200) {
      sig = await r.json();
      break;
    }
    log(`   signature not ready (HTTP ${r.status}), retrying...`);
    await sleep(1500);
  }
  if (!sig) fail(`Signature endpoint never returned 200 for ${sigUrl}`);
  writeFileSync(join(REPORT_DIR, 'signature.json'), JSON.stringify(sig, null, 2));
  log(`   signing_address ${sig.signing_address}  algo ${sig.signing_algo}`);

  stepLog('CORE ASSERTIONS');
  const ourText = `${reqSha}:${respSha}`;
  check('signed text length == 129', (sig.text || '').length === 129, { len: (sig.text || '').length });
  check('signing_algo == ecdsa', lc(sig.signing_algo) === 'ecdsa', { algo: sig.signing_algo });

  const noMutation = sig.text === ourText;
  check('no proxy mutation: sha256(reqBody):sha256(respData) == provider text', noMutation, {
    ourText,
    providerText: sig.text,
  });

  if (!noMutation) {
    // Diagnostic: figure out how the broker normalized the request before hashing.
    const providerReqSha = (sig.text || '').split(':')[0];
    const parsed = JSON.parse(bodyStr);
    const candidates = {
      'as-sent': bodyStr,
      'roundtrip JSON.stringify(parse)': JSON.stringify(parsed),
      'compact (no spaces already)': JSON.stringify(parsed),
      'sorted top-level keys': JSON.stringify(parsed, Object.keys(parsed).sort()),
      'messages-only': JSON.stringify(parsed.messages),
    };
    const matches = Object.entries(candidates)
      .map(([k, v]) => [k, sha256hex(v) === providerReqSha])
      .filter(([, m]) => m)
      .map(([k]) => k);
    note('mutation_prober_matches', matches.length ? matches : 'NONE — broker canonicalization unknown');
    note('provider_reqSha_prefix', providerReqSha);
  }

  const recovered = ethers.verifyMessage(sig.text, sig.signature); // EIP-191 personal_sign recover
  check(
    'recovered signer == returned signing_address',
    lc(recovered) === lc(sig.signing_address),
    { recovered, signing_address: sig.signing_address },
  );

  stepLog('P0.3 — independent on-chain getService() read (mirrors future Solidity)');
  const serving = new ethers.Contract(INFERENCE_CA, SERVING_ABI, provider);
  const svc = await serving.getService(providerAddr);
  const onchainSigner = svc.teeSignerAddress;
  const onchainAck = svc.teeSignerAcknowledged;
  log(`   getService().teeSignerAddress = ${onchainSigner}  acknowledged = ${onchainAck}`);
  check('on-chain teeSignerAcknowledged == true', onchainAck === true);
  check('ABI sanity: on-chain signer == SDK checkProviderSignerStatus', lc(onchainSigner) === lc(status.teeSignerAddress), {
    onchainSigner,
    sdkSigner: status.teeSignerAddress,
  });
  check('recovered signer == on-chain getService().teeSignerAddress', lc(recovered) === lc(onchainSigner), {
    recovered,
    onchainSigner,
  });

  stepLog('Parse-path proof — mirrors the §5 on-chain build-EXP + byte memcmp');
  let content = null;
  try {
    content = JSON.parse(respText)?.choices?.[0]?.message?.content ?? null;
  } catch {}
  note('respData_is_openai_envelope', true);

  // (a) Deterministic self-test of the parse algorithm — independent of live model compliance.
  //     This is the HARD proof that the Solidity build-EXP + memcmp logic is correct.
  {
    const demoContent = `${COMMIT_LINE}\n{"dir":"UP","conf":0.62,"size":0.5}`;
    const synth = JSON.stringify({
      id: 'chatcmpl-selftest',
      object: 'chat.completion',
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: demoContent }, finish_reason: 'stop' }],
      usage: {},
    });
    const synthBuf = Buffer.from(synth, 'utf8');
    const expBuf = Buffer.from('"content":"' + COMMIT_LINE, 'utf8');
    const off = synthBuf.indexOf(expBuf);
    check('[selftest] EXP located in synthetic compact envelope', off >= 0, { off });
    check(
      '[selftest] byte-slice at offset == EXP (memcmp parity with Solidity)',
      off >= 0 && synthBuf.subarray(off, off + expBuf.length).equals(expBuf),
    );
    // decoy: an earlier "content":"..." must NOT be matched by the full-EXP search
    const decoy =
      '{"choices":[{"message":{"role":"assistant","content":"decoy"}},' +
      '{"message":{"role":"assistant","content":' +
      JSON.stringify(demoContent) +
      '}}]}';
    const decoyBuf = Buffer.from(decoy, 'utf8');
    const decoyExpOff = decoyBuf.indexOf(expBuf);
    const firstAnchorOff = decoyBuf.indexOf(Buffer.from('"content":"', 'utf8'));
    check('[selftest] full-EXP search skips a decoy "content" field', decoyExpOff >= 0 && decoyExpOff > firstAnchorOff, {
      decoyExpOff,
      firstAnchorOff,
    });
  }

  // (b) Live proof against the real provider respData. ADVISORY: depends on the model echoing
  //     COMMIT_LINE verbatim and on the provider JSON style (compact vs spaced anchor, "/" escaping).
  {
    const respBuf = Buffer.from(respText, 'utf8');
    const anchors = ['"content":"', '"content": "'];
    let matchedAnchor = null;
    let commitOffset = -1;
    let expBuf = null;
    for (const a of anchors) {
      const eb = Buffer.from(a + COMMIT_LINE, 'utf8');
      const off = respBuf.indexOf(eb);
      if (off >= 0) {
        matchedAnchor = a;
        commitOffset = off;
        expBuf = eb;
        break;
      }
    }
    if (commitOffset >= 0) {
      const memcmpOk = respBuf.subarray(commitOffset, commitOffset + expBuf.length).equals(expBuf);
      check('[parse-path] live: EXP found + byte memcmp OK at commitOffset', memcmpOk, { commitOffset, matchedAnchor }, true);
      note('live_commitOffset', commitOffset);
      note('live_anchor_bytes', matchedAnchor);
      note('EXP_length_bytes', expBuf.length);
      note('recordDecision_args_for_contract', { inputHash, renter: RENTER, commitOffset });
    } else {
      const clOff = respBuf.indexOf(Buffer.from(COMMIT_LINE, 'utf8'));
      if (clOff >= 0) {
        const preceding = respBuf.subarray(Math.max(0, clOff - 24), clOff).toString('utf8');
        check('[parse-path] live anchor is "content":" or "content": "', false, { precedingBytes: preceding }, true);
        note('ACTION set the Solidity anchor to the bytes immediately preceding COMMIT_LINE', preceding);
      } else {
        check(
          '[parse-path] live: model echoed COMMIT_LINE verbatim inside content',
          false,
          { contentPreview: content ? content.slice(0, 200) : null },
          true,
        );
        note('ACTION', 'Model did not echo COMMIT_LINE verbatim; strengthen the output contract or pick a more instruction-following model. Seam checks are unaffected.');
      }
    }
  }

  // SDK's own verification for contrast (it trusts the provider `text`; ours recomputes).
  try {
    let usage = '{}';
    try {
      usage = JSON.stringify(JSON.parse(respText).usage || {});
    } catch {}
    const sdkVerify = await broker.inference.processResponse(providerAddr, chatID, usage);
    note('sdk_processResponse_result', sdkVerify);
  } catch (e) {
    note('sdk_processResponse_result', `error: ${e.message}`);
  }

  const hardChecks = checks.filter((c) => !c.advisory);
  const allPass = hardChecks.every((c) => c.pass);
  const advisoryFails = checks.filter((c) => c.advisory && !c.pass);
  stepLog(
    allPass
      ? 'RESULT: PASS — P0.2 seam green + parse algorithm proven (hard checks)'
      : 'RESULT: FAIL — see failing hard checks above',
  );
  if (allPass && advisoryFails.length) {
    log(
      `   WARN: ${advisoryFails.length} advisory (live parse-path) check(s) need attention. ` +
        'The seam + parse algorithm are proven; confirm the live anchor bytes / model echo before writing Solidity.',
    );
  }
  writeReport(allPass);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => fail(e?.stack || e?.message || String(e)));
