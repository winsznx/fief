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
#   cd runtime && NETWORK=mainnet AGENT=7 EPOCH=1 ./supervise-campaign.sh
#
# PRIVATE_KEY must be exported. Ctrl-C stops it for good.

set -uo pipefail

: "${AGENT:?set AGENT}"
: "${EPOCH:?set EPOCH}"
: "${PRIVATE_KEY:?export PRIVATE_KEY}"

RESTART_DELAY="${RESTART_DELAY:-20}"

trap 'echo "$(date -u +%FT%TZ) supervisor: stopped by hand"; exit 0' INT TERM

echo "$(date -u +%FT%TZ) supervisor: agent $AGENT epoch $EPOCH, restart delay ${RESTART_DELAY}s"

while true; do
  # caffeinate -i blocks idle sleep for as long as the child runs, which is the
  # specific failure this script exists to prevent.
  caffeinate -i pnpm campaign
  code=$?
  echo "$(date -u +%FT%TZ) supervisor: campaign exited ${code}, restarting in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
