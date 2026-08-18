#!/bin/bash
# milestone-watchdog.sh — report ONCE per wallet when a win-count threshold is crossed.
# Pairs with a cron job (e.g. every 3m): empty stdout = silent (no delivery);
# non-empty stdout = the milestone message is delivered to the chat.
#
# Usage: milestone-watchdog.sh <race-log> <threshold> [state-file]
#   <race-log>   path to the race script log (tee'd), e.g. /tmp/mc-race.log
#   <threshold>  win count that means "full" (e.g. 10 = 10/10 cap)
#   <state-file> where already-reported wallets are remembered (default /tmp/milestone-watchdog-state)
#
# Expected log line format (adjust the grep below to the script's own format):
#   🎉 wallet 3: WIN (9/10) total 31
#
# GOTCHAS (learned live, Merge Cats 2026-08):
# 1. Count WIN lines ONLY — `grep -oE 'wallet [0-9]+'` over the whole log also matches
#    ERR/skip lines ("wallet 2: ERR ...") and inflates counts (46 matches vs 33 real wins
#    measured in one log) → can false-trigger a milestone. Filter with `grep 'WIN'` first.
# 2. Match WITHOUT the colon — `'wallet [0-9]+: WIN'` makes awk field 3 = "1:" (colon
#    included) → state/echo get "1:" garbage. Use `'wallet [0-9]+'` so $3 is the bare number.

LOG="${1:?usage: milestone-watchdog.sh <race-log> <threshold> [state-file]}"
THRESHOLD="${2:?usage: milestone-watchdog.sh <race-log> <threshold> [state-file]}"
STATE="${3:-/tmp/milestone-watchdog-state}"

[ -f "$LOG" ] || exit 0
touch "$STATE"

# wallets whose win count >= threshold (bare numbers only)
WINS=$(grep 'WIN' "$LOG" | grep -oE 'wallet [0-9]+' | sort | uniq -c | awk -v t="$THRESHOLD" '$1>=t{print $3}')

NEW=""
for w in $WINS; do
  if ! grep -qx "$w" "$STATE"; then
    echo "$w" >> "$STATE"
    NEW="$NEW $w"
  fi
done

if [ -n "$NEW" ]; then
  TOT=$(grep -c 'WIN' "$LOG")
  echo "🚀 Milestone: wallet${NEW} reached $THRESHOLD wins! Total wins: $TOT"
fi
