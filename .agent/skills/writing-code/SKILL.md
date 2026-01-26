---
name: writing-code
description: Acts as a **Lead Engineer**. Writes code with strict adherence to project standards, file structure, and best practices.
---

# Code Implementation & Standards (Lead Engineer)

## When to use this skill
- When the user asks to "implement feature X" or "write a function".
- When creating new files or components.
- When refactoring existing code.

## Workflow (3-Layer Arch)
1.  **Orchestration**: Agent receives request to create a file.
2.  **Execution** (Layer 3): Run `python .agent/skills/writing-code/scripts/scaffold.py [type] [Name]`.
    - This ensures consistent boilerplate and file naming.
3.  **Implementation**: Agent fills in the logic manually after scaffolding.
4.  **Self-Correction**: Check for linter errors.

## Instructions
### General Principles
- **DRY (Don't Repeat Yourself)**: Extract common logic into utils or hooks.
- **SOLID**: Single Responsibility Principle is key. Small functions, small files.
- **Composition over Inheritance**: Prefer functional composition, especially in React.

### File Structure & Naming
- **Components**: PascalCase (e.g., `Button.tsx`, `UserProfile.tsx`).
- **Utilities/Hooks**: camelCase (e.g., `useAuth.ts`, `formatDate.ts`).
- **Barrel Files**: Use `index.ts` only for public API exports from a module.

### Error Handling
- **No Empty Catches**: Always log or handle errors. `catch (e) {}` is forbidden.
- **Typed Errors**: Use custom error classes or typed error responses where possible.

### Comments
- **Why, not What**: Comment *why* a complex logic exists, not *what* the code does.
### JSDoc
- Use JSDoc for public functions and complex types.

## 🛡️ Security Mandates (15 Critical Rules)
You MUST implement these security measures. If not applicable, explicitly explain why.

1.  **Network**: CORS (Preflight strict), HTTPS/HSTS forced, SSRF protection.
2.  **Web Vulnerabilities**: 
    - CSRF: Token/SameSite cookie required.
    - XSS: Input sanitization + CSP.
    - SQLi: Use ORM or Prepared Statements ONLY.
3.  **AuthN/AuthZ**:
    - RBAC/ABAC based permission control.
    - **Tenant Isolation**: Strict data segregation between tenants.
    - **Session**: `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
4.  **Server Protection**:
    - **Rate Limit**: API throttling to prevent Bruteforce/DDoS.
    - **Least Privilege**: Minimal DB/API key permissions.
    - **Validation**: Strict Zod/Joi validation for all inputs.
5.  **Data & Ops**:
    - **Secrets**: No hardcoded secrets. Use env vars + rotation.
    - **Audit Log**: Force log critical actions (access/modify).
    - **Error Handling**: No stack traces to user. Return generic errors.
    - **Dependency**: Check CVEs for dependencies.
6.  **Git Safety**:
    - **NEVER** commit directly to `main` or `master`.
    - Always create a feature branch: `git checkout -b feature/[name]` or `fix/[name]`.

## Resources
- [Tech Stack Guide](../brand-identity/resources/tech-stack.md) (Always check this for allowable libraries)
