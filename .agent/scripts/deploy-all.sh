#!/bin/bash

# 🚀 Orchestrator 5.1 — Hub Sync (Push Updates to All Client Projects)
# Usage: bash deploy-all.sh
# Effect: Re-runs link-orchestrator.sh in every registered client project.
#         Client projects register themselves by running link-orchestrator.sh,
#         which adds their path to .agent/memory/clients_registry.txt

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"
RESET="\033[0m"

HUB_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LINKER_SCRIPT="$HUB_DIR/.agent/scripts/link-orchestrator.sh"
REGISTRY="$HUB_DIR/.agent/memory/clients_registry.txt"

echo ""
echo -e "${BOLD}${CYAN}🚀 ORCHESTRATOR 5.1 — HUB SYNC${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}  Hub: ${HUB_DIR}${RESET}"
echo ""

if [ ! -f "$REGISTRY" ]; then
  echo -e "${YELLOW}⚠️  No clients registered yet.${RESET}"
  echo -e "${CYAN}  → In a client project, run: bash $LINKER_SCRIPT${RESET}"
  exit 0
fi

synced=0
skipped=0
failed=0

while IFS= read -r project; do
  [ -z "$project" ] && continue
  [ "${project:0:1}" = "#" ] && continue   # skip comment lines
  name=$(basename "$project")

  if [ ! -d "$project" ]; then
    echo -e "  ${YELLOW}⚠️  ${name}: directory not found — skipped${RESET}"
    skipped=$((skipped + 1))
    continue
  fi

  echo -e "  🔄 Syncing ${BOLD}${name}${RESET}..."
  (cd "$project" && bash "$LINKER_SCRIPT" > /dev/null 2>&1)
  if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ ${name}: synced to Orchestrator 5.1${RESET}"
    synced=$((synced + 1))
  else
    echo -e "  ${RED}❌ ${name}: sync failed${RESET}"
    failed=$((failed + 1))
  fi
done < "$REGISTRY"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${GREEN}✅ ${synced} synced${RESET}  ${YELLOW}⚠️  ${skipped} skipped${RESET}  ${RED}❌ ${failed} failed${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
