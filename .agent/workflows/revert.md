---
description: Undo recent changes and restore the codebase to the last commit.
---

# ↩️ Revert & Restore Workflow

## Role
- **Goal**: Wipes uncommitted changes to fix a broken state.
- **Participants**: Engineer (writing-code).

## Steps

1.  **Safety Check**
    - **Verify**: Are there any uncommitted files that *should* be saved?
    - **Ask**: "This will DELETE all uncommitted work. Proceed?"

2.  **Execution (Engineer)**
    - Run: `git reset --hard HEAD` (Restores modified files)
    - Run: `git clean -fd` (Removes untracked files/folders)

3.  **Verification**
    - Run: `git status` (Should be clean)
    - Check: Does the app compile/run now?

> **Warning**: This action is destructive and cannot be undone.
