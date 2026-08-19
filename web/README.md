# Fief web

Next.js (App Router) frontend. **Pages are stubs.** Build them against the typed mock `DataSource` in `lib/data/`. Spec: [`docs/frontend-handoff.md`](../docs/frontend-handoff.md).

```bash
pnpm install
pnpm dev
```

http://localhost:3000 — mock mode, no keys.

Deploy target is Cloudflare Pages. Do not introduce Node-only APIs in server components. The owner wires `@opennextjs/cloudflare` (or the current Cloudflare Next adapter) when the UI is ready to ship.

## Stack already in place

- Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui
- TanStack Query (`app/providers.tsx`)
- `lib/data/{types,source,mock}.ts` — copy of the handoff contract + fixtures (green + red)
- `lib/chain/zerog.ts` — 0G mainnet 16661 / testnet 16602
- `lib/copy.ts` — approved phrases / forbidden-word guard

Wallet (wagmi + RainbowKit/ConnectKit) is needed only for Rent and Owner Console — add it in those PRs.

## Workflow

Branch `feat/fe-<area>` off `main`, open a PR, request review from @winsznx. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).
