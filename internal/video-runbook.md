# Demo video runbook

Every beat below was run against live mainnet and timed, most recently
2026-08-29. Nothing here is aspirational; if a step is slow or can't be filmed
live, it says so and gives the alternative. Every quoted on-screen string was
read out of the deployed page, so if you can't find it, the page changed.

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
https://chainscan.0g.ai/tx/0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b
https://chainscan.0g.ai/tx/0x09a93df86494db4ac0974b86ec6479d8254be5af43baff130cd04a4d8c16af49
```

The first ChainScan link is shot 5 (the tampered reveal, the one you must have).
The second is the optional supporting cut in shot 2.

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

Read this top to bottom while recording. Every line says where the thing is,
what to click, and what to say. Nothing needs hunting for.

---

### Shot 1 — 0:00 to 0:12 (12s)

**Screen:** A screenshot of any trading-bot listing with a glossy backtest
chart. Add the word **Illustrative** in a corner so nobody thinks it is ours.

**Do:** Nothing. Static hold.

**Say:**
> "A trading bot can show a beautiful backtest. But it can quietly remove the
> calls that went wrong."

---

### Shot 2 — 0:12 to 0:30 (18s)

**Screen:** Terminal tab 2, in `~/fief/runtime`.

**Do:** Run:

```bash
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm schedule
```

Takes about 3 seconds. Hold on the output, and point at these two lines:

```
  slots scheduled   288
  ...
  the schedule was fixed 166s BEFORE its first slot — no outcome existed yet
```

**Why a terminal and not the explorer:** the contracts are not source-verified
on ChainScan, so `openEpoch` renders as raw hex there and there is no readable
`288` to point at. This reads the same values straight off the same contract.

**Optional supporting cut** if you want the explorer on screen for a beat:

```
https://chainscan.0g.ai/tx/0x09a93df86494db4ac0974b86ec6479d8254be5af43baff130cd04a4d8c16af49
```

Status `Success`, `To` the EpochBook, timestamped `2026-08-25 17:49:02 UTC`. Do
not promise the viewer decoded parameters there.

**Say:**
> "Fief fixes the bot's schedule first. Two hundred and eighty-eight slots, a
> five-minute cadence, a hard deadline on each one, all written to 0G mainnet
> before the first slot even opened. No outcome existed yet, and the operator
> cannot change any of it now."

---

### Shot 3 — 0:30 to 0:48 (18s)

**Screen:** Terminal tab 2, sitting in `~/fief/runtime`, empty prompt.

**Do:** Type and run:

```bash
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject
```

It prints for about 8 seconds, so it will finish partway through your line.
Keep talking; don't wait for it in silence.

**Say:**
> "Now I am going to take a decision that is already on the public record,
> change one byte of it, and try to write it again."

---

### Shot 4 — 0:48 to 0:58 (10s)

**Screen:** Same terminal, now showing the finished output. The two lines that
matter are near the bottom:

```
   REJECTED: AlreadyRevealed
completeness after  : 10.76%  (31 revealed)
   unchanged — a rejected reveal cannot damage the record
```

**Do:** Hold still on those three lines. Do not scroll.

**Say:**
> "The chain refuses the rewrite. And the agent's score does not move, so nobody
> can damage someone else's record by spamming bad submissions at it either."

---

### Shot 5 — 0:58 to 1:14 (16s)

**Screen:** ChainScan tab already open at the tampered reveal:

```
https://chainscan.0g.ai/tx/0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b
```

**Do:** Point at **Status: Success** at the top. Then click the **Logs** tab and
point at the decoded event: `DecisionRejected`, agent `8`, slot `1`, reason
`BadReveal`.

**Say:**
> "This is the real byte-tamper case. A committed response was changed by one
> byte before reveal, and mainnet rejected it. The transaction succeeds on
> purpose, so the rejection itself is public evidence instead of a failure that
> looks like the system broke."

---

### Shot 6 — 1:14 to 1:34 (20s)

**Screen:** Browser tab already on `https://fief.timjosh507.workers.dev/proof`.

**Do:** The page opens on the heading **"Two transactions. One byte apart."**
Scroll down about one screen to the panel headed **"Slot 1 · epoch 0"**. It is a
horizontal timeline with four stops, left to right:

```
18:12:05  sealed commit
18:13:43  commit deadline
18:17:43  disclosure opens
18:18:05  revealed + verified
```

Point at the first two, then sweep right to the last two. The sentence directly
under the timeline is the one you are paraphrasing.

**Say:**
> "Before reveal, the renter gets the direction and the public chain gets only a
> hash. This call was sealed ninety-eight seconds inside its deadline, then
> stayed private for three hundred and thirty-eight seconds. That window is
> exactly what a renter is paying for."

---

### Shot 7 — 1:34 to 1:50 (16s)

**Screen:** Browser tab on `https://fief.timjosh507.workers.dev/agents`, headed
**"Agents and their records"**.

**Do:** Let the grid of eight agent cards sit for two seconds. Then click the
card for **Agent 7**. It lands on the panel headed **"Forward record"** with the
badge **epoch 1** and, beside the big percentage, **"epoch running · N not yet
due"**.

**Say:**
> "Every record here is read straight off 0G mainnet. No indexer, no database.
> This agent is committing right now, and its denominator was fixed before it
> started."

---

### Shot 8 — 1:50 to 2:20 (30s) — the one that matters

**Screen:** Still on `/agents/7`. Scroll down **one panel**, past "Forward
record", to the panel headed **"Every epoch, including the bad ones."**

**Do:** It has two rows. Hold on them:

```
epoch 1   <moves>  N of 288 scheduled    current  running
epoch 0   10.76%   31 of 288 scheduled   255 missed
```

Epoch 1's row climbs while you record, which is the point of it. Epoch 0's row
is frozen forever and those are the numbers you narrate.

Point at the `epoch 0` row. Then at the header on the right, which reads
`lifetime … · … of 576`.

**Say:**
> "And here is our own campaign. It ran for three hours and then the machine it
> was on went to sleep. Two hundred and fifty-five scheduled calls never
> happened. I cannot reopen this epoch, I cannot backfill those calls, and I
> cannot delete this row. It is public, and it counts against us forever.
>
> That is Fief working."

Do not apologise for this and do not explain it away. It is the only moment in
the video where the system costs *us* something, and it is worth more than every
green checkmark in the other nine shots.

---

### Shot 9 — 2:20 to 2:40 (20s)

**Screen:** Terminal tab 1, sitting in `~/fief/packages/verify`.

**Do:** Run:

```bash
pnpm start -- --tx 0xc8543dfc0a44adced1c35bce3b5f336feaba8e31ff658a81f2eab0bd249ade19
```

Takes about 7 seconds. Hold on the tail of the output:

```
  ok    slot 1: sha256(respData) matches the commitment
  ok    slot 1: signed text is 129 bytes
  ok    slot 1: recovered signer is 0G's registered TEE signer  0xa46ea4fc…
  ok    slot 1: commit line matches the sealed strategy

6 checks passed, 0 failed
```

**Say:**
> "And you do not have to trust the website. This recomputes the whole thing
> from public RPC data, recovers the enclave signer out of the receipt itself,
> and checks it against 0G's own serving contract."

---

### Shot 10 — 2:40 to 2:50 (10s)

**Screen:** Title card. Name, the live URL, the repo.

**Say:**
> "Fief. Private alpha now, public proof later."

---

## Exact commands

**Shot 2** (~3s, read-only):

```bash
cd ~/fief/runtime
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm schedule
```

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

## Numbers to quote, verified 2026-08-29

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
| agent 7 epoch 0 `openEpoch` | `0x09a93df8…` | shot 2 |
| red tamper tx | `0x6d68ade3…`, success, `DecisionRejected(8, 1, "BadReveal")` | shot 5, receipt read 2026-08-29 |
| agents on chain | 8 | `nextAgentId()` returns 9 |

Epoch 1's completeness moves while you record. Quote it from the screen, not
from this table.

Do **not** say "242 tests" or "four 0G components" on camera. Nobody is moved by
a test count. They are moved by a bot being unable to delete its losing calls.

---

## If something breaks mid-recording

- **A page hangs past ~10s.** Reload once. Live reads occasionally hit a slow
  RPC; there is no cache to fall back on.
- **`demo-reject` says no revealed slot found.** It should not: agent 7 epoch 0
  is finished, so its 31 revealed slots are frozen. If it happens anyway the RPC
  is failing to return calldata; retry once, then fall back to
  `AGENT=8 EPOCH=0 pnpm demo-reject`.
- **`demo-reject` prints `FAIL — the chain ACCEPTED a rewritten entry`.** Stop
  recording. That line means an invariant broke and the video is the least of
  the problem.
- **ChainScan is slow.** The verifier terminal shot covers the same claim and
  does not depend on the explorer.
