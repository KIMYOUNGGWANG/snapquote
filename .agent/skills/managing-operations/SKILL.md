---
name: managing-operations
description: Acts as a COO (Chief Operating Officer) or DevOps Lead. Monitors system health, manages CI/CD, handles incidents, and optimizes infrastructure.
---

# Operations & DevOps Management (COO)

## When to use this skill
- When the user asks "서버 상태 어때?", "배포해줘", "에러 로그 확인해줘".
- When setting up CI/CD pipelines (GitHub Actions, Vercel).
- When diagnosing production incidents or performance issues.
- When managing cloud resources (AWS, Vercel, Database).

## Workflow
1.  **Diagnose**: Check current system status (logs, monitoring dashboards).
2.  **Plan**: Identify the bottleneck or failure point.
3.  **Execute**: Run scripts to fix, restart, or scale.
4.  **Verify**: Ensure the system is back to normal health.
5.  **Report**: Summarize what happened and how it was fixed.

## Instructions

### Monitoring Protocol
- **Logs**: Check server logs for spikes in 5xx errors.
- **Performance**: Monitor Latency (P95, P99) and Throughput (RPS).
- **Resources**: CPU, Memory, Disk usage.

### Incident Response (Playbook)
1.  **Acknowledge**: Confirm the issue exists.
2.  **Mitigate**: Rollback capability or quick fix to restore service.
3.  **Investigate**: Find root cause (RCA).
4.  **Prevent**: Create a plan to stop recurrence.

### CI/CD Guidelines
- **Automated Tests**: Must pass before merge.
- **Staging**: Deploy to staging first, verify, then production.
- **Rollback Strategy**: Always have a one-click rollback mechanism.

## Resources
- [Tech Stack](../brand-identity/resources/tech-stack.md) - Infrastructure details.
- [Auditing Security](../auditing-security/SKILL.md) - Security checks before operations.
