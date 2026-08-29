# Demo video runbook

Every beat below was run against live mainnet on 2026-08-25 and timed. Nothing
here is aspirational; if a step is slow or can't be filmed live, it says so and
gives the alternative.

**Target: 2:55.** Under the 3:00 cap with margin for a slow page.

---

## Before you press record

**1. Pre-warm every page.** Live reads take 4-7 seconds cold and there is no
cache, deliberately, because a stale completeness number is the one thing this
product must not show. Load each of these once, then leave the tabs open:

```
https://fief.timjosh507.workers.dev/
https://fief.timjosh507.workers.dev/proof
https://fief.timjosh507.workers.dev/agents
https://fief.timjosh507.workers.dev/agents/8
https://fief.timjosh507.workers.dev/agents/7
https://chainscan.0g.ai/tx/0x64debb3d29793601b515baea9dab5e04a461dff8e019b0783e6894f3ca7d1555
https://chainscan.0g.ai/tx/0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b
```

**2. Terminal setup.** Font 18pt+, dark theme, window ~100 columns. Two tabs:

```bash
cd ~/fief/packages/verify     # tab 1
cd ~/fief/runtime             # tab 2, with PRIVATE_KEY exported
```

**3. Confirm the campaign is still running.** The agent 7 shots depend on it:

```bash
tail -3 ~/fief/runtime/campaign.out
```

**4. Screen recording at 1080p minimum.** ChainScan zoomed so hashes are
readable when the video is scaled down.

---

## Shot list

| # | t | duration | shot | say |
|---|---|---|---|---|
| 1 | 0:00 | 15s | A bot listing with a glossy backtest chart. Any screenshot. | "Any bot can show you a backtest. Worse: even a *real* track record can be edited. You just don't publish the calls that went wrong." |
| 2 | 0:15 | 20s | ChainScan, the `openEpoch` transaction, decoded input expanded | "So Fief makes the agent commit to a schedule first. Market, cadence, horizon, deadlines, slot count — timestamped on 0G mainnet before any of it happened. The operator cannot change it now." |
| 3 | 0:35 | 25s | Terminal tab 2: `NETWORK=mainnet AGENT=7 pnpm demo-reject` — runs in ~8s | "Here's what that buys. Take a decision already on the record, change one byte, try to write it again." |
| 4 | 1:00 | 15s | Same output: `REJECTED` then `completeness unchanged` | "Refused. And the agent's score is untouched — so an attacker can't grief someone's record by spamming bad submissions either." |
| 5 | 1:15 | 20s | ChainScan, the red transaction, Logs tab showing `DecisionRejected` | "This is the tamper case on-chain. Note the transaction **succeeded** — it carries the rejection as an event, because a failed transaction would look like the system broke, when the system worked." |
| 6 | 1:35 | 25s | Live app `/proof`, scroll to the slot timeline | "Sealed 98 seconds inside its deadline. Then private for 338 seconds. That window is what a renter is paying for: they hold the direction, the chain holds only a hash." |
| 7 | 2:00 | 20s | `/agents` marketplace, then click agent 7 | "Every agent, read straight off mainnet. No indexer, no database. Note the ones at 0% and 50% — those runs really did miss slots, and it says so." |
| 8 | 2:20 | 15s | Agent 7's completeness bar, running epoch | "This one is live right now. The denominator is the schedule that was fixed before any of it happened, so a call it misses stays missed." |
| 9 | 2:35 | 15s | Terminal tab 1: `pnpm start -- --tx 0xc8543dfc…` — runs in ~6s, 6/6 | "And you don't have to believe this website. This recomputes everything from public RPC data — recovers the signer from the receipt and checks it against 0G's own contract." |
| 10 | 2:50 | 5s | Title card | "Fief. Private alpha now. Public proof later." |

---

## Exact commands

**Shot 3-4** (~8s, safe to run repeatedly, changes no state):

```bash
cd ~/fief/runtime
NETWORK=mainnet AGENT=7 pnpm demo-reject
```

**Shot 9** (~6s):

```bash
cd ~/fief/packages/verify
pnpm start -- --tx 0xc8543dfc0a44adced1c35bce3b5f336feaba8e31ff658a81f2eab0bd249ade19
```

Optional stronger version if you have room, recounts the whole epoch (~7s):

```bash
pnpm start -- --agent 8 --epoch 0
```

---

## What you cannot film live, and why

**`pnpm adversarial`** is the real adversarial proof — late commit, early
reveal, tampered byte, honest reveal afterwards — but it spends about five
minutes waiting on genuine slot deadlines and disclosure windows. Do not try to
speed it up in the edit; a jump cut through a timing proof is exactly the thing
a skeptical judge would distrust. Shots 3 and 5 cover the same ground with
artifacts that are already on chain.

**The rent flow.** The button is wired and deployed, but no rent transaction
has been signed from a browser yet. Either skip it, or connect MetaMask and
rent agent 6 for real before recording (~0.002 OG plus gas) and add it as a
shot. If you do, that also gives you the screenshot for the X post.

---

## Numbers to quote, verified 2026-08-25

| claim | value | where it comes from |
|---|---|---|
| private window | 338 s | agent 8 slot 1, `slotRevealOpen - committedAt` |
| commit margin | 98 s inside the deadline | same slot |
| agent 8 completeness | 100%, 2 of 2 | `completenessBps(8,0)` |
| verifier result | 6 of 6 checks | `fief-verify --tx 0xc8543dfc…` |
| live agents | 8 | marketplace |

Do **not** say "242 tests" or "four 0G components" on camera. Nobody is moved by
a test count. They are moved by a bot being unable to delete its losing calls.

---

## If something breaks mid-recording

- **A page hangs past ~10s.** Reload once. Live reads occasionally hit a slow
  RPC; there is no cache to fall back on.
- **`demo-reject` says no revealed slot found.** The campaign died. Point it at
  agent 8 instead: `AGENT=8 pnpm demo-reject`.
- **ChainScan is slow.** The verifier terminal shot covers the same claim and
  does not depend on the explorer.
