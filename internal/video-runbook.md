# Demo video runbook

Read this top to bottom. Every command is a copy-paste block. Every shot says
which window, what to do, and what to say.

Verified against live mainnet 2026-08-29. Every on-screen string quoted here was
read out of the deployed page, so if you can't find one, the page changed.

---

## How much terminal is in this video

**Three terminal moments. Three commands typed. That's all.**

| when | window | you type |
|---|---|---|
| 0:12 – 0:58 | Terminal **B** | 2 commands, back to back (shots 2, 3, 4) |
| 2:20 – 2:40 | Terminal **A** | 1 command (shot 9) |

Everything else — shots 1, 5, 6, 7, 8, 10 — is browser tabs and a title card. No
typing.

**No wallet. No gas. No transaction.** `demo-reject` simulates before sending,
so the rejection happens locally and nothing is ever broadcast. Run it as many
takes as you like.

---

## Before recording

### 1. Two terminal windows

Font 18pt+, dark theme, ~100 columns. Do these two `cd`s now so you never type
a path on camera.

Terminal **A**:

```
cd ~/fief/packages/verify
```

Terminal **B**:

```
cd ~/fief/runtime
```

If your prompt says `bash-5.3$` you are in a nested shell. Type `exit` first.

### 2. Confirm the key is in place

In Terminal **B**:

```
grep -c PRIVATE_KEY .env
```

Prints `1`. Nothing to export, nothing to paste on camera. Terminal **A** needs
no key at all — the verifier reads public RPC only, which is the whole point of
it.

### 3. Confirm the campaign is alive

In Terminal **B**:

```
pgrep -f supervise-campaign.sh
```

**If it prints a number, you are done. Skip to step 4.**

Only if it printed nothing, paste this and wait for one slot to land:

```
AGENT=7 EPOCH=1 CAMPAIGN_LOG=campaign2.log CAMPAIGN_SPOOL=campaign2.spool.jsonl nohup ./supervise-campaign.sh > campaign2.out 2>&1 &
```

### 4. Open these browser tabs, in this order

```
https://fief.timjosh507.workers.dev/proof
https://fief.timjosh507.workers.dev/agents
https://fief.timjosh507.workers.dev/agents/7
https://chainscan.0g.ai/tx/0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b
```

Let every one finish loading, then leave them open. Cold loads are slow on
purpose — there is no cache, because a stale completeness number is the one
thing this product must never show. `/agents` 1.5s, `/proof` 4.9s, `/agents/7`
8.3s and climbing as the epoch grows. Pre-warm `/agents/7` last.

### 5. Record at 1080p minimum

Zoom ChainScan so hashes stay legible when the video is scaled down.

---

## Run of show

Total 2:50. Ten seconds of margin under the three-minute cap.

---

### Shot 1 · 0:00–0:12 · static image

**Where:** A screenshot of any trading-bot listing with a glossy backtest chart.
Put the word **Illustrative** in a corner so nobody thinks it is ours.

**Do:** Nothing. Hold.

**Say:**
> "A trading bot can show a beautiful backtest. But it can quietly remove the
> calls that went wrong."

---

### Shot 2 · 0:12–0:30 · Terminal B

**Do:** Paste and run.

```
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm schedule
```

Takes about 3 seconds. Point at these two lines in the output:

```
  slots scheduled   288
  the schedule was fixed 166s BEFORE its first slot — no outcome existed yet
```

**Say:**
> "Fief fixes the bot's schedule first. Two hundred and eighty-eight slots, a
> five-minute cadence, a hard deadline on each one, all written to 0G mainnet
> before the first slot even opened. No outcome existed yet, and the operator
> cannot change any of it now."

---

### Shot 3 · 0:30–0:48 · Terminal B

Same window, don't switch.

**Do:** Paste and run.

```
NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject
```

Takes about 8 seconds, so it finishes partway through your line. Keep talking,
don't wait for it in silence.

**Say:**
> "Now I am going to take a decision that is already on the public record,
> change one byte of it, and try to write it again."

---

### Shot 4 · 0:48–0:58 · Terminal B

Same window, no new command. Just hold on the finished output.

```
   REJECTED: AlreadyRevealed
completeness after  : 10.76%  (31 revealed)
   unchanged — a rejected reveal cannot damage the record
```

**Say:**
> "The chain refuses the rewrite. And the agent's score does not move, so nobody
> can damage someone else's record by spamming bad submissions at it either."

---

### Shot 5 · 0:58–1:14 · browser, ChainScan tab

**Where:** The ChainScan tab you opened in step 4.

**Do:** Point at **Status: Success** at the top. Then click the **Logs** tab and
point at the decoded event: `DecisionRejected`, agent `8`, slot `1`, reason
`BadReveal`.

**Say:**
> "This is the real byte-tamper case. A committed response was changed by one
> byte before reveal, and mainnet rejected it. The transaction succeeds on
> purpose, so the rejection itself is public evidence instead of a failure that
> looks like the system broke."

---

### Shot 6 · 1:14–1:34 · browser, `/proof` tab

**Do:** The page opens on **"Two transactions. One byte apart."** Scroll down
about one screen to the panel headed **"Slot 1 · epoch 0"**. It is a horizontal
timeline with four stops:

```
18:12:05  sealed commit
18:13:43  commit deadline
18:17:43  disclosure opens
18:18:05  revealed + verified
```

Point at the first two, then sweep right to the last two.

**Say:**
> "Before reveal, the renter gets the direction and the public chain gets only a
> hash. This call was sealed ninety-eight seconds inside its deadline, then
> stayed private for three hundred and thirty-eight seconds. That window is
> exactly what a renter is paying for."

---

### Shot 7 · 1:34–1:50 · browser, `/agents` tab

**Do:** Let the grid of eight agent cards sit for two seconds. Click the card
for **Agent 7**. It lands on the panel headed **"Forward record"**, showing the
badge **epoch 1** and, beside the big percentage, **"epoch running · N not yet
due"**.

**Say:**
> "Every record here is read straight off 0G mainnet. No indexer, no database.
> This agent is committing right now, and its denominator was fixed before it
> started."

---

### Shot 8 · 1:50–2:20 · browser, still on `/agents/7` — the one that matters

**Do:** Scroll down one panel, past "Forward record", to the panel headed
**"Every epoch, including the bad ones."** Two rows:

```
epoch 1   <climbing>   N of 288 scheduled    current  running
epoch 0   10.76%       31 of 288 scheduled   255 missed
```

Point at the `epoch 0` row. Then at the header on the right, reading
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

Epoch 1's row climbs while you record. Narrate epoch 0's numbers, which are
frozen. Epoch 1 also carries a few missed slots of its own, and they are honest
ones: the 0G Compute provider returned `fetch failed` on four slots and rejected
one as `Missing or invalid parameters`, so no signed decision existed to commit
before those deadlines. If a viewer catches it, that is a *good* question to
get, so don't skip past the row.

---

### Shot 9 · 2:20–2:40 · Terminal A

**Do:** Switch to Terminal A. Paste and run.

```
pnpm fief-verify --tx 0xc8543dfc0a44adced1c35bce3b5f336feaba8e31ff658a81f2eab0bd249ade19
```

This is the same command the live site's copy button hands a visitor, which is
why it is worth showing rather than a script alias only we know.

About 7 seconds. Hold on the tail:

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

### Shot 10 · 2:40–2:50 · title card

**Where:** Name, the live URL, the repo.

**Say:**
> "Fief. Private alpha now, public proof later."

---

## If something breaks mid-recording

- **A page hangs past ~12s.** Reload once. Live reads occasionally hit a slow
  RPC and there is no cache to fall back on.
- **`demo-reject` finds no revealed slot.** It shouldn't — agent 7 epoch 0 is
  finished and its 31 revealed slots are frozen. If it happens, the RPC is
  failing to return calldata. Retry once, then fall back to
  `AGENT=8 EPOCH=0 pnpm demo-reject`.
- **`demo-reject` prints `FAIL — the chain ACCEPTED a rewritten entry`.** Stop
  recording. That means an invariant broke and the video is the least of the
  problem.
- **ChainScan is slow.** Shot 9 makes the same point and does not need the
  explorer. Cut shot 5 rather than stall.

---

## Deliberately not filmed

**`pnpm adversarial`** is the real adversarial proof — late commit, early
reveal, tampered byte, honest reveal afterwards — but it spends about five
minutes waiting on genuine slot deadlines. Do not speed it up in the edit; a jump
cut through a timing proof is exactly what a skeptical judge should distrust.
Shots 3 and 5 cover the same ground with artifacts already on chain.

**The rent flow.** Wired and deployed, but no rent has ever been signed from a
browser wallet, and the first attempt should not be live on camera. It also does
not fit: you are at 2:50 of a 3:00 cap and a MetaMask connect plus confirm is
20–30s. Do it off camera before submitting instead — agent 6 is the only active
listing, 0.001 OG minimum escrow. That closes the last partial claim in
`claims.yaml` and gives you a screenshot for the X post.

---

## Numbers, verified 2026-08-29

| claim | value | source |
|---|---|---|
| private window | 338 s | agent 8 slot 1, `slotRevealOpen - committedAt` |
| commit margin | 98 s inside the deadline | same slot |
| agent 8 completeness | 100%, 2 of 2 | `completenessBps(8,0)` |
| verifier result | green 6 of 6; red 4 passed 2 failed, exit 1 | `pnpm fief-verify --tx …` |
| agents on chain | 8 | `nextAgentId()` returns 9 |
| agent 7 epoch 0 | 10.76%, 31 of 288, 255 missed | frozen, the outage |
| the outage | stopped 2026-08-25 20:32 UTC at slot 33 | `runtime/campaign.log`, last line |
| agent 7 epoch 1 | opened 2026-08-29 16:12 UTC, 288 slots at 300 s | running, climbing |
| red tamper tx | success, `DecisionRejected(8, 1, "BadReveal")` | receipt read 2026-08-29 |
| shot 2 openEpoch | `0x09a93df8…` | agent 7 epoch 0 |

Do **not** say "242 tests" or "four 0G components" on camera. Nobody is moved by
a test count. They are moved by a bot being unable to delete its losing calls.

Lines beginning with three backticks in this document are markdown formatting
around a command, never part of it. Copy what is between them.
