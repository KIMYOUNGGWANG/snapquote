#!/bin/bash

# 🏭 Orchestrator 5.1 — Smart Skill Loader (2-Phase Dynamic Loading)
# Usage: bash smart-skill-loader.sh "keyword1 keyword2 ..."
# Phase 1: Search lightweight JSON index for matching skills
# Phase 2: Output only the top N matching skill file paths for the agent to load

SKILL_MAP=".agent/memory/skill_map.json"
GLOBAL_SKILLS_DIR="$HOME/.agent/skills/skills"
CONCAT_OUTPUT=".agent/memory/current_loaded_skills.md"
MAX_RESULTS="${2:-8}"  # default: top 8 skills
QUERY="${1:-}"
CONCAT_MODE=false

# Check for --concat flag in any argument position
for arg in "$@"; do
  if [ "$arg" = "--concat" ]; then
    CONCAT_MODE=true
  fi
done

if [ -z "$QUERY" ]; then
  echo "❌ Usage: bash smart-skill-loader.sh \"keyword1 keyword2\""
  exit 1
fi

if [ ! -f "$SKILL_MAP" ]; then
  echo "⚠️  skill_map.json not found. Running generate-skill-map.sh first..."
  bash "$(dirname "$0")/generate-skill-map.sh"
fi

echo ""
echo "🔍 Smart Skill Loader — Phase 1: Searching index for: \"$QUERY\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Phase 1: Search the lightweight index (id + description only, no full file content)
MATCHES=()
while IFS= read -r line; do
  MATCHES+=("$line")
done < <(python3 - <<EOF
import json, sys, re, os

with open("$SKILL_MAP", "r") as f:
    try:
        skills = json.load(f)
    except json.JSONDecodeError as e:
        print(f"JSON error: {e}", file=sys.stderr)
        sys.exit(1)

query_terms = "${QUERY}".lower().split()
results = []

for skill in skills:
    skill_id = skill.get("id", "").lower()
    description = skill.get("description", "").lower()
    path = skill.get("path", "")
    combined = skill_id + " " + description
    score = sum(1 for term in query_terms if term in combined)
    if score > 0:
        results.append((score, skill_id, path, skill.get("description", "")[:80]))

results.sort(key=lambda x: -x[0])
for score, sid, path, desc in results[:int(os.environ.get("MAX_RESULTS", 8))]:
    desc_clean = desc.replace("\n", " ")
    print(f"{score}\t{sid}\t{path}\t{desc_clean}")
EOF
)

if [ ${#MATCHES[@]} -eq 0 ]; then
  echo "⚠️  No matching skills found for: \"$QUERY\""
  echo "💡 Try broader keywords or run: bash generate-skill-map.sh"
  exit 0
fi

echo ""
echo "✅ Phase 1 Complete — Top ${#MATCHES[@]} matching skills:"
echo ""

# Phase 2: Output matched skill paths (agent reads only these)
LOADED_PATHS=()
for match in "${MATCHES[@]}"; do
  SCORE=$(echo "$match" | cut -f1)
  SKILL_ID=$(echo "$match" | cut -f2)
  SKILL_PATH=$(echo "$match" | cut -f3)
  DESC=$(echo "$match" | cut -f4)
  echo "  ⭐ [$SCORE match] $SKILL_ID"
  echo "     → $SKILL_PATH"
  echo "     💬 $DESC"
  echo ""
  LOADED_PATHS+=("$SKILL_PATH")
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Phase 2: ${#LOADED_PATHS[@]} skill(s) selected for agent loading."
echo ""

# --concat mode: merge all skill file contents into a single file
if [ "$CONCAT_MODE" = true ]; then
  echo "📦 Concat Mode: Merging ${#LOADED_PATHS[@]} skills into $CONCAT_OUTPUT ..."
  echo "# 🧠 Dynamically Loaded Skills (Auto-generated)" > "$CONCAT_OUTPUT"
  echo "# Query: \"$QUERY\"" >> "$CONCAT_OUTPUT"
  echo "# Generated: $(date +%Y-%m-%dT%H:%M:%S)" >> "$CONCAT_OUTPUT"
  echo "" >> "$CONCAT_OUTPUT"
  for path in "${LOADED_PATHS[@]}"; do
    if [ -f "$path" ]; then
      echo "---" >> "$CONCAT_OUTPUT"
      echo "## Source: $path" >> "$CONCAT_OUTPUT"
      echo "" >> "$CONCAT_OUTPUT"
      cat "$path" >> "$CONCAT_OUTPUT"
      echo "" >> "$CONCAT_OUTPUT"
    fi
  done
  echo "✅ Merged into: $CONCAT_OUTPUT"
  echo "📋 AGENT DIRECTIVE: Read ONLY this single file: $CONCAT_OUTPUT"
else
  echo "📋 AGENT DIRECTIVE: Load ONLY the following skill files:"
  for path in "${LOADED_PATHS[@]}"; do
    echo "   • $path"
  done
fi
echo ""
echo "⚡ Token-efficient: Loaded ${#LOADED_PATHS[@]} / $(grep -c '"id"' $SKILL_MAP) total indexed skills."
