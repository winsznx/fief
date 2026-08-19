# Contributing to Fief

## Who does what (v1)

- **Frontend — [@JemIIahh](https://github.com/JemIIahh).** All UI, landing → dashboard. Build against the typed **mock data layer** in `web/lib/data/` (spec in [`docs/frontend-handoff.md`](./docs/frontend-handoff.md)). The Next.js app in `web/` is already scaffolded.
- **Owner — [@winsznx](https://github.com/winsznx).** Contracts (Solidity/Foundry), the runtime (Node + 0G Compute), 0G Storage integration, Supabase indexing, and wiring the *real* data layer behind the same interfaces you build against. Parts of this may be assigned to you once the UI is in.

## Workflow

1. Branch off `main`. Name it `feat/fe-<area>` (e.g. `feat/fe-landing`, `feat/fe-agent-record`).
2. Commit in small, focused steps. Conventional-commit style preferred (`feat:`, `fix:`, `chore:`, `docs:`).
3. Open a **PR into `main`** and request review from **@winsznx**.
4. Keep each PR scoped to a page or component set. Include **screenshots or a short screen capture**, and tick the Definition-of-Done checklist from the handoff.
5. Build against the **mock `DataSource`** — do **not** wire real chain / runtime / Supabase data unless it's explicitly assigned to you. That lets the owner swap in live data without touching your components.

## Ground rules

- Follow the copy guardrails: never "trustless", "unextractable", or "impossible to fake".
- TypeScript strict. No `any`, no `@ts-ignore`, no `@ts-expect-error`.
- Keep secrets out of the repo. Mock mode requires no keys.
- Don't commit `node_modules`, `.env*`, or build output (already in `.gitignore`).

## Local dev

```bash
cd web
pnpm install
pnpm dev
```

Open http://localhost:3000. Mock mode is the default (`NEXT_PUBLIC_DATA_MODE=mock`); no keys required.
