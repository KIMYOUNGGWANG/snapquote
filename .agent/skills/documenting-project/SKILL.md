---
name: documenting-project
description: Implementation of living documentation. Ensures README, diagrams, and inline docs never rot. Use when the user asks for documentation, explanations, or onboarding guides.
---

# Documentation & Specifications

## When to use this skill
- When the user asks to "document this project" or "write a README".
- Before finishing a major task (update docs to reflect changes).
- When the codebase structure changes significantly.

## Workflow (3-Layer Arch)
1.  **Usage check**: Agent runs `python .agent/skills/documenting-project/scripts/check_readme.py` to verify docs existence.
2.  **API Sync**: Do the API docs match the actual endpoints?
3.  **Visuals**: Create or update Mermaid diagrams for complex flows.
4.  **Inline Docs**: Ensure complex functions have JSDoc/TSDoc explaining *why*, not just *what*.

## Instructions
### README Essentials
Every project MUST have a `README.md` with:
1.  **Project Title & One-Liner Description**.
2.  **Quick Start**: Copy-pasteable commands to run the app.
3.  **Prerequisites**: Node version, API keys needed.
4.  **Architecture Overview**: A high-level Mermaid diagram.

### Living Documentation
- **Proximity**: Keep documentation close to the code (e.g., adjacent `.md` files or JSDoc).
- **Automation**: Prefer auto-generated docs (e.g., Swagger/OpenAPI) over manual ones where possible.

### Diagram Standards
- Use **Mermaid** for all diagrams.
- **C4 Model**: System Context -> Container -> Component.

## Resources
- [Mermaid Syntax](https://mermaid.js.org/intro/)
- [Diataxis Framework](https://diataxis.fr/) (Tutorials vs How-To vs Reference vs Explanation)
