#!/bin/bash

# 🏭 Orchestrator 5.1 — Governance Dashboard
# Usage: bash dashboard.sh
# Shows real-time status of all registered client projects.

BOLD="\033[1m"
DIM="\033[2m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
MAGENTA="\033[35m"
CYAN="\033[36m"
RESET="\033[0m"

HUB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REGISTRY="$HUB_DIR/.agent/memory/clients_registry.txt"

clear
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║        🏭  ORCHESTRATOR 5.1 — GOVERNANCE DASHBOARD          ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo -e "${DIM}  $(date '+%Y-%m-%d %H:%M:%S')${RESET}"
echo ""

# --- Hub Status ---
echo -e "${BOLD}${MAGENTA}🌐 HUB: $(basename "$HUB_DIR")${RESET}"
echo -e "${MAGENTA}   Path: ${HUB_DIR}${RESET}"
WORKFLOW_COUNT=$(ls "$HUB_DIR/.agent/workflows/"*.md 2>/dev/null | wc -l | tr -d ' ')
SKILL_COUNT=$(find "$HUB_DIR/.agent/skills" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
echo -e "${MAGENTA}   ⚙️  ${WORKFLOW_COUNT} workflows  |  🧠 ${SKILL_COUNT} skills${RESET}"
echo ""

if [ ! -f "$REGISTRY" ] || [ ! -s "$REGISTRY" ]; then
  echo -e "${YELLOW}⚠️  No client projects registered yet.${RESET}"
  echo -e "${CYAN}  → In a client project, run:${RESET}"
  echo -e "${CYAN}    bash ${HUB_DIR}/.agent/scripts/link-orchestrator.sh${RESET}"
  echo ""
  exit 0
fi

idx=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  [ "${path:0:1}" = "#" ] && continue
  name=$(basename "$path")
  idx=$((idx + 1))

  echo -e "${BOLD}${BLUE}┌─────────────────────────────────────────────────────────────┐${RESET}"
  echo -e "${BOLD}${BLUE}│  ${MAGENTA}[$idx]${BLUE} ${name}${RESET}"
  echo -e "${BOLD}${BLUE}│  ${DIM}${path}${RESET}"
  echo -e "${BOLD}${BLUE}├─────────────────────────────────────────────────────────────┤${RESET}"

  # Git Status
  if [ -d "$path/.git" ]; then
    branch=$(cd "$path" && git branch --show-current 2>/dev/null || echo "N/A")
    changes=$(cd "$path" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    last_commit=$(cd "$path" && git log -1 --format="%ar" 2>/dev/null || echo "N/A")
    if [ "$changes" -eq 0 ]; then
      git_status="${GREEN}✅ Clean${RESET}"
    else
      git_status="${YELLOW}⚠️  ${changes} uncommitted${RESET}"
    fi
    echo -e "${BLUE}│${RESET}  🌿 ${BOLD}${branch}${RESET}  |  ${git_status}  |  Last: ${DIM}${last_commit}${RESET}"
  else
    echo -e "${BLUE}│${RESET}  ${DIM}(No git repo)${RESET}"
  fi

  # API Spec
  if [ -f "$path/docs/api-spec.md" ]; then
    echo -e "${BLUE}│${RESET}  📜 Contract: ${GREEN}✅ Found${RESET}"
  else
    echo -e "${BLUE}│${RESET}  📜 Contract: ${RED}❌ Missing — run /plan${RESET}"
  fi

  # Task Board
  if [ -f "$path/.agent/memory/task_board.md" ]; then
    total=$(grep -c '\- \[' "$path/.agent/memory/task_board.md" 2>/dev/null | head -n 1)
    total=${total:-0}
    done=$(grep -c '\- \[x\]' "$path/.agent/memory/task_board.md" 2>/dev/null | head -n 1)
    done=${done:-0}
    pct=0
    if [ "$total" -gt 0 ]; then
      pct=$((done * 100 / total))
    fi
    echo -e "${BLUE}│${RESET}  📋 Tasks: ${BOLD}${done}/${total}${RESET} (${pct}% done)"
  else
    echo -e "${BLUE}│${RESET}  📋 Tasks: ${DIM}No task board${RESET}"
  fi

  echo -e "${BOLD}${BLUE}└─────────────────────────────────────────────────────────────┘${RESET}"
  echo ""
done < "$REGISTRY"

echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  📊 ${idx} client project(s) connected to Orchestrator 5.1 Hub${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
