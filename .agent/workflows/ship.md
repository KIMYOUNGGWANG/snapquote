---
description: Finalize and merge code (Ship Phase)
---

# 🚢 Ship Workflow (Ace Edition)

Final gatekeeping before production. CISO approved.

## 1. Security & Quality Gate (`vulnerability-scanner`)
- [ ] **Scan**: Run mandatory security audit on new code.
- [ ] **QA**: Run full test suite (`test-automator`).

## 2. Documentation & Wrap-up
- [ ] **PR Generation**: Use `create-pr` to write a detailed summary.
- [ ] **Archive**: Update `conductor/tracks.md` and archive temporary plan files.

## 3. Merge
- [ ] **Execute**: Merge or Signal "Ready to Ship".
