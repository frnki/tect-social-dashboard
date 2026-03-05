#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/seonah/.openclaw/workspace-tiktok-ctk-ops"
SRC="$ROOT/out/reddit"
DST="$ROOT/social-dashboard/data/reddit"

mkdir -p "$DST"

latest_base=$(ls -1t "$SRC"/reddit_daily_report_*.json 2>/dev/null | grep -v '_enriched\.json' | grep -v '_translated\.json' | head -n1 || true)
if [[ -z "${latest_base:-}" ]]; then
  echo "No base report found in $SRC"
  exit 1
fi

latest_enriched="${latest_base%.json}_enriched.json"
if [[ ! -f "$latest_enriched" ]]; then
  echo "No enriched report found: $latest_enriched"
  exit 1
fi

cp "$latest_base" "$DST/"
cp "$latest_enriched" "$DST/"

echo "Synced:"
echo "- $(basename "$latest_base")"
echo "- $(basename "$latest_enriched")"

cd "$ROOT"

git add social-dashboard/data/reddit social-dashboard/app/page.tsx social-dashboard/lib/reddit.ts scripts/sync_dashboard_data_and_git.sh scripts/reddit_enrich_llm.py || true

if git diff --cached --quiet; then
  echo "No staged changes to commit."
  exit 0
fi

msg="chore(dashboard): sync reddit reports + update archive/insight UI ($(date +%F' '%T))"
git commit -m "$msg"

if git remote | grep -q .; then
  git push
  echo "Pushed to remote."
else
  echo "Committed locally. No remote configured, so push skipped."
fi
