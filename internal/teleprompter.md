# Fief — teleprompter script

Read straight down. Only the CAPS lines are stage directions — everything else
you say out loud.

---

[HOLD ON SCREENSHOT]

A trading bot can show a beautiful backtest.

But it can quietly remove the calls that went wrong.

---

[SWITCH TO TAB 1 — TERMINAL B]
[TYPE: NETWORK=mainnet AGENT=7 EPOCH=0 pnpm schedule]

Fief fixes the bot's schedule first.

Two hundred and eighty-eight slots, a five-minute cadence, a hard deadline on
each one — all written to 0G mainnet before the first slot even opened.

No outcome existed yet, and the operator cannot change any of it now.

---

[SAME TAB]
[TYPE: NETWORK=mainnet AGENT=7 EPOCH=0 pnpm demo-reject]

Now I am going to take a decision that is already on the public record,
change one byte of it, and try to write it again.

[WAIT FOR IT TO FINISH, ~8s]

The chain refuses the rewrite.

And the agent's score does not move — so nobody can damage someone else's
record by spamming bad submissions at it either.

---

[SWITCH TO TAB 2 — CHAINSCAN]
[CLICK "LOGS" TAB, POINT AT DecisionRejected / BadReveal]

This is the real byte-tamper case. A committed response was changed by one
byte before reveal, and mainnet rejected it.

The transaction succeeds on purpose — so the rejection itself is public
evidence, instead of a failure that looks like the system broke.

---

[SWITCH TO TAB 3 — /proof]
[SCROLL TO "Slot 1 · epoch 0" TIMELINE]

Before reveal, the renter gets the direction and the public chain gets only a
hash.

This call was sealed ninety-eight seconds inside its deadline, then stayed
private for three hundred and thirty-eight seconds.

That window is exactly what a renter is paying for.

---

[SWITCH TO TAB 4 — /agents]
[CLICK AGENT 7 CARD]

Every record here is read straight off 0G mainnet. No indexer, no database.

This agent is committing right now, and its denominator was fixed before it
started.

---

[SAME TAB, SCROLL DOWN TO "Every epoch, including the bad ones."]
[POINT AT THE epoch 0 ROW]

And here is our own campaign.

It ran for three hours and then the machine it was on went to sleep. Two
hundred and fifty-five scheduled calls never happened.

I cannot reopen this epoch, I cannot backfill those calls, and I cannot
delete this row. It is public, and it counts against us forever.

That is Fief working.

[DO NOT RUSH THIS ONE. DO NOT APOLOGISE FOR IT.]

---

[SWITCH TO TAB 1 — TERMINAL A]
[TYPE: pnpm fief-verify --tx 0xf78fb246ffba304aea4f888c5b04a9cc17f3b3414c09a7fb4e185aefd2f800ef]

And you do not have to trust the website.

This recomputes the whole thing from public RPC data, recovers the enclave
signer out of the receipt itself, and checks it against 0G's own serving
contract.

[HOLD ON "6 checks passed, 0 failed"]

---

[TITLE CARD]

Fief. Private alpha now, public proof later.

---
