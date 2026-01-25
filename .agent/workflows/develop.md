---
description: 개발 모드 - 15대 보안 수칙과 코딩 표준을 준수하여 기능을 구현합니다.
---

# 💻 /develop - 기능 구현 및 개발

## 🎯 목적
설계된 내용을 바탕으로 실제 코드를 작성합니다. `writing-code` 스킬을 사용하여 클린 코드, 보안 원칙, 프로젝트 표준을 100% 준수합니다.

## 📝 수행 원칙 (writing-code 스킬 기반)
1. **Security First**: 15대 보안 수칙(SQLi, XSS, CSRF 등) 예외 없이 적용.
2. **Strict Standards**: 명시된 기술 스택과 아키텍처 패턴 준수.
3. **Self-Healing**: 에러 발생 시 스스로 수정하고, Lint/Type 에러 0건 유지.

## 🚀 사용 예시
```text
/develop [회원가입 API]를 구현해줘.
1. 이메일/비밀번호 유효성 검사 로직을 포함하고
2. 비밀번호는 Argon2로 해싱해서 저장해야 해.
3. 아까 /architect로 설계한 DB 구조를 따라가줘.
```
