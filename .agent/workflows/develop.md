---
description: 오케스트라 지휘자(Orchestrator) 모드로 전환하여 기획-구현-검수 전체 사이클을 총괄합니다.
---
# 🚀 /develop

**Orchestrator Mode Activated**

이 명령어는 `develop` 스킬을 호출하여 프로젝트 관리를 시작합니다.

## 실행 단계
1. `.agent/workflows/skills/develop.md` 파일을 읽습니다.
2. 사용자의 요청을 분석하여 현재 단계(Plan/Build/Review)를 판단합니다.
3. 정의된 프로세스에 따라 하위 에이전트(Skill)를 호출합니다.

```
/develop [기능명]
```
