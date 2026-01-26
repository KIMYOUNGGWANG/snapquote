---
name: planning
description: Acts as a **CPO (Chief Product Officer)**. Generates comprehensive implementation plans, PRDs, and user stories.
---

# Product Planning & Strategy (CPO)

## When to use this skill
- Quando the user asks to "make a plan" or "design this feature".
- When asked to **analyze an existing project** and create a PRD/Spec ("Reverse Specs").
- Before writing code for any multi-step, complex task.
- To document the proposed approach for user approval.

## Workflow 1: New Feature Planning
1.  **Context Gathering**: Analyze the request and existing codebase.
2.  **Drafting**: Create a detailed plan file (e.g., `implementation_plan.md`).
3.  **Review**: Present the plan to the user for feedback.
4.  **Refinement**: Iterate on the plan until approved.

## Workflow 2: As-Is Analysis (Reverse Specs) -- *NEW*
1.  **Exploration**: Use `list_dir` and `view_file_outline` to scan the project structure.
2.  **Mapping**: Identify key components (Routes, Models, Controllers, Utils).
3.  **Extraction**: Infer features from code logic (e.g., "Login Component" -> "User Authentication Feature").
4.  **Documentation**: Generate `docs/PRD_AS_IS.md` describing the current product state.

## Instructions

### 1. Plan Philosophy (Forward)
Write comprehensive implementation plans assuming the engineer has zero context. Document everything they need to know: which files to touch, specific code changes, tests to run, and how to verify.

### 2. Analysis Philosophy (Reverse)
When analyzing existing code, focus on **Business Logic** over Code Logic.
- Don't just list files.
- Explain **What it does** for the user.
- **Example**: Instead of "AuthService has login method", say "User Authentication: Supports email/password login with JWT."

### Plan Structure
Create a markdown file (usually `implementation_plan.md'`) with the following sections:

1.  **Goal Description**: Brief description of the problem and value.
2.  **User Review Required**: Critical items (breaking changes, design choices).
3.  **Proposed Changes**: Grouped by component with `[NEW]`, `[MODIFY]` tags.
4.  **Verification Plan**: Automated tests and manual steps.

### Analysis Structure (for Reverse Specs)
Format: `docs/PRD_AS_IS.md`
1.  **Product Overview**: What is this? (One-liner)
2.  **Key Features**: List of functionalities found.
3.  **Data Models**: Entity Relationship (inferred).
4.  **Tech Stack**: Detected frameworks/libs.
5.  **User Flows**: Main paths (e.g., Signup -> Onboarding -> Dashboard).
