---
name: planning
description: Generates comprehensive implementation plans for complex tasks. Use when the user requests a plan or when starting a significant feature or refactor.
---

# Planning

## When to use this skill
- When the user asks to "make a plan" or "design this feature".
- Before writing code for any multi-step, complex task.
- To document the proposed approach for user approval.

## Workflow
1.  **Context Gathering**: Analyze the request and existing codebase.
2.  **Drafting**: Create a detailed plan file (e.g., `implementation_plan.md`).
3.  **Review**: Present the plan to the user for feedback.
4.  **Refinement**: Iterate on the plan until approved.

## Instructions
### Plan Philosophy
Write comprehensive implementation plans assuming the engineer has zero context for the codebase. Document everything they need to know: which files to touch, specific code changes, tests to run, and how to verify.

### Plan Structure
Create a markdown file (usually `implementation_plan.md` or `docs/plans/YYYY-MM-DD-feature.md`) with the following sections:

1.  **Goal Description**: Brief description of the problem and value.
2.  **User Review Required**: Critical items (breaking changes, design choices) needing approval.
3.  **Proposed Changes**: Grouped by component.
    - Use `[NEW]`, `[MODIFY]`, `[DELETE]` tags for files.
    - specific file paths (absolute or relative to root).
4.  **Verification Plan**:
    - **Automated Tests**: specific commands to run.
    - **Manual Verification**: Step-by-step instructions for human review.

### Task Granularity
Break down the work into bite-sized tasks. Each task should be:
- **Atomic**: Focus on one thing.
- **Verifiable**: Have a clear success condition (test pass).
- **Safe**: Minimizes risk of breaking existing functionality.

### Example Header
```markdown
# [Feature Name] Implementation Plan

## Goal Description
[Summary]

## User Review Required
[Critical alerts]

## Proposed Changes
### [Component]
- [MODIFY] path/to/file.ts
```
