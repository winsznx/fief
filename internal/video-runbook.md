# Demo video runbook

Every beat below was run against live mainnet on 2026-08-25 and timed. Nothing
here is aspirational; if a step is slow or can't be filmed live, it says so and
gives the alternative.

**Target: 2:50.** The run of show below totals 2:50, leaving ten seconds of
margin under the three-minute cap for a slow tab switch or a breath.

---

## Before you press record

**1. Pre-warm every page.** Cold loads measured 2026-08-29 after the last
deploy: `/agents` 0.6s, `/proof` 4.2s, `/agents/7` 6.2s, `/agents/8` 6.2s, `/`
6.5s. Live reads are slow and there is no
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
cd ~/fief/runtime             # tab 2
```

No key setup, no exports, nothing to paste on camera. `runtime/.env` already
holds the funded mainnet operator (`0xbF7EF900…Bf31`, the same wallet the
campaign runs as) and every runtime script loads it automatically. Confirm it in
one line before you start:

```bash
cd ~/fief/runtime && grep -c PRIVATE_KEY .env    # prints 1
```

Tab 1 needs no key at all. The verifier reads public RPC only, which is the
whole claim it is there to make.

`demo-reject` simulates the rejected call before sending, so it never becomes a
transaction and spends no gas. Run it as many takes as you like.

**3. Confirm the campaign is still running.** Shot 7 depends on it:

```bash
tail -3 ~/fief/runtime/campaign2.out     # should show a recent slot committing
pgrep -f supervise-campaign.sh           # should print a pid
```

If it is dead, restart it and let one slot land before recording. It resumes
without backfilling anything:

```bash
cd ~/fief/runtime
AGENT=7 EPOCH=1 CAMPAIGN_LOG=campaign2.log \
  CAMPAIGN_SPOOL=campaign2.spool.jsonl nohup ./supervise-campaign.sh > campaign2.out 2>&1 &
```

**4. Screen recording at 1080p minimum.** ChainScan zoomed so hashes are
readable when the video is scaled down.

---

## Shot list

| # | t | duration | shot | say |
|---|---|---|---|---|
| 1 | 0:00 | 12s | A bot listing with a glossy backtest chart, labelled **Illustrative**. | "A trading bot can show a beautiful backtest. But it can quietly remove the calls that went wrong." |
| 2 | 0:12 | 18s | ChainScan, the `openEpoch` transaction, decoded input expanded. | "Fief fixes the bot's schedule first: market, cadence, deadlines, and every future slot, timestamped on 0G mainnet before the calls exist. The operator cannot change that schedule later." |
| 3 | 0:30 | 18s | Terminal tab 2: `NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject`. | "Now I will try to overwrite an existing public record with altered bytes." |
| 4 | 0:48 | 10s | Hold on `REJECTED` and `unchanged — a rejected reveal cannot damage the record`. | "The chain refuses the rewrite. The entry and its completeness score do not move." |
| 5 | 0:58 | 16s | ChainScan, canonical red transaction, Logs tab showing `DecisionRejected(BadReveal)`. | "This is the actual byte-tamper case: a committed response was changed by one byte before reveal, and 0G mainnet rejected it. The transaction succeeds only to preserve the rejection as public evidence." |
| 6 | 1:14 | 20s | Live app `/proof`, scroll to the slot timeline. | "Before reveal, the renter receives the direction; the public chain receives only a commitment. This call was sealed 98 seconds inside its deadline and private for 338 seconds. That is the window a renter pays for." |
| 7 | 1:34 | 16s | `/agents`, then agent 7's running epoch. | "Every record here is read directly from 0G mainnet — no indexer and no database. This agent is still running, but its denominator was fixed before it began." |
| 8 | 1:50 | 30s | **Scroll to "Every epoch, including the bad ones."** Hold on epoch 0: 10.76%, 31 of 288, 255 missed. | "Here is our own failed campaign. The machine slept after three hours. Two hundred and fifty-five scheduled calls never happened. I cannot reopen this epoch, backfill those calls, or delete this record. It stays public. That is Fief working." |
| 9 | 2:20 | 20s | Terminal tab 1: `pnpm start -- --tx 0xc8543dfc…`; hold on the four relevant `ok` lines and `6 checks passed`. | "You do not have to trust this website. This independently verifies this reveal from public RPC data, recovers the TEE signer from the receipt, and checks it against 0G's own serving contract." |
| 10 | 2:40 | 10s | Title card. | "Fief: private alpha now, public proof later." |

Shot 8 is the one to get right. It is the only moment in the video where the
system costs *us* something, and it is more convincing than any number of green
checkmarks. Do not apologise for it or explain it away.

---

## Exact commands

**Shot 3-4** (~8s, safe to run repeatedly, changes no state):

```bash
cd ~/fief/runtime
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject
```

Point it at epoch 0, not the running epoch 1. Epoch 0 has 31 revealed slots to
pick from and is finished, so the output is identical every take.

**Shot 9** (6.9s warm, ~12s on the first run of a cold process; the 20s shot
window covers either):

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
