# Decisions

Chronological log of load-bearing decisions. Newest first.

## 2026-08-20

- **`web/` scaffolded on main** (Next.js 16 App Router, TS strict, Tailwind v4, shadcn/ui, TanStack Query, viem chain objects, typed mock `DataSource`). Pages are stubs. JemIIahh replaces them via `feat/fe-*` PRs. Not a product UI — a standard Next setup so frontend work starts immediately.

## 2026-08-19

- **License = MIT.** The 0G ERC-7857 reference (`AgentNFT.sol`, `Verifier.sol`) is MIT (repo dedication CC0); only the `IERC7857` interface + beacon proxies are GPL-3.0. Fief's own code is MIT. Corrects an earlier blanket-GPL assumption — see PRD §0.5.
- **Frontend: Next.js (App Router) on Cloudflare Pages, mock-first.** @JemIIahh builds every page against a typed mock `DataSource`; the owner wires real chain/runtime/Supabase behind the same interfaces. Enables fully parallel work.
- **Runtime on a VPS**, not Cloudflare Workers — a long-lived process holds a wallet and the decrypted strategy in memory. Documented exception to the Cloudflare default (PRD §4).
- **`COMMIT_LINE` prefix is slash-free (`FIEFv1`)** so the optional JSON `\/` escape can never affect on-chain byte matching (PRD §5 / §0.5 item 7).
- **`/internal/` is committed for now** so collaborators have full product context. Per PRD §15 it is slated to be gitignored before public launch; its history persists in git, so decide on a scrub (or keep the repo private) before then.
- **Repo visibility: public (`winsznx/fief`).** Owner decision 2026-08-20: create the public repo now, invite [@JemIIahh](https://github.com/JemIIahh) (frontend) as a write collaborator, and keep `/internal/` tracked until launch. The 0G Bridge brief requires a public repo with wave-period commits; the SHA of `/internal/` will persist even after it is later gitignored — accept that, or scrub history / go private before Wave 3 submission if the strategy detail becomes a problem.
- **Frontend GitHub account is `@JemIIahh`.** The older `@Jemiiah` login is gone (account banned; noted on the current profile). Handoff and CONTRIBUTING use the live login.
- **PRD verification pass (2026-08-19):** the 0G Compute signature seam (129-byte `sha256:sha256`, EIP-191, `/v1/proxy/signature/{chatID}`) and the on-chain `getService().teeSignerAddress` read are source-confirmed; six PRD errors were corrected. See PRD §0.5.
