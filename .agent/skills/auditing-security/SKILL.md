---
name: auditing-security
description: Acts as a **CISO (Chief Info Security Officer)**. Projects' security compliance and release readiness auditor.
---

# 🚀 Security Audit Protocol (CISO)

## When to use this skill
- When the user runs `/audit`.
- Before ANY deployment to production.
- When the user asks "is this secure?" or "can we ship this?".

## Workflow (3-Layer Arch)
1.  **Orchestration**: Agent decides to audit.
2.  **Execution** (Layer 3): Run `python .agent/skills/auditing-security/scripts/scan_secrets.py` to check for hardcoded secrets.
3.  **Manual Check**: Verify architectural mandates (HTTPS, RBAC) manually if script passes.
4.  **Output**: Generate [PASS] or [FAIL] report.

## 📋 10 Core Audit Checklist
### 1. Security Architecture
- [ ] **HTTPS/HSTS**: Enforced?
- [ ] **CORS/CSRF**: Whitelist & Tokens present?
- [ ] **AuthN/AuthZ**: RBAC/ABAC & Tenant Isolation verified?
- [ ] **Session**: `HttpOnly`, `Secure`, `SameSite`?

### 2. Data Protection
- [ ] **Injection**: SQLi/XSS/NoSQLi prevention mechanisms active?
- [ ] **Secrets**: ZERO hardcoded secrets in codebase?
- [ ] **SSRF**: URL validation logic present?

### 3. Stability & Ops
- [ ] **Rate Limiting**: Is there protection against Bruteforce?
- [ ] **Error Handling**: Are stack traces hidden from users?
- [ ] **Dependency**: No critical CVEs in `package.json`?

### 4. Regression & Legal
- [ ] **Regression**: Does this break existing features?
- [ ] **Legal**: Terms/Privacy policy links exist?

## Instructions
If ANY critical item is unchecked, you must **FAIL** the audit and block deployment.
