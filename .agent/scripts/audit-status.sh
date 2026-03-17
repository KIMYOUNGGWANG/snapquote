#!/bin/bash

# 🏭 Orchestrator 5.2 — Audit Status (Multi-Agent Health Scanner)
# Usage: bash .agent/scripts/audit-status.sh
# v5.2: Added Bridge & Path integrity checks.
# Run at Step 0 of any workflow to detect issues before coding begins.

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo ""
echo "🔍 Audit Status — One-Shot Environment Scan"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ISSUES=0

# 1. Check for error logs
ERROR_LOGS=$(find "$PROJECT_ROOT" -name "*.error.log" -newer "$PROJECT_ROOT/.agent/memory/task_board.md" 2>/dev/null | head -5)
if [ -n "$ERROR_LOGS" ]; then
  echo "🚨 Recent error logs found:"
  echo "$ERROR_LOGS" | while read -r f; do echo "   • $f"; done
  echo "   💡 Recommendation: Run /fix workflow"
  ISSUES=$((ISSUES + 1))
else
  echo "✅ No recent error logs"
fi

# 2. Check Git status (uncommitted changes)
if [ -d "$PROJECT_ROOT/.git" ]; then
  UNCOMMITTED=$(cd "$PROJECT_ROOT" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "⚠️  $UNCOMMITTED uncommitted file(s) in Git"
    echo "   💡 Consider committing before starting new work"
    ISSUES=$((ISSUES + 1))
  else
    echo "✅ Git working directory clean"
  fi
else
  echo "ℹ️  No Git repository found (skipping Git check)"
fi

# 3. Check if api-spec.md exists (Contract Check)
if [ -f "$PROJECT_ROOT/docs/api-spec.md" ]; then
  echo "✅ docs/api-spec.md exists (Contract ready)"
else
  echo "⚠️  docs/api-spec.md NOT found"
  echo "   💡 Run /plan to generate API Spec before /develop"
  ISSUES=$((ISSUES + 1))
fi

# 4. Check learnings.md for recent entries
if [ -f "$PROJECT_ROOT/.agent/memory/learnings.md" ]; then
  LEARNING_COUNT=$(grep -c "^- " "$PROJECT_ROOT/.agent/memory/learnings.md" 2>/dev/null || echo "0")
  echo "🧠 learnings.md: $LEARNING_COUNT accumulated entries"
else
  echo "ℹ️  No learnings.md found (will be created after first /ship)"
fi

# 5. External Change Detection (Multi-Tool Audit)
if [ -f "$PROJECT_ROOT/.agent/memory/task_board.md" ]; then
  MODIFIED_FILES=$(find "$PROJECT_ROOT" -type f -not -path "*/.*" -not -path "*/node_modules/*" -newer "$PROJECT_ROOT/.agent/memory/task_board.md" 2>/dev/null)
  if [ -n "$MODIFIED_FILES" ]; then
    echo "🕵️  Detected files modified by external tools (Codex/Claude):"
    echo "$MODIFIED_FILES" | while read -r f; do echo "   • $(basename "$f")"; done
    echo "   💡 Action: Verify these files against GEMINI.md standards."
    ISSUES=$((ISSUES + 1))
  fi
fi

# 6. Check task_board.md progress
if [ -f "$PROJECT_ROOT/.agent/memory/task_board.md" ]; then
  TOTAL=$(grep -c "\- \[" "$PROJECT_ROOT/.agent/memory/task_board.md" 2>/dev/null || echo "0")
  DONE=$(grep -c "\- \[x\]" "$PROJECT_ROOT/.agent/memory/task_board.md" 2>/dev/null || echo "0")
  echo "📋 task_board.md: $DONE / $TOTAL tasks completed"
else
  echo "ℹ️  No task_board.md found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$ISSUES" -eq 0 ]; then
  echo "🟢 All clear. Safe to proceed."
else
  echo "🟡 $ISSUES issue(s) detected. Review above before proceeding."
fi
