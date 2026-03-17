#!/bin/bash

# 🏭 Orchestrator 5.1 — Worker Prompt Generator
# Usage: bash .agent/scripts/generate-worker-prompt.sh "<task description>"

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONSTITUTION="$PROJECT_ROOT/GEMINI.md"
API_SPEC="$PROJECT_ROOT/docs/api-spec.md"
TASK_DESCRIPTION=$1

if [ -z "$TASK_DESCRIPTION" ]; then
  echo "❌ Error: Missing task description."
  echo "Usage: bash .agent/scripts/generate-worker-prompt.sh \"Implement user login UI\""
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 GENERATED PROMPT FOR EXTERNAL WORKER (Codex/Claude)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "### 🎯 TASK"
echo "$TASK_DESCRIPTION"
echo ""
echo "### 📜 PROJECT CONSTITUTION (GEMINI.md)"
if [ -f "$CONSTITUTION" ]; then
  # Extract only the "Engineering Standards" and "Design DNA" sections to save tokens
  sed -n '/## 🛠️ 7. Embedded Engineering Standards/,/---/p' "$CONSTITUTION"
  sed -n '/## 🎨 8. Design DNA/,/---/p' "$CONSTITUTION"
else
  echo "⚠️ Warning: GEMINI.md not found. Proceeding with standard clean code rules."
fi
echo ""
echo "### 📑 API SPECIFICATION (Contract)"
if [ -f "$API_SPEC" ]; then
  cat "$API_SPEC"
else
  echo "⚠️ Warning: docs/api-spec.md not found. Please ensure type-safety manually."
fi
echo ""
echo "### 🚀 INSTRUCTIONS"
echo "1. Follow the 'Engineering Standards' and 'Design DNA' above strictly."
echo "2. Each function MUST be under 20 lines."
echo "3. Use the FSD Lite folder structure."
echo "4. DO NOT hallucinate any API fields not defined in the API SPEC."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
