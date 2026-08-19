# Fief — Frontend Handoff (v1)

**For:** [@JemIIahh](https://github.com/JemIIahh) (frontend). **From:** [@winsznx](https://github.com/winsznx) (owner). **Date:** 2026-08-20.
**Goal:** build the entire Fief UI — landing → dashboard — against a typed **mock data layer**, so the owner can wire real 0G chain / runtime / Supabase data behind the same interfaces without touching your components.

---

## 0. TL;DR

- `web/` is already a standard Next.js (App Router) + TypeScript + Tailwind + shadcn/ui scaffold. The typed mock `DataSource` in `web/lib/data/` is the contract — do not invent a parallel one.
- You build **all pages** in §5 against that mock. The owner later drops in a `LiveDataSource` with the same shape.
- **Do not** integrate real contracts, the runtime, 0G Compute/Storage, or Supabase. That's the owner's half.
- Work on a **branch**, open a **PR into `main`**, request review from **@winsznx**. See `CONTRIBUTING.md`.
- Copy discipline is a hard rule: **never** write "trustless", "unextractable", or "impossible to fake" (§3).

---

## 1. What Fief is (so the UI tells the right story)

Fief is a marketplace to **rent or buy trading agents whose track record is signed by their own sealed brain.** Each decision an agent makes comes back **TEE-signed by 0G Compute**, is **verified on-chain** against the agent's **sealed strategy commitment**, and is appended to a **record that travels with the agent's ERC-7857 token** when it's rented or sold. The strategy stays **encrypted** on 0G Storage; only hashes are public.

**The headline artifact** (the thing a judge must remember): two transactions side by side — one **green** (a real decision from a live 0G Compute inference, *Accepted*) and one **red** (the same submission with one tampered byte, *Rejected*) — plus a counter of live, brain-bound decisions. The whole UI should orbit this.

**First domain:** short-horizon BTC direction calls — `UP / DOWN / FLAT` with a confidence and a size hint.

---

## 2. Tech stack (recommended — deviate only with a note in the PR)

- **Next.js (App Router) + TypeScript (strict).** `web/` is already scaffolded. Deploy target is **Cloudflare Pages** (owner wires the current Cloudflare Next adapter at ship time; avoid Node-only APIs in server components / edge routes).
- **Styling:** Tailwind CSS + **shadcn/ui**. Aesthetic: dark, data-dense, "terminal-meets-finance" — think a proof explorer, not a pastel SaaS landing. High-contrast **green/red** semantics are core.
- **Data fetching:** **TanStack Query** against the `DataSource` (§7). No direct `fetch` in components.
- **Wallet / chain (read-only pages need none):** **wagmi + viem** with a connect kit (RainbowKit or ConnectKit). Chain config in §8. Wallet is only needed for Rent and Owner Console; everything else is public read.
- **Charts:** lightweight (e.g. `visx`/`recharts` or inline SVG). P&L is *context only*, never presented as a verified claim.
- **Package manager:** `pnpm`.

The app already lives in `web/`. Layout:

```
web/
  app/                      # routes (App Router)
  components/               # ui + feature components
  lib/
    data/
      types.ts              # the interfaces in §7 (copy them verbatim)
      source.ts             # export getDataSource(): DataSource  (mock|live via env)
      mock.ts               # MockDataSource + sample fixtures (green + red)
    chain/zerog.ts          # viem chain objects (§8)
    copy.ts                 # approved phrases / forbidden-words guard
  styles/
```

---

## 3. Design principles & copy guardrails (non-negotiable)

- **Provenance-first & legible.** Green = *Accepted / brain-bound*. Red = *Rejected* (+ reason). This pairing is the product; make it unmissable and projector-legible for the demo.
- **Honest status.** Show what's proven, not vibes. Use these approved phrases:
  - "strategy sealed on 0G Storage, never on the public chain"
  - "decisions attested by 0G TeeML"
  - "request commitment sealed, auditable under authorized access"
  - "verified on-chain against the agent's sealed strategy commitment"
- **Forbidden words** (do not ship): `trustless`, `unextractable`, `impossible to fake`, "guaranteed profit", or anything implying P&L/alpha is verified. Add a tiny dev-time check in `lib/copy.ts` that greps rendered copy constants for these and warns.
- **Sealed strategy = ciphertext.** Anywhere the strategy is shown, show a **ciphertext blob / hash**, never plaintext.
- **P&L is context, not proof.** Label any performance number "context — provenance only, not verified".
- **Responsive**, keyboard-accessible, respects reduced-motion.

---

## 4. Global shell

- **Top nav:** logo → `/`, links to Marketplace `/agents`, Proof `/proof`, Verify `/verify`, Docs/About `/about`, and (right side) **Connect Wallet** + **network indicator**.
- **Network guard:** if a wallet is connected on the wrong chain, show a banner "Switch to 0G Mainnet (16661)" with a one-click switch. Read-only pages never force a wallet.
- **Honest-status badge:** a small reusable component (e.g. "Live on 0G mainnet · N decisions · 100% brain-bound") used on landing, agent record, and proof pages.
- **Footer:** links to GitHub repo, 0G docs, the `fief-verify` command, honest-status one-liner.

---

## 5. Pages

For each page: **route · goal · sections/components · data (from §7) · states**. "Mock now / real later" means build it against the mock source; the owner wires real data.

### 5.1 Landing — `/`
- **Goal:** land the mechanism + the green/red proof in 10 seconds; drive to Marketplace and Proof.
- **Sections:** hero (one-liner + mechanism sentence + primary CTA "Browse agents" / secondary "How it's verified"); the **green-tx vs red-tx** showcase (uses the receipt component, §6); live **brain-bound decisions counter**; "how it works" 3-step (Decide → Sign in TEE → Record on-chain); honest-status block; footer CTA.
- **Data:** `listAgents()` for a featured card or two; a sample green + red `DecisionEntry` for the showcase.
- **States:** all content must render with mock data; no wallet required.

### 5.2 Proof — `/proof`  ← the 2-minute judge path
- **Goal:** let a judge verify the core claim with zero setup.
- **Sections:** the **green tx** and the **red tx** side by side (receipt component + ChainScan links); the exact verify command in a copy button — `pnpm fief-verify --tx <hash>`; a short, honest mechanism explainer; "what this proves / what it doesn't" (mirrors PRD §4.1 limits, in plain words).
- **Data:** two `DecisionEntry` records (one accepted, one rejected) + their `chainScanUrl`.
- **States:** static-friendly, no wallet. Must be legible on a projector.

### 5.3 Marketplace — `/agents`
- **Goal:** browse listed agents.
- **Sections:** grid of **agent cards** (name, domain, decision count, **% brain-bound**, epoch, fee-per-decision if listed, small green/red sparkline of recent entries); filters (domain, has-live-record, listed/not); empty state.
- **Data:** `listAgents()`, `getListing(tokenId)` per card.
- **States:** loading skeletons, empty ("no agents yet"), error.

### 5.4 Agent Record — `/agents/[tokenId]`  ← the star page
- **Goal:** the trustworthy track record. This is where provenance becomes tangible.
- **Sections:**
  - **Header:** name, owner, operator (short), epoch, domain, network badge, decision count, **% brain-bound**, "Rent" + "Request audit access" CTAs.
  - **Sealed strategy panel:** show `strategyHash` (H) and `storageRoot` as ciphertext/hashes with a lock icon and the line "strategy sealed on 0G Storage".
  - **Decision ledger (the core):** a virtualized table of `DecisionEntry` rows. Each row: index, time, decision (`UP/DOWN/FLAT` + conf + size), **green Accepted / red Rejected(reason)** pill, TEE signer (short), nonce/epoch, and a **ChainScan** link. Clicking a row opens the receipt detail (§6).
  - **P&L context** (optional, clearly labeled "context, not verified").
  - **Verify strip:** the `pnpm fief-verify --tx <hash>` command for the latest accepted entry.
- **Data:** `getAgent(tokenId)`, `getEntries(tokenId, { limit, cursor })` (paginated/infinite), `getListing(tokenId)`.
- **States:** loading, not-found, empty ledger, error; graceful with 1 entry or 10k.

### 5.5 Rent flow — `/agents/[tokenId]/rent`
- **Goal:** rent an agent → receive its verified decision feed.
- **Sections:** requires wallet (network guard); show terms (fee-per-decision, min escrow, expiry, max decisions); escrow amount input; confirm step; success state that links to the Renter Dashboard. **Do not** implement real transactions — call a mock `rent()` action that returns a `Grant`, and stub the wallet write behind the data layer so the owner swaps it in.
- **Data:** `getListing(tokenId)`, mock `rent()` → `Grant`.
- **States:** wrong-network, insufficient-balance (mockable), pending, success, error.

### 5.6 Renter Dashboard — `/dashboard`
- **Goal:** a renter's live, verifiable decision feed for agents they've rented.
- **Sections:** list of active `Grant`s; per-grant **live feed** of `RenterFeedMessage`s (newest first) where **each message links to its on-chain entry index** so the renter can verify independently; remaining escrow / decisions; expiry countdown.
- **Data:** `getGrantsForRenter(address)`, `subscribeRenterFeed(tokenId, cb)` (mock emits a message every few seconds).
- **States:** no rentals yet (CTA to Marketplace), feed loading, expired grant, error.

### 5.7 Owner Console — `/console`
- **Goal:** the owner's control panel (build the UI; wallet writes are stubbed).
- **Sections:** "My agents" (`getAgentsForOwner`); per agent: mint/seal (form → shows resulting H + storageRoot as ciphertext), set operator, **reseal (epoch++)** with a clear "old records stay bound to the old epoch" note, list/unlist (set fee-per-decision + min escrow), settlement view (per-entry, per-renter), and **audit-grant management** (grant a prospective buyer sealed-key access — UI only). All mutations call mock actions.
- **Data:** `getAgentsForOwner(address)`, mock mutations.
- **States:** wrong-network, empty (no agents), pending/success/error per action.

### 5.8 Verify — `/verify`
- **Goal:** paste a tx hash → see the independent verification result (read-only, no wallet).
- **Sections:** input for a tx hash; result card rendering `VerifyResult.checks` (each check green/red with detail); if it's a decision entry, render the receipt (§6); show the equivalent CLI: `pnpm fief-verify --tx <hash>`.
- **Data:** `verifyTx(txHash)`.
- **States:** idle, checking, valid, invalid/tampered, not-found, error.

### 5.9 About / Security — `/about` (optional but recommended)
- **Goal:** the honest limits in plain language (mirrors PRD §4.1 / §8 / §19 non-goals): what's proven, the response-side declaration limit + audit-grant remedy, and "no custody, no P&L verification, provenance only."

---

## 6. The green/red receipt component (spec — this is the signature UI)

`<DecisionReceipt entry={DecisionEntry} variant="full|compact" />`

- **Accepted (green):** check icon, "Accepted — brain-bound", show decision, TEE signer (short + copy), nonce/epoch, `inputHash` (short), ChainScan link, block time, and a one-line plain-English: "This decision was produced by the agent's registered TEE model and matches its sealed commitment."
- **Rejected (red):** x icon, "Rejected — {reason}", show which check failed (e.g. `BadCommit`, `BadSigner`, `BadNonce`), and the plain-English: "One byte was changed — the on-chain check rejected it."
- Always expose the **ChainScan** link (`entry.chainScanUrl`) and, for accepted entries, the **verify command**.
- Compact variant = a single table row; full variant = an expandable detail panel.

Make the green vs red contrast the strongest visual on the page. This component appears on Landing, Proof, Agent Record, and Verify.

---

## 7. Data contracts — build against these (copy into `web/lib/data/types.ts`)

```ts
export type DecisionStatus = 'accepted' | 'rejected';
export type Direction = 'UP' | 'DOWN' | 'FLAT';
export type RejectReason =
  | 'BadSigner' | 'BadNonce' | 'BadEpoch' | 'BadCommit' | 'BadHash' | 'NotOperator' | 'BadAnchor';

export interface Decision { dir: Direction; conf: number; size: number } // conf,size in 0..1

export interface DecisionEntry {
  index: number;               // on-chain entry index for this agent
  status: DecisionStatus;      // green | red
  rejectReason?: RejectReason; // present iff status==='rejected'
  decision: Decision;          // parsed from the signed response content
  nonce: number;
  epoch: number;
  reqSha: `0x${string}`;       // 32-byte hash (request body; sealed — hash only)
  respSha: `0x${string}`;      // 32-byte hash (signed response bytes)
  teeSigner: `0x${string}`;    // 20-byte address (recovered TEE signer)
  provider: `0x${string}`;     // 20-byte 0G Compute provider address
  inputHash: `0x${string}`;    // 32-byte sha256 of the market snapshot
  renter: `0x${string}`;       // 20-byte; zero address if none
  txHash: `0x${string}`;
  chainScanUrl: string;        // https://chainscan.0g.ai/tx/<txHash>
  blockTime: string;           // ISO 8601
}

export interface Agent {
  tokenId: string;
  name: string;
  owner: `0x${string}`;
  operator: `0x${string}`;     // runtime EOA allowed to append entries
  epoch: number;
  strategyHash: `0x${string}`; // H — public commitment; the strategy itself is sealed
  storageRoot: `0x${string}`;  // 0G Storage merkle root of the AES-256-GCM blob
  network: 'mainnet' | 'testnet';
  domain: string;              // e.g. "BTC short-horizon direction"
  decisionCount: number;
  brainBoundPct: number;       // % accepted & provenance-verified (target 100)
  createdAt: string;
  pnlContext?: {               // context only — NEVER labeled as verified
    window: string;
    note: string;
    series?: { t: string; v: number }[];
  };
}

export interface Listing {
  tokenId: string;
  feePerDecisionWei: string;   // bigint serialized as string
  minEscrowWei: string;
  active: boolean;
}

export interface Grant {
  tokenId: string;
  renter: `0x${string}`;
  expiry: string;              // ISO
  maxDecisions: number;
  remainingEscrowWei: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface RenterFeedMessage {
  entryIndex: number;          // links to the on-chain DecisionEntry
  tokenId: string;
  decision: Decision;
  at: string;                  // ISO
  txHash: `0x${string}`;
}

export interface VerifyCheck { name: string; pass: boolean; detail?: string }
export interface VerifyResult {
  txHash: `0x${string}`;
  ok: boolean;
  network: 'mainnet' | 'testnet';
  checks: VerifyCheck[];       // e.g. "signer matches getService().teeSignerAddress", "commit matches", "nonce fresh"
  entry?: DecisionEntry;
}

export interface DataSource {
  listAgents(): Promise<Agent[]>;
  getAgent(tokenId: string): Promise<Agent | null>;
  getEntries(tokenId: string, opts?: { limit?: number; cursor?: number }): Promise<DecisionEntry[]>;
  getListing(tokenId: string): Promise<Listing | null>;
  getAgentsForOwner(address: `0x${string}`): Promise<Agent[]>;
  getGrantsForRenter(address: `0x${string}`): Promise<Grant[]>;
  subscribeRenterFeed(tokenId: string, onMessage: (m: RenterFeedMessage) => void): () => void; // returns unsubscribe
  verifyTx(txHash: string): Promise<VerifyResult>;
  // stubbed mutations (mock returns optimistic results; owner wires wallet writes later):
  rent(tokenId: string, escrowWei: string): Promise<Grant>;
}
```

**`getDataSource()`** returns `MockDataSource` when `NEXT_PUBLIC_DATA_MODE=mock` (default) and `LiveDataSource` when `live`. Build the mock now with **≥2 agents** and, for at least one agent, a ledger containing **both accepted and a rejected (`BadCommit`) entry**, plus realistic hashes/addresses and working `chainScanUrl`s. The rejected entry powers the Proof page and the receipt component.

---

## 8. Chain config (`web/lib/chain/zerog.ts`)

```ts
import { defineChain } from 'viem';

export const zeroGMainnet = defineChain({
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: { default: { name: 'ChainScan', url: 'https://chainscan.0g.ai' } },
});

export const zeroGTestnet = defineChain({
  id: 16602,
  name: '0G Testnet (Galileo)',
  nativeCurrency: { name: '0G', symbol: 'OG', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: { default: { name: 'ChainScan (testnet)', url: 'https://chainscan-galileo.0g.ai' } },
});
```

ChainScan tx URL helper: `` `https://chainscan.0g.ai/tx/${txHash}` `` (mainnet). Contract addresses (for later live wiring, not needed for mock): inference serving `0x47340d900bdFec2BD393c626E12ea0656F938d84`. Testnet explorer host may differ — confirm before relying on it.

---

## 9. Env (`web/.env.example`)

```
NEXT_PUBLIC_DATA_MODE=mock         # mock | live
NEXT_PUBLIC_NETWORK=mainnet        # mainnet | testnet
NEXT_PUBLIC_WALLETCONNECT_ID=      # only needed once wallet is wired
```

Mock mode requires **no keys**. Never commit a real `.env`.

---

## 10. Definition of done (per PR)

- [ ] Page(s) render fully from `MockDataSource` — no backend required.
- [ ] Responsive (mobile → desktop) and keyboard-accessible; respects reduced-motion.
- [ ] Loading / empty / error / wrong-network states handled.
- [ ] Green/red receipt is unmistakable and projector-legible.
- [ ] No forbidden copy (`trustless` / `unextractable` / `impossible to fake`); P&L labeled "context, not verified".
- [ ] TypeScript strict passes; no `any` / `@ts-ignore`. Lint clean.
- [ ] PR includes screenshots or a short capture.

---

## 11. Out of scope (owner handles — do not build)

Smart contracts (`FiefAgent` / `RecordBook` / `RentalDesk`), the runtime/decision loop, real 0G Compute inference + signature retrieval, 0G Storage upload/seal, Supabase indexing, and the real `fief-verify` internals. Your Verify page calls `dataSource.verifyTx()`; the owner implements the real check behind it.

---

## 12. Workflow

Branch → PR into `main` → review by **@winsznx**. Naming and rules live in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

Suggested PR sequence (one area per PR):

1. **Landing + Proof** (`feat/fe-landing-proof`) — green/red story visible immediately.
2. **Marketplace + Agent Record** (`feat/fe-marketplace`).
3. **Rent + Renter Dashboard** (`feat/fe-rent`).
4. **Owner Console + Verify + About** (`feat/fe-console-verify`).

Questions or unclear data shapes: open a GitHub issue and tag **@winsznx**.
