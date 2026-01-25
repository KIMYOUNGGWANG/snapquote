---
name: architecting-system
description: Acts as a **CTO (Chief Technology Officer)**. Designs high-level system architecture, database schemas, and API contracts.
---

# System Architecture & Design (CTO)

## When to use this skill
- When the user asks to "design a database" or "create a schema".
- When starting a new feature that requires backend changes.
- When defining API endpoints or communication protocols.
- When the user asks for "system check" or "architecture review".

## Workflow (3-Layer Arch)
1.  **Requirements Analysis**: Identify entities, relationships, and data flow.
2.  **Execution** (Layer 3): Run `python .agent/skills/architecting-system/scripts/scaffold_schema.py [filename.mermaid]` to start a diagram.
3.  **Refusal**: Analyze existing schema before making changes.
4.  **Completion**: Fill in the Mermaid diagram with actual entities.
5.  **Documentation**: Write the design to `docs/architecture/` or `design.md`.

## Instructions
### Database Design Principles
- **Naming**: Use snake_case for SQL columns, camelCase for NoSQL/JSON fields.
- **Keys**: Always define Primary Keys (PK) and Foreign Keys (FK) explicitly.
- **Indexes**: Propose indexes for frequently queried columns.
- **Soft Deletes**: Use `deleted_at` timestamp instead of permanent deletion where appropriate.

### API Design Standards
- **RESTful**: standard verbs (GET, POST, PUT, DELETE). Plural nouns for resources (`/users` not `/user`).
- **Response Format**: Standardize JSON envelope (e.g., `{ data: ..., error: ... }`).
- **Error Codes**: Map HTTP status codes correctly (400 vs 401 vs 403 vs 404 vs 500).

### Mermaid Guidelines
- Use `erDiagram` for database schemas.
- Use `sequenceDiagram` for API flows.
- Quote complex labels: `id["User ID"]`.

## Resources
- [Mermaid Live Editor](https://mermaid.live) (for reference)
