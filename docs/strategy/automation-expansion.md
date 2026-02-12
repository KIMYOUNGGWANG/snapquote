# SnapQuote Automation Expansion: "The Invisible Office Manager"
**Version**: 1.0  
**Status**: Draft  
**Target**: Phase 2 (Post-MVP)

## 1. 개요 (Overview)
기존 SnapQuote가 **"견적서 작성의 고통"**을 해결했다면, 이번 확장은 **"견적서 발송 이후의 모든 귀찮은 행정 업무"**를 자동화하는 것을 목표로 합니다. 별도의 비서나 사무 직원을 고용할 여력이 없는 1인~소규모 기술자(Contractor)를 위해, **"잠자는 동안에도 일하는 보이지 않는 매니저"**를 제공합니다.

## 2. 핵심 가치 제안 (Value Proposition)
> "견적서만 보내면, 나머지는 앱이 알아서 합니다."

1.  **Higher Conversion**: 까먹고 놓치는 고객에게 자동으로 연락해 수주율 상승 (팔로업)
2.  **Zero Admin**: 수주 후 자재 준비, 일정 잡기, 리뷰 요청 등 반복 업무 제로화
3.  **Professionalism**: 1인 기업이지만 대기업처럼 체계적인 커뮤니케이션 제공

## 3. 주요 기능 (Key Features)

### 3.1 "Quote Chaser" (지능형 자동 팔로업)
**문제**: 기술자들은 바빠서 견적 보낸 후 "결정하셨나요?"라고 다시 묻는 것을 잊어버리거나 부끄러워함.

**솔루션**:
-   **Trigger**: 견적서 발송 후 D+3일 동안 [수락/거절] 상태 변화 없음.
-   **Action**: 고객에게 정중한 리마인드 이메일/문자 자동 발송.
    -   *예시*: "안녕하세요 [고객명], 지난번 보내드린 배관 공사 견적서 확인해보셨나요? 궁금한 점 있으시면 편하게 말씀주세요."
-   **Rule**:
    -   최대 2회 발송 (D+3, D+7).
    -   고객이 답장하거나 링크 클릭 시 중단.

### 3.2 "Material Sourcer" (원클릭 자재 발주 준비)
**문제**: 수주를 따낸 후, 견적서에 적힌 부품들을 다시 종이에 적어서 자재상(Supply House)에 문자로 보냄.

**솔루션**:
-   **Trigger**: 견적서 [Accepted] 상태 변경.
-   **Action**:
    1.  견적서 내 Items 파싱 (AI가 자재와 노무비 구분).
    2.  "자재 리스트(BOM)" 자동 생성.
    3.  사용자에게 [자재상에게 이메일 보내기] 버튼 활성화.
    4.  클릭 시: 등록된 거래처(예: Home Depot 담당자)에게 발주 이메일 초안 생성.

### 3.3 "Reputation Manager" (자동 리뷰 요청)
**문제**: 공사 잘해놓고 리뷰 달라는 말을 못 해서 구글 맵 평점이 없음.

**솔루션**:
-   **Trigger**: 프로젝트 상태 [Completed] 변경 및 [Payment Received] 확인.
-   **Action**: D+1일 후 고객에게 감사 인사와 함께 구글/Yelp 리뷰 링크 전송.
    -   *예시*: "토니 님의 작업이 마음에 드셨다면, 작은 응원의 별점을 부탁드립니다! [링크]"

### 3.4 "Onboarding Packet" (계약 착수 자동 안내)
**문제**: 계약금 입금 후 고객이 "그럼 이제 언제 오나요? 뭘 준비해야 하나요?" 계속 물어봄.

**솔루션**:
-   **Trigger**: 선금(Deposit) 입금 확인.
-   **Action**: "착수 안내문" 자동 발송.
    -   일정(Schedule) 확인 링크
    -   작업 전 준비사항 (예: "작업 공간 비워두기", "단수 안내" 등)

## 4. 기술 구현 전략 (Technical Architecture)

### 4.1 1단계: 내장형 자동화 (Supabase Edge Functions) - MVP 권장
Activepieces를 바로 도입하기보다, Supabase의 인프라를 활용해 핵심 로직을 가볍게 구현합니다.

-   **Database**:
    -   `automations` 테이블: 사용자별 활성화된 자동화 규칙 저장.
    -   `job_queue` 테이블: 발송 예정인 이메일/문자 작업 대기열.
-   **Scheduling**:
    -   `pg_cron`: 매시간 `job_queue`를 확인하여 발송 시점이 된 작업 실행.
-   **Execution**:
    -   Supabase Edge Function이 로직 수행 (이메일: Resend, 문자: Twilio).

### 4.2 2단계: 확장형 자동화 (Activepieces Integration) - Scale-up
사용자가 자신만의 복잡한 워크플로우를 원할 때 도입 (Enterprise Plan).

-   **Embedded iPaaS**: 앱 내에 Activepieces의 "Flow Builder"를 임베딩(White-label).
-   **Custom Pieces**:
    -   Triggers: New Quote Created, Payment Received, Job Completed.
    -   Actions: Update Quote Status, Add Note, Get Material List.

## 5. UI/UX 디자인

### 5.1 "Auto-Pilot" 탭 신설
-   **대시보드**: 현재 활성화된 자동화 봇 상태 표시 (ON/OFF 토글).
    -   🟢 Quote Chaser (켜짐) - "이번 주 5건 자동 팔로업 함"
    -   🔴 Review Request (꺼짐)
-   **설정 모달**:
    -   팔로업 간격 설정 (3일/7일)
    -   메시지 템플릿 수정 (AI가 톤앤매너 교정 지원)

## 6. 수익화 모델 (Monetization)
-   **Pro Plan 전용 기능**: 모든 자동화 기능은 월 $19 구독자(Pro) 이상에게만 제공.
-   **가치 설득**: "비서 한 명 월급이 $3,000인데, SnapQuote 봇은 월 $19입니다."

## 7. 로드맵 (Roadmap)
-   **Phase 2.1 (Quote Chaser)**: 가장 효과가 좋은 팔로업 기능부터 구현 (이메일만).
-   **Phase 2.2 (Review Bot)**: 리뷰 요청 기능 추가.
-   **Phase 2.3 (SMS 연동)**: Twilio 연동하여 문자 메시지 지원 (비용 발생으로 인한 별도 크레딧 정책 고려).
