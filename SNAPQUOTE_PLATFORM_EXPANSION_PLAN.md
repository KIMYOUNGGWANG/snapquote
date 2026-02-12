# SnapQuote Platform Expansion: Embedded Automation Hub
**Strategy:** "The Operating System for Contractors"
**Core Tech:** Activepieces Embedding (White-labeling)

---

## 1. 아키텍처 개요 (Architecture Overview)

기존 SnapQuote 앱(Next.js) 안에 Activepieces 대시보드를 `<iframe>` 형태로 심어서, 사용자가 앱을 나가지 않고도 자동화를 설정하게 만듭니다.

### 🏛️ System Diagram
```mermaid
graph LR
    User[User (Tony)] -->|Login| SnapQuote[SnapQuote App (Next.js)]
    SnapQuote -->|Embeds via JWT| AP_Frontend[Activepieces Embedded Dashboard]
    
    subgraph "Backend Infrastructure"
        SnapQuote_BE[SnapQuote API (Supabase)]
        AP_Server[Activepieces Server (Self-Hosted)]
    end
    
    AP_Server -->|Webhook| SnapQuote_BE
    SnapQuote_BE -->|Trigger Event| AP_Server
```

---

## 2. 필수 구성 요소 (Required Components)

### 2.1 Activepieces Server (Self-Hosted)
*   **설명**: 우리만의 Activepieces 인스턴스를 별도 서버에 구축해야 합니다.
*   **추천 호스팅**: Railway, DigitalOcean Droplet, or AWS EC2.
*   **스펙**: Docker Compose 기반 실행. Postgres + Redis 필요.

### 2.2 "SnapQuote Piece" (Custom Integration)
*   **설명**: Activepieces 안에서 "SnapQuote"라는 블록을 쓸 수 있게 만드는 **전용 플러그인**입니다.
*   **Triggers (이벤트 감지)**:
    *   `New Quote Created`: 새 견적이 생성될 때 실행.
    *   `Quote Status Changed`: 견적이 [수락/거절]될 때 실행.
    *   `Payment Received`: 입금이 확인될 때 실행.
*   **Actions (동작 수행)**:
    *   `Create Customer`: 새 고객 등록.
    *   `Update Quote`: 견적서 내용 수정.
    *   `Get Quote PDF`: PDF 다운로드 링크 가져오기.

### 2.3 JWT Authentication (Single Sign-On)
*   **설명**: 사용자가 Activepieces에 따로 회원가입할 필요 없이, SnapQuote 아이디로 자동 로그인되게 합니다.
*   **구현**: Next.js에서 `jsonwebtoken` 라이브러리로 **Signing Key**를 이용해 토큰 생성 후 iframe에 전달.

---

## 3. 사용자 경험 (UX Flow)

1.  **"Automation" 탭 진입**:
    *   사용자가 SnapQuote 앱 내 "Automation" 메뉴 클릭.
2.  **템플릿 선택 (Pre-built Templates)**:
    *   빈 화면 대신, 우리가 미리 만들어둔 **"인기 자동화 5선"**이 보임.
    *   *[추천]* "수금 시 QuickBooks 자동 등록"
    *   *[추천]* "견적 발송 후 3일 뒤 자동 문자"
3.  **원클릭 활성화**:
    *   사용자는 복잡한 노드 연결을 몰라도, [Use This Template] 버튼만 누르면 자기 계정으로 복사됨.
4.  **세부 설정**:
    *   필요하다면 드래그앤드롭으로 문자 내용이나 엑셀 저장 위치를 수정.

---

## 4. 구현 로드맵 (Implementation Steps)

### Phase 1: Infrastructure Setup (인프라 구축)
1.  [ ] **Deploy Activepieces**: Docker로 클라우드 서버에 Activepieces 배포 (Enterprise/Platform 모드 활성화).
2.  [ ] **DNS Setup**: `automation.snapquote.com` 도메인 연결.

### Phase 2: Custom Piece Development (플러그인 개발)
1.  [ ] **Trigger Development**: Supabase Database Webhook을 받아 Activepieces Trigger로 변환하는 코드 작성.
2.  [ ] **Action Development**: SnapQuote API를 호출하는 Action 함수 작성.
3.  [ ] **Publish Piece**: 우리 서버에 이 커스텀 피스를 업로드.

### Phase 3: Embed & UI (연동)
1.  [ ] **JWT Gen**: Next.js API Route에서 Activepieces용 인증 토큰 생성 로직 구현.
2.  [ ] **Iframe Integration**: 프론트엔드에 Activepieces SDK 설치 및 대시보드 렌더링.
3.  [ ] **Template Gallery**: 사용자가 쓸만한 기본 템플릿 5~10개 제작.

---

## 5. 예상 비용 및 리소스
*   **서버 비용**: 월 $20~$50 (Activepieces 호스팅)
*   **개발 기간**: 숙련된 개발자 기준 약 3~4주.
    *   1주: 서버 구축 및 Hello World 임베딩.
    *   1주: 커스텀 피스 (Triggers/Actions) 개발.
    *   1주: 템플릿 제작 및 UI 폴리싱.
