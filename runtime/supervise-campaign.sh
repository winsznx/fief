#!/usr/bin/env bash
# Keeps the forward campaign alive.
#
# The first campaign run did not crash. It stopped mid-stride at 20:32 on
# 2026-08-25 with no error in the log, because the machine slept, and the epoch
# recorded 255 missed slots that the operator can never edit away. That is the
# system working. It is also an avoidable own-goal, so this wrapper does the two
# things that would have prevented it: holds the machine awake, and restarts the
# runtime if it ever exits.
#
# The campaign CLI is restartable by design. It reads on-chain state, skips
# slots already committed, and leaves slots whose deadline has passed as missed.
# A restart therefore costs exactly the slots we were down for, never more, and
# never backfills.
#
#   cd runtime && AGENT=7 EPOCH=1 ./supervise-campaign.sh
#
# The key comes from runtime/.env, same as every other runtime script. Ctrl-C
# stops it for good.

set -uo pipefail

cd "$(dirname "$0")"

# The campaign CLI loads .env itself. This is only so the check below can fail
# with a useful message instead of the runtime dying on its first slot.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${AGENT:?set AGENT}"
: "${EPOCH:?set EPOCH}"
: "${PRIVATE_KEY:?no PRIVATE_KEY: create runtime/.env or export it}"

RESTART_DELAY="${RESTART_DELAY:-20}"

# Refuse to be the second supervisor for this epoch.
#
# Two of these ran against agent 7 epoch 1 for about an hour on 2026-08-29,
# because the restart snippet got pasted into a shell where one was already
# running. They raced: the same slot logged MISSED from one process and
# COMMITTED from the other, and both burned an inference call and gas for every
# slot. Nothing reached the chain wrongly — a duplicate reveal reverts and
# changes no state, which is the anti-griefing property working — but it is pure
# waste and it makes the log unreadable.
#
# mkdir is atomic on every filesystem that matters, which a `[ -f ]` test is not.
LOCK=".campaign-${AGENT}-${EPOCH}.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  running=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$running" ] && kill -0 "$running" 2>/dev/null; then
    echo "supervisor: agent $AGENT epoch $EPOCH is already running as pid $running."
    echo "supervisor: refusing to start a second. Stop that one first, or use a different EPOCH."
    exit 1
  fi
  echo "$(date -u +%FT%TZ) supervisor: clearing a stale lock from pid ${running:-unknown}"
  rm -rf "$LOCK"
  mkdir "$LOCK" || exit 1
fi
echo $$ > "$LOCK/pid"

cleanup() {
  rm -rf "$LOCK"
}
trap 'cleanup; echo "$(date -u +%FT%TZ) supervisor: stopped by hand"; exit 0' INT TERM
trap cleanup EXIT

echo "$(date -u +%FT%TZ) supervisor: agent $AGENT epoch $EPOCH, restart delay ${RESTART_DELAY}s"

while true; do
  # caffeinate -i blocks idle sleep for as long as the child runs, which is the
  # specific failure this script exists to prevent.
  caffeinate -i pnpm campaign
  code=$?
  echo "$(date -u +%FT%TZ) supervisor: campaign exited ${code}, restarting in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
