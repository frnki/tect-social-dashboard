#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/seonah/.openclaw/workspace-tiktok-ctk-ops"
SRC="$ROOT/out/reddit"
DST="$ROOT/social-dashboard/data/reddit"

mkdir -p "$DST"

# keep rolling latest 30 days (archive in dashboard)
latest_bases=$(ls -1 "$SRC"/reddit_daily_report_*.json 2>/dev/null | grep -v '_enriched\.json' | grep -v '_translated\.json' | sort -r | head -n 30 || true)
if [[ -z "${latest_bases}" ]]; then
  echo "No base report found in $SRC"
  exit 1
fi

# clear old dashboard data first
find "$DST" -type f -name 'reddit_daily_report_*.json' -delete || true

count=0
while IFS= read -r latest_base; do
  [[ -z "$latest_base" ]] && continue
  latest_enriched="${latest_base%.json}_enriched.json"
  cp "$latest_base" "$DST/"
  if [[ -f "$latest_enriched" ]]; then
    cp "$latest_enriched" "$DST/"
  fi
  count=$((count+1))
done <<EOF
$latest_bases
EOF

echo "Synced ${count} base reports (+ enriched when exists)"

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
