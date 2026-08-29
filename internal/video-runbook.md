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

**3. Confirm the campaign is still running.** Shot 7 depends on it:

```bash
tail -3 ~/fief/runtime/campaign2.out     # should show a recent slot committing
pgrep -f supervise-campaign.sh           # should print a pid
```

If it is dead, restart it and let one slot land before recording. It resumes
without backfilling anything:

```bash
cd ~/fief/runtime
NETWORK=mainnet AGENT=7 EPOCH=1 CAMPAIGN_LOG=campaign2.log \
  CAMPAIGN_SPOOL=campaign2.spool.jsonl nohup ./supervise-campaign.sh > campaign2.out 2>&1 &
```

**4. Screen recording at 1080p minimum.** ChainScan zoomed so hashes are
readable when the video is scaled down.

---

## Shot list

| # | t | duration | shot | say |
|---|---|---|---|---|
| 1 | 0:00 | 15s | A bot listing with a glossy backtest chart. Any screenshot. | "Any bot can show you a backtest. Worse: even a *real* track record can be edited. You just don't publish the calls that went wrong." |
| 2 | 0:15 | 20s | ChainScan, the `openEpoch` transaction, decoded input expanded | "So Fief makes the agent commit to a schedule first. Market, cadence, horizon, deadlines, slot count — timestamped on 0G mainnet before any of it happened. The operator cannot change it now." |
| 3 | 0:35 | 20s | Terminal tab 2: `NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject` — runs in ~8s | "Here's what that buys. Take a decision already on the record, change one byte, try to write it again." |
| 4 | 0:55 | 12s | Same output: `REJECTED` then `completeness unchanged` | "Refused. And the agent's score is untouched, so an attacker can't grief someone's record by spamming bad submissions either." |
| 5 | 1:07 | 18s | ChainScan, the red transaction, Logs tab showing `DecisionRejected` | "This is the tamper case on-chain. Note the transaction **succeeded** — it carries the rejection as an event, because a failed transaction would look like the system broke, when the system worked." |
| 6 | 1:25 | 22s | Live app `/proof`, scroll to the slot timeline | "Sealed 98 seconds inside its deadline. Then private for 338 seconds. That window is what a renter is paying for: they hold the direction, the chain holds only a hash." |
| 7 | 1:47 | 18s | `/agents` marketplace, then click agent 7, land on the running completeness bar | "Every agent, read straight off mainnet. No indexer, no database. This one is committing right now — the denominator was fixed before any of it happened." |
| 8 | 2:05 | 25s | **Scroll to "Every epoch, including the bad ones."** Hold on epoch 0: 10.76%, 255 missed. | "And here's the part I'd rather not show you. That's our own campaign. It ran for three hours and then the machine went to sleep. 255 calls never happened, and I can't reopen that epoch, can't backfill it, can't delete it. It's ours now, permanently. That's the product working." |
| 9 | 2:30 | 18s | Terminal tab 1: `pnpm start -- --tx 0xc8543dfc…` — runs in ~6s, 6/6 | "And you don't have to believe this website. This recomputes everything from public RPC data — recovers the signer from the receipt and checks it against 0G's own contract." |
| 10 | 2:48 | 7s | Title card | "Fief. Private alpha now. Public proof later." |

Shot 8 is the one to get right. It is the only moment in the video where the
system costs *us* something, and it is far more convincing than any number of
green checkmarks. Do not apologise for it on camera and do not explain it away.

---

## Exact commands

**Shot 3-4** (~8s, safe to run repeatedly, changes no state):

```bash
cd ~/fief/runtime
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject
```

Point it at epoch 0, not the running epoch 1. Epoch 0 has 31 revealed slots to
pick from and is finished, so the output is identical every take.

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
| agent 7 epoch 0 | 10.76%, 31 of 288, 255 missed | the outage, finished |
| the outage | stopped 2026-08-25 20:32 UTC at slot 33 | `runtime/campaign.log`, last line |
| agent 7 epoch 1 | opened 2026-08-29 16:12 UTC, 288 slots at 300 s | running under the supervisor |

Epoch 1's completeness moves while you record. Quote it from the screen, not
from this table.

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
