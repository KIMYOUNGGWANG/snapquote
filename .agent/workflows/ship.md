---
description: 마스터 모드 - 기획부터 배포 감사까지 모든 단계를 원스톱으로 실행합니다.
---

# 🚢 /ship - 올인원 배포 파이프라인

## 🎯 목적
하나의 명령어로 **기획(Plan) → 설계(Architect) → 개발(Develop) → 테스트(Test) → 감사(Audit)**의 전 과정을 순차적으로 실행합니다.

## // turbo-all
이 워크플로우는 모든 단계를 자동으로 진행합니다.

## 📝 실행 파이프라인
1.  **Step 0: Branch Setup**
    - `git checkout -b feature/[name]` (Main 브랜치 작업 금지)
2.  **Step 1: Planning (`/plan`)**
    - 요구사항을 분석하여 PRD 및 영향도 분석 보고서를 작성합니다.
2.  **Step 2: Architecting (`/architect`)**
    - PRD를 기반으로 DB 스키마와 API 명세를 확정합니다.
3.  **Step 3: Development (`/develop`)**
    - 설계된 명세대로 코드를 구현합니다 (보안 수칙 준수).
4.  **Step 4: Testing (`/test`)**
    - 구현된 코드를 테스트하고 버그를 잡습니다.
5.  **Step 5: Audit (`/audit`)**
    - 배포 전 최종 보안 감사를 수행하고 PASS 여부를 판정합니다.

## 🚀 사용 예시
```text
/ship [뉴스레터 구독 기능]을 만들어줘.
```
(이 한 마디면 기획서 작성부터 최종 감사 리포트까지 끝냅니다.)
