#!/bin/bash

# 🔗 Orchestrator 5.1 — Global Linker
# Usage: bash <path-to-this-script>
# Effect: Replaces the local .agent directory with a symlink to the central hub.

# 1. Define the Central Hub Path (Source of Truth)
# Use environment variable if set, otherwise detect based on script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HUB_DIR="${ORCHESTRATOR_HUB:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SOURCE_AGENT="$HUB_DIR/.agent"
SOURCE_GEMINI="$HUB_DIR/GEMINI.md"

# 2. Safety Checks
if [ ! -d "$SOURCE_AGENT" ]; then
  echo "❌ Error: Central Hub not found at $SOURCE_AGENT"
  exit 1
fi

TARGET_DIR=$(pwd)
echo "🔗 Linking $TARGET_DIR to Orchestrator Hub..."

# 3. Backup existing .agent (Only if it's a real directory and NOT already linked)
if [ -d ".agent" ] && [ ! -L ".agent" ] && [ ! -L ".agent/workflows" ]; then
  echo "📦 Backing up existing .agent to .agent_backup_$(date +%s)..."
  mv .agent ".agent_backup_$(date +%s)"
fi

# 4. Create Symlink for .agent
# Note: specific files like task_board.md should be local, but for now we link the whole folder 
# and rely on gitignore or strict discipline. 
# BETTER APPROACH: Link only shared folders (workflows, scripts, skills) and keep memory local.

# --- Hybrid Linking Strategy ---
mkdir -p .agent

# (A) Link Workflows (Global)
rm -rf .agent/workflows
ln -s "$SOURCE_AGENT/workflows" .agent/workflows

# (B) Link Scripts (Global)
rm -rf .agent/scripts
ln -s "$SOURCE_AGENT/scripts" .agent/scripts

# (C) Link ALL Skills (Global)
mkdir -p .agent
rm -rf .agent/skills
ln -s "$SOURCE_AGENT/skills" .agent/skills

# (D) Keep Memory Local (Do NOT link)
mkdir -p .agent/memory
if [ ! -f ".agent/memory/task_board.md" ]; then
  touch ".agent/memory/task_board.md"
fi

# 5. Copy GEMINI.md (Constitution) - Use COPY, not link, for Remote Git compatibility
if [ "$TARGET_DIR" != "$HUB_DIR" ]; then
  rm -f GEMINI.md
  cp "$SOURCE_GEMINI" GEMINI.md
  echo "   - GEMINI.md: Global (Copied for Git/Remote)"
  
  # 6. Register Client in Hub (New in v5.1)
  REGISTRY="$HUB_DIR/.agent/memory/clients_registry.txt"
  mkdir -p "$(dirname "$REGISTRY")"
  if ! grep -Fxq "$TARGET_DIR" "$REGISTRY" 2>/dev/null; then
    echo "$TARGET_DIR" >> "$REGISTRY"
    echo "   - Registered at Hub: $REGISTRY"
  fi
else
  echo "   - GEMINI.md: Hub Original (Kept as is)"
fi

echo "✅ Orchestrator 5.1 Connected!"
echo "   - Workflows: Global (Linked)"
echo "   - Scripts:   Global (Linked)"
echo "   - Skills:    Global (Linked)"
echo "   - Memory:    Local  (Kept)"
