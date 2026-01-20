# SnapQuote: "Capture-First" Strategy Summary
> **Pivot Date**: 2026-01-18  
> **Decision**: Approved via Brainstorming Session

## 핵심 전략 요약

### 기존 문제점
"현장에서 30초 만에 견적서 완성" 컨셉은 **현실적 한계**가 있음:
- 고객 앞에서 스마트폰 만지작거리기 부담
- 자재 가격 불확실 → 확정 문서 만들기 두려움

### 새로운 컨셉: "The Lazy Capture"
> "현장은 기록하고, 사무실은 완성한다."

| Phase | 위치 | 사용자 행동 | 소요 시간 |
|-------|------|------------|----------|
| 1. Capture | 현장 | 음성+사진 던져놓기 | 10초 |
| 2. Process | 백그라운드 | AI가 초안 생성 | 자동 |
| 3. Review | 집/사무실 | 가격만 수정 후 전송 | 1분 |

### 핵심 차별화
1. **"Dump Bucket" UX**: 정리 안 해도 됨. AI가 알아서.
2. **🟡 Price TBD**: 가격 모르면 일단 0으로. 나중에 수정.
3. **Drafts 관리**: 바로 전송 강제 아님. 초안으로 대기.

## MVP 구현 우선순위

| P# | Feature | 상태 |
|----|---------|------|
| P0 | 음성 녹음 + AI 변환 | ✅ 완료 |
| P1 | `status: 'draft'` 로직 | 🟡 신규 |
| P1 | Drafts List UI | 🟡 신규 |
| P1 | Price TBD 하이라이트 | 🟡 신규 |
| P2 | Push Notification | ⬜ 추후 |

## 다음 단계
1. DB 스키마에 `status` 컬럼 추가
2. Drafts List 페이지 구현
3. Home 화면 단순화 (녹음 버튼 중심)
