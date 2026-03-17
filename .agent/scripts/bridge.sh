#!/bin/bash

# 🌉 Orchestrator Bridge Script (v5.2 — Multi-Agent Synergy)
# Usage: ./bridge.sh [workflow_name]
# Example: ./bridge.sh develop
# v5.2: Enhanced Claude Code synergy. Added 'Last Pulse' for freshness verification.
#       Optimized for Master-Slave (Antigravity-Claude) handshake patterns.

WORKFLOW=$1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$WORKFLOW" ]; then
  echo "Usage: ./bridge.sh [workflow_name] [--lite]"
  echo "Available: develop, fix, launch, ship, uiux, optimize, marketing"
  echo "Extended: audit, studio, test, stitch, ideate, cycle, micro, status"
  exit 1
fi

LITE_MODE=false
if [[ "$*" == *"--lite"* ]]; then
  LITE_MODE=true
  echo "🍃 Lite Mode Enabled"
fi

# Resolve paths: local .agent first, then global ~/.agent
resolve_path() {
  if [ -f ".agent/$1" ]; then
    echo ".agent/$1"
  elif [ -f "$HOME/.agent/$1" ]; then
    echo "$HOME/.agent/$1"
  else
    echo ""
  fi
}

# Strictly local paths for project-isolated memory
resolve_memory() {
  if [ -f ".agent/memory/$1" ]; then
    echo ".agent/memory/$1"
  else
    echo ""
  fi
}

OUTPUT_FILE=".agent/memory/codex_context.txt"
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "=== 🤖 Orchestrator 5.2 — Multi-Agent Synergy Bridge ===" > $OUTPUT_FILE
echo "Last Pulse: $(date '+%Y-%m-%d %H:%M:%S')" >> $OUTPUT_FILE
echo "Protocol: [Antigravity x Claude] Master-Slave Harmony" >> $OUTPUT_FILE
if [ "$LITE_MODE" = true ]; then
  echo "Mode: [LITE] — Minimized context for efficiency." >> $OUTPUT_FILE
else
  echo "Mode: [PRECISION] — Only essentials loaded. No noise." >> $OUTPUT_FILE
fi
echo "Your role is defined in the workflow below." >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# --- Section 1: Mission ---
echo "--- [ 1. The Mission ] ---" >> $OUTPUT_FILE
TASK_BOARD=$(resolve_memory "task_board.md")
if [ -n "$TASK_BOARD" ] && [ -f "$TASK_BOARD" ]; then
  cat "$TASK_BOARD" >> $OUTPUT_FILE
else
  echo "(No task board found. Create one with /launch)" >> $OUTPUT_FILE
fi
echo "" >> $OUTPUT_FILE

# --- Section 2: Contract (Only if exists — AI can't guess this) ---
if [ -f "docs/api-spec.md" ]; then
  echo "--- [ 2. The Contract (API Spec) ] ---" >> $OUTPUT_FILE
  cat docs/api-spec.md >> $OUTPUT_FILE
  echo "" >> $OUTPUT_FILE
fi

# --- Section 3: Precision Skills (via smart-skill-loader --strict) ---
echo "--- [ 3. Precision Skills ] ---" >> $OUTPUT_FILE

# Auto-detect tech stack from project files for smart loading
TECH_SIGNALS=""
[ -f "package.json" ] && TECH_SIGNALS="$TECH_SIGNALS $(python3 -c "
import json
try:
    pkg = json.load(open('package.json'))
    deps = list(pkg.get('dependencies', {}).keys()) + list(pkg.get('devDependencies', {}).keys())
    # Extract top 3 most relevant framework names
    priority = ['next', 'react', 'vue', 'svelte', 'three', 'express', 'fastify', 'supabase', 'prisma', 'tailwind']
    found = [d for d in priority if any(d in dep for dep in deps)][:3]
    print(' '.join(found) if found else 'typescript')
except: print('javascript')
" 2>/dev/null)"
[ -f "requirements.txt" ] && TECH_SIGNALS="$TECH_SIGNALS python"
[ -f "Cargo.toml" ] && TECH_SIGNALS="$TECH_SIGNALS rust"
[ -f "go.mod" ] && TECH_SIGNALS="$TECH_SIGNALS golang"

# Fallback: use workflow name as signal
if [ -z "$(echo "$TECH_SIGNALS" | tr -d ' ')" ]; then
  TECH_SIGNALS="$WORKFLOW"
fi

SKILL_LOADER=$(resolve_path "scripts/smart-skill-loader.sh")
if [ -n "$SKILL_LOADER" ]; then
  echo "Auto-detected tech: $TECH_SIGNALS" >> $OUTPUT_FILE
  
  if [ "$LITE_MODE" = true ]; then
    echo "🧠 Skills: [LITE] Names only (skip content)" >> $OUTPUT_FILE
    bash "$SKILL_LOADER" "$TECH_SIGNALS" --strict 2>/dev/null | grep ".md" >> $OUTPUT_FILE
  else
    bash "$SKILL_LOADER" "$TECH_SIGNALS" --concat --strict 2>&1 | tail -5 >> $OUTPUT_FILE
    
    # Append the merged skill content
    LOADED_SKILLS=$(resolve_memory "current_loaded_skills.md")
    if [ -n "$LOADED_SKILLS" ] && [ -f "$LOADED_SKILLS" ]; then
      echo "" >> $OUTPUT_FILE
      cat "$LOADED_SKILLS" >> $OUTPUT_FILE
    fi
  fi
else
  echo "(Smart Skill Loader not found)" >> $OUTPUT_FILE
fi
echo "" >> $OUTPUT_FILE

# --- Section 4: Learnings (Past mistakes — AI can't know these) ---
echo "--- [ 4. Learnings (Past Mistakes) ] ---" >> $OUTPUT_FILE
LEARNINGS=$(resolve_memory "learnings.md")
if [ -n "$LEARNINGS" ] && [ -f "$LEARNINGS" ]; then
  cat "$LEARNINGS" >> $OUTPUT_FILE
else
  echo "(No learnings file found)" >> $OUTPUT_FILE
fi
echo "" >> $OUTPUT_FILE

# --- Section 5: Workflow Rules ---
echo "--- [ 5. The Rules (Workflow: $WORKFLOW) ] ---" >> $OUTPUT_FILE
WORKFLOW_FILE=$(resolve_path "workflows/$WORKFLOW.md")
if [ -n "$WORKFLOW_FILE" ]; then
  cat "$WORKFLOW_FILE" >> $OUTPUT_FILE
else
  echo "❌ Error: Workflow '$WORKFLOW' not found locally or globally." >> $OUTPUT_FILE
fi
echo "" >> $OUTPUT_FILE

# --- Section 6: Instructions ---
echo "--- [ 6. Instructions ] ---" >> $OUTPUT_FILE
echo "Execute the current step marked in [ 1. The Mission ]." >> $OUTPUT_FILE
echo "Follow the rules in [ 5. The Rules ] strictly." >> $OUTPUT_FILE
echo "If writing code, adhere to [ 2. The Contract ]." >> $OUTPUT_FILE
echo "Reference [ 4. Learnings ] to avoid repeating past mistakes." >> $OUTPUT_FILE

# Copy to clipboard (Mac)
pbcopy < $OUTPUT_FILE

FILE_SIZE=$(du -h $OUTPUT_FILE | cut -f1)
echo ""
echo "✅ Orchestrator 5.2 — Multi-Agent Synergy Bridge"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Bundled: '$OUTPUT_FILE' ($FILE_SIZE)"
echo "🎯 Workflow: $WORKFLOW"
echo "🧠 Synergy: Optimized for Claude + Codex"
echo "📋 Copied to clipboard! Just paste into Claude."
echo ""
