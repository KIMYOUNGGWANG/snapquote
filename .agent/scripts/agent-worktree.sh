#!/bin/bash

# agent-worktree.sh — Automate Git Worktree for Multi-Agent Orchestration
# Usage: ./agent-worktree.sh [branch-name] [task-name]

BRANCH_NAME=$1
TASK_NAME=$2

if [ -z "$BRANCH_NAME" ] || [ -z "$TASK_NAME" ]; then
  echo "Usage: ./agent-worktree.sh [branch-name] [task-name]"
  exit 1
fi

WORKTREE_PATH="../agent-swarm/$TASK_NAME"

echo "🚀 Creating worktree for task: $TASK_NAME on branch: $BRANCH_NAME"
git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"

echo "✅ Worktree created at: $WORKTREE_PATH"
echo "👉 Run: cd $WORKTREE_PATH && claude"
