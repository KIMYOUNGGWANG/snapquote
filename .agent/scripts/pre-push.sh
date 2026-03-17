#!/bin/bash

# 🛡️ Orchestrator 4.0 — Pre-Push Quality Gate
# This script runs automatically before every `git push`.
# It checks: (1) Build passes, (2) API Spec exists, (3) No stale tasks.

BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RESET="\033[0m"

PASSED=0
WARNED=0
FAILED=0

echo ""
echo -e "${BOLD}${CYAN}🛡️  ORCHESTRATOR 4.0 — PRE-PUSH QUALITY GATE${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Gate 1: Build Check ──────────────────────────────────
echo -e "${BOLD}[1/3] Build Check${RESET}"
if [ -f "package.json" ]; then
  if grep -q '"build"' package.json 2>/dev/null; then
    npm run build --silent 2>/dev/null
    if [ $? -eq 0 ]; then
      echo -e "  ${GREEN}✅ Build passed${RESET}"
      PASSED=$((PASSED + 1))
    else
      echo -e "  ${RED}❌ Build FAILED — push blocked${RESET}"
      FAILED=$((FAILED + 1))
    fi
  else
    echo -e "  ${YELLOW}⚠️  No build script in package.json — skipped${RESET}"
    WARNED=$((WARNED + 1))
  fi
else
  echo -e "  ${YELLOW}⚠️  No package.json — skipped${RESET}"
  WARNED=$((WARNED + 1))
fi

# ── Gate 2: API Spec Check ───────────────────────────────
echo -e "${BOLD}[2/3] Contract Check${RESET}"
if [ -f "docs/api-spec.md" ]; then
  echo -e "  ${GREEN}✅ docs/api-spec.md found${RESET}"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️  No API spec — consider running /launch${RESET}"
  WARNED=$((WARNED + 1))
fi

# ── Gate 3: Task Board Check ─────────────────────────────
echo -e "${BOLD}[3/3] Task Board Check${RESET}"
if [ -f ".agent/memory/task_board.md" ]; then
  in_progress=$(grep -c '\- \[/\]' .agent/memory/task_board.md 2>/dev/null)
  in_progress=${in_progress:-0}
  if [ "$in_progress" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  ${in_progress} task(s) still in-progress${RESET}"
    WARNED=$((WARNED + 1))
  else
    echo -e "  ${GREEN}✅ No stale tasks${RESET}"
    PASSED=$((PASSED + 1))
  fi
else
  echo -e "  ${YELLOW}⚠️  No task board found${RESET}"
  WARNED=$((WARNED + 1))
fi

# ── Result ───────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${GREEN}✅ ${PASSED} passed${RESET}  ${YELLOW}⚠️  ${WARNED} warnings${RESET}  ${RED}❌ ${FAILED} failed${RESET}"

if [ "$FAILED" -gt 0 ]; then
  echo -e "\n  ${RED}${BOLD}🚫 PUSH BLOCKED — fix failures before pushing.${RESET}\n"
  exit 1
else
  echo -e "\n  ${GREEN}${BOLD}✅ ALL CLEAR — pushing...${RESET}\n"
  exit 0
fi
