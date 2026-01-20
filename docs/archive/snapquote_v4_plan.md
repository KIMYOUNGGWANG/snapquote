# 🚀 SnapQuote v4.0: The "Zero Admin" Strategy
## 완전판 실행 계획서 (Enhanced Edition)

---

## A. 제품 정체성 (Identity)

### 브랜드 메시지
**"퇴근길이 가벼운 현장 행정 도구"**

### 기능적 정의
오프라인 우선(Offline-First) 음성 기반 견적 생성기

### 정서적 정의
기술자에게 '저녁 시간'과 '가족과의 주말'을 돌려주는 도구

### 마케팅 태그라인
- 메인: **"Don't take your work home."**
- 서브: **"Your wife called. Dinner's getting cold."**

---

## B. 해결하는 진짜 문제 (The Real Pain)

### 1. 그림자 노동 (Shadow Work)
현장에서 일하고 집에 와서 또 1~2시간씩 엑셀과 씨름하는 '무임금 노동'

### 2. 기억의 휘발
현장에서 메모하지 않고 집에 오면 디테일을 까먹어서 부정확한 견적 작성 (손해 발생)

### 3. 신뢰도 하락
엑셀이나 문자로 대충 보낸 견적은 고객에게 "아마추어"로 보임 (특히 이민자 기술자의 경우 영어 문제)

### 4. 선금 회수 어려움
"입금 확인 후 작업 시작합니다"라고 말하기 어렵고, 말해도 고객이 입금을 미룸

---

## C. 타겟 고객 (Re-Targeting)

### Primary: 소규모 시공업체 오너 (2-10인 팀)

**특징**
- 본인도 현장을 뛰지만, 직원들의 견적/행정 처리 때문에 스트레스
- 직원들이 엉망으로 써오는 견적서를 뜯어고치는 시간 발생

**니즈**
- 직원들의 견적서 표준화
- 현장에서 바로 완성도 높은 견적 생성

**지불 능력**
- 월 $29~$49 정도는 "시간 절약"으로 충분히 지불 가능
- 직원 1명당 주 2시간 절약 = 월 $200 이상 인건비 절감

### Secondary: 이민자/비영어권 1인 기술자

**특징**
- 기술은 좋은데 문서 작업(영어) 때문에 제값을 못 받음
- "Broken English" 때문에 대형 프로젝트 수주 실패 경험

**니즈**
- 내 서툰 영어를 "Professional Contract"로 자동 변환
- 고객에게 신뢰감 주는 문서 양식

**지불 능력**
- 견적 1건당 $1.99는 커피값, 고민 없이 결제 가능
- 월 $19는 "영어 과외"보다 100배 저렴

---

## D. 핵심 가치 제안 (USP)

### 1. 현장 완결성
**"The Parking Lot Rule"** - 트럭 시동 걸기 전에 견적 전송 완료

### 2. 엑셀 대체
엑셀보다 빠르지만, 결과물은 엑셀보다 10배 전문적

### 3. 오프라인 불사신
지하실, 신축 현장, 산속 별장 어디서든 멈추지 않음

### 4. 돈 받게 해주는 앱
견적서에 결제 버튼 포함 → 고객이 클릭 → 착수금 자동 입금

---

## E. 제품 기능 명세 (v4.0 Feature Spec)

### 1. Core Features (MVP 필수)

#### Smart Voice Record
- 음성 입력: "싱크대 교체, 부품 $100, 공임 $150"
- Whisper API 음성 인식
- 오프라인 로컬 저장 (IndexedDB via Dexie.js)
- **백그라운드 동기화 큐** (인터넷 복구 시 자동 업로드)

#### Mistake Proofing (2단계 확인)
- 1차: 음성 → 텍스트 변환 결과 표시
- 2차: 사용자가 텍스트 에디터에서 수정 가능
- **"다시 녹음" 버튼을 수정 버튼보다 2배 크게** (실수 인정이 더 쉽게)

#### Custom Vocabulary (전문 용어 학습)
- 자주 쓰는 단어 개인 사전
- 예: "PEX pipe" → "펙스 파이프"로 오인식 방지
- 업종별 프리셋 제공 (Plumbing, HVAC, Electrical 등)

#### Magic Formatter (AI 문장 변환)
- 입력: "싱크대 교체"
- 출력: "Kitchen Sink Installation & Sealing with Warranty"
- GPT-4o-mini 사용 (비용 효율)

#### Professional PDF Generation
- 회사 로고 삽입
- 법적 고지(Disclaimer) 자동 포함
- 주별(State-specific) 필수 문구 템플릿 제공
- 총계, 세금 계산 자동화
- Trust Badges: 라이선스 번호, 보험 가입 여부 뱃지

### 2. Killer Features (유료화 핵심)

#### Deposit Request (선금 결제 링크)
- Stripe 결제 링크를 PDF에 삽입
- "Deposit 50% ($XXX)" 버튼 클릭 → 즉시 결제
- 결제 완료 시 앱 & 이메일 알림

#### Sync Status Indicator
- 업로드 진행 상황 실시간 표시
- "로컬 저장됨 → 업로드 중 → 동기화 완료" 3단계 시각화
- 충돌 방지: 큐 시스템으로 순차 처리

#### State-Specific Legal Templates
- 주별 계약서 필수 문구 자동 삽입
- 예: California - 3-day cancellation notice
- "법률 검토 권장" 안내 문구 포함

---

## F. UX 플로우 (The "Parking Lot" Flow)

### 목표
기술자가 고객 집 주차장을 떠나기 전에 모든 과정이 끝나야 함

### 플로우
```
[1. 앱 실행]
   ↓ (오프라인 상태여도 0.3초 로딩)
   
[2. 녹음 시작]
   ↓ (현장 상황, 가격, 특이사항 음성 입력)
   ↓ (장갑 낀 손가락도 인식되는 큰 버튼)
   
[3. 1차 저장]
   ↓ (IndexedDB에 즉시 저장)
   ↓ ("저장 완료" 햅틱 피드백)
   
[4. 텍스트 확인]
   ↓ (음성 → 텍스트 변환 결과 표시)
   ↓ (잘못된 부분 수정 또는 "다시 녹음")
   
[5. 동기화 & AI 변환]
   ↓ (트럭 이동 중 LTE 잡히면 백그라운드 처리)
   ↓ (GPT-4o-mini가 전문 문장으로 변환)
   
[6. 최종 검토]
   ↓ (신호 대기 or 점심시간에 변환된 PDF 미리보기)
   ↓ (고객 이메일 입력)
   
[7. 전송 완료]
   ✅ "Quote sent! ☕️ 커피 한 잔 하세요."
```

---

## G. 기술 스택 (Tech Stack)

### Frontend
- **Next.js 14** (App Router)
- **Tailwind CSS** + **Shadcn UI**
- **PWA** (Progressive Web App) - 설치 가능
- 모바일 최적화 필수 (장갑 끼고 조작 가능한 UI)

### Local Storage & Offline
- **Dexie.js** (IndexedDB 래퍼)
- **Service Worker** (오프라인 캐싱)
- **Sync Queue System** (충돌 방지)

### Backend
- **Supabase**
  - Authentication
  - PostgreSQL Database
  - Real-time subscriptions (동기화 상태)

### AI & Voice
- **OpenAI Whisper API** (Speech-to-Text)
- **GPT-4o-mini** (Text Formatting)
- Custom Vocabulary 저장소 (사용자별)

### PDF Generation
- **React-pdf** 또는 **Puppeteer** (서버 사이드)
- 템플릿 시스템 (주별 legal templates)

### Payment
- **Stripe Payment Links**
- Webhook으로 결제 완료 알림

### Monitoring
- **Sentry** (에러 추적)
- **PostHog** (사용자 행동 분석)

---

## H. 수익 모델 (Pricing Strategy)

### 경쟁 상대 재정의
❌ ServiceTitan ($399/월)  
✅ Netflix ($15/월) + 점심값

### 가격 체계

#### Starter (Free)
- 월 3건 무료
- 워터마크 포함 ("Created with SnapQuote")
- 기본 PDF 템플릿
- 커뮤니티 지원

#### Pay-As-You-Go
- **$1.99 / 견적서 1건**
- 워터마크 없음
- 모든 AI 기능 사용
- "구독 싫어하는" 기술자 타겟
- 카페 라떼 1잔 값 전략

#### Pro ($19/월)
- ✅ 무제한 견적 생성
- ✅ Deposit Request (선금 결제 링크)
- ✅ 회사 로고 커스텀
- ✅ Custom Vocabulary (무제한)
- ✅ 우선 고객 지원
- ✅ 주별 Legal Templates

#### Team ($49/월)
- Pro 기능 전체
- 팀원 5명까지
- 견적서 중앙 관리 대시보드
- 템플릿 공유
- 관리자 승인 워크플로우

---

## I. 마케팅 & GTM (Go-To-Market)

### 포지셔닝
**"사무실 효율화 도구"가 아닌 "가족 시간 지킴이"**

### 1. 메시지 (Copywriting)

#### 핵심 메시지
- **Primary**: "Don't take your work home."
- **Emotional**: "Your wife called. Dinner's getting cold."
- **Practical**: "지하실에서 말하고, 차 타기 전에 보내세요."

#### 금지 메시지
- ❌ "최첨단 AI 음성 견적 앱입니다" (기술 중심)
- ❌ "생산성을 200% 향상시킵니다" (추상적)

#### 권장 메시지
- ✅ "견적 작성 시간을 주당 10시간 줄이세요. 엑셀은 이제 그만."
- ✅ "말로 하면 프로 계약서가 됩니다."
- ✅ "주말에 엑셀 켜지 마세요."

### 2. 채널 전략

#### Online Channels

**Facebook Groups**
- 타겟: "Small Business Owners", "[도시명] Contractors"
- 콘텐츠: "엑셀 지옥에서 탈출한 썰" (스토리텔링)
- 금지: "엑셀 템플릿 공유" (경쟁자 양산)

**Reddit**
- r/smallbusiness, r/Plumbing, r/HVAC
- "Ask Me Anything" 형식
- 제목: "I built a tool to stop doing quotes at home. AMA"

**YouTube Shorts / TikTok**
- 15초 데모 영상: 현장 → 녹음 → 전송 → 퇴근
- 해시태그: #contractorlife #smallbusiness #worklifebalance

**SEO Content**
- 타겟 키워드: "plumbing estimate template excel"
- 랜딩 페이지: "엑셀보다 쉬운 방법" 제시
- Lead Magnet: "Shadow Work Calculator" (무임금 노동 시간 계산기)

#### Offline Channels

**Supply House (자재상) 전단지**
- 지역 배관/전기 자재상 협력
- 전단지 메시지: **"작업 끝나고 집에 빨리 가는 법"**
- QR 코드 → 30초 데모 영상

**Trade Shows**
- 부스 메시지: "Stop working after work"
- 라이브 데모: 관람객이 직접 음성 입력 체험
- 사은품: "No Admin Fridays" 스티커

### 3. 바이럴 콘텐츠 전략

#### Shadow Work Calculator
- 인터랙티브 계산기
- 질문: "일주일에 집에서 견적 작성하는 시간?"
- 결과: "1년에 XXX시간 = $X,XXX의 무임금 노동"
- CTA: "이메일 입력하고 계산 결과 받기" (리드 수집)

#### Before/After 비교 영상
- Before: 집에서 노트북 펴고 엑셀과 씨름 (30분)
- After: 차 안에서 2분 만에 완료
- 감성 자극: 아이가 "아빠 언제 와?" 문자 보내는 장면

---

## J. 베타 테스트 전략 (Enhanced)

### 목표
- 실사용 데이터 확보
- 음성 인식 정확도 검증
- UX 병목 지점 발견

### 베타 테스터 모집

#### 모집 방법
- Facebook Groups: "무료로 6개월 Pro 쓸 사장님 5명"
- 조건: 주 3건 이상 견적 작성, 피드백 제공

#### 인센티브 (강화)
- ✅ 평생 50% 할인
- ✅ 첫 100명 무료 Pro 6개월
- ✅ "Founding Member" 뱃지 (PDF 하단 표시)
- ✅ 제품 로드맵 투표권

### 테스트 시나리오

#### 1. 주차장 테스트
- 본인이 직접 지하실/공사 현장 방문
- 녹음 → 주차장 도착 → 전송
- 걸린 시간 측정 (목표: 5분 이내)

#### 2. 음성 인식 지옥 테스트 (신규)
- 시끄러운 환경 20회 테스트
  - 드릴 소리, 물 흐르는 소리, 바람 소리
- 다양한 억양 테스트
  - 한국식 영어, 멕시코식 영어, 인도식 영어
- 전문 용어 정확도 측정
  - "PEX pipe", "GFCI outlet", "R-value insulation"

#### 3. 오프라인 동기화 스트레스 테스트
- 시나리오 A: 현장 3곳 연속 방문 (모두 인터넷 없음) → 4번째 현장에서 LTE 복구
- 시나리오 B: 녹음 중 앱 강제 종료 → 재시작 → 데이터 복구 확인

### 피드백 수집 방법
- 앱 내 "피드백" 버튼 (음성 녹음 가능)
- 주간 설문: "이번 주 가장 답답했던 순간?"
- 1:1 인터뷰 (30분, $50 기프트카드 제공)

---

## K. 주간 실행 로드맵 (Action Plan)

### Week 0: Pre-Launch (사전 준비)
- [ ] Shadow Work Calculator 제작 및 배포
  - 랜딩 페이지 제작 (Framer or Webflow)
  - Facebook Groups 5곳에 공유
  - 목표: 이메일 50개 수집
- [ ] 베타 테스터 모집 공고
  - "Founding Member" 혜택 명시
  - 신청 폼 준비 (Google Forms)

### Week 1: Core Tech (현장성 확보)
- [ ] Next.js + PWA 세팅
  - App Router 구조 설계
  - Service Worker 설정
  - 설치 프롬프트 UI
- [ ] Dexie.js 연동
  - IndexedDB 스키마 설계
  - 오프라인 CRUD 테스트
  - 인터넷 끄고 데이터 저장/불러오기 검증
- [ ] 녹음 UI 구현
  - 버튼 크기: 최소 80x80px (장갑 고려)
  - 햅틱 피드백 추가
  - 녹음 중 시각적 표시 (파동 애니메이션)
- [ ] Sync Queue System 구현
  - 업로드 대기열 로직
  - 재시도 메커니즘 (최대 3회)
  - 상태 표시: 로컬 저장 / 업로드 중 / 완료

### Week 1.5: Voice Recognition Hell Test (신규)
- [ ] Whisper API 정확도 테스트
  - 조용한 환경: 50회 테스트
  - 시끄러운 환경: 20회 테스트
  - 억양별 테스트: 각 10회
- [ ] 오인식률 측정
  - 목표: 전체 정확도 90% 이상
  - 실패 시 대안: Custom Vocabulary 강화
- [ ] 전문 용어 사전 구축
  - 업종별 상위 100개 단어 리스트
  - Whisper Prompt Engineering

### Week 2: AI & Logic (전문성 확보)
- [ ] GPT-4o-mini 연동
  - 시스템 프롬프트 작성
  - "개떡같이 말해도 찰떡같이" 변환 테스트
  - 토큰 비용 최적화 (1건당 $0.01 이하 목표)
- [ ] Custom Vocabulary UI
  - 사용자 단어 추가/편집 기능
  - 업종별 프리셋 (Plumbing, HVAC, Electrical)
- [ ] PDF 템플릿 디자인
  - 3가지 스타일 (Classic, Modern, Minimal)
  - Trust Badges 위치 선정
  - 주별 Legal Templates 5개 주 우선 구현 (California, Texas, Florida, New York, Illinois)
- [ ] Stripe 결제 링크 생성 로직
  - Payment Link API 연동
  - PDF에 버튼 삽입 위치 결정
  - Webhook 설정 (결제 완료 알림)

### Week 3: Field Test (검증)
- [ ] 베타 테스터 5명 온보딩
  - 1:1 온보딩 세션 (30분)
  - 사용 가이드 영상 제공
  - 긴급 지원 핫라인 (텔레그램 그룹)
- [ ] 주차장 테스트 (본인)
  - 5개 시나리오 직접 수행
  - 각 단계별 소요 시간 기록
  - 병목 지점 발견 및 수정
- [ ] 오프라인 동기화 스트레스 테스트
  - 시나리오 A, B 실행
  - 데이터 손실 여부 확인
  - 에러 로그 수집 (Sentry)
- [ ] 음성 인식 현장 테스트
  - 베타 테스터들의 실제 녹음 데이터 분석
  - 오인식 패턴 파악
  - Custom Vocabulary 업데이트
- [ ] 버그 수정 및 UX 개선
  - 피드백 기반 우선순위 정리
  - Critical 버그 즉시 수정
  - UI/UX 개선 사항 반영

### Week 4: Launch & Sales (출시)
- [ ] 랜딩 페이지 최종 오픈
  - 메시지: "Stop doing admin at home"
  - 서브 카피: "Your wife called. Dinner's getting cold."
  - 30초 데모 영상 삽입
  - ROI Calculator 임베드
- [ ] Product Hunt 런칭
  - 제목: "SnapQuote - Turn voice into professional quotes in your truck"
  - 첫 댓글에 "Shadow Work Calculator" 링크
- [ ] 커뮤니티 홍보
  - Facebook Groups 10곳
  - Reddit 5개 서브레딧
  - 베타 테스터들의 후기 영상 공유
- [ ] 오프라인 채널 시작
  - 지역 자재상 3곳 방문
  - 전단지 100장 배포
  - QR 코드 스캔율 추적
- [ ] 이메일 캠페인
  - Week 0 수집한 리스트에 런칭 공지
  - 제목: "Your dinner is waiting. Stop doing quotes at home."
  - 특별 할인: 첫 달 50% (선착순 50명)

---

## L. 법적 리스크 대응 (Legal Safeguards)

### 1. 건설업 라이선스 이슈
**문제**: 라이선스 없는 사람도 앱 사용 가능?

**해결책**
- Terms of Service에 명시: "사용자는 해당 지역 법률 준수 책임"
- PDF 하단에 작은 글씨: "Valid license required in your jurisdiction"
- 회원가입 시 체크박스: "I confirm I have proper licensing"

### 2. 계약서 양식 법적 요구사항
**문제**: 주별로 필수 포함 문구가 다름

**해결책**
- State-Specific Templates 제공 (우선 5개 주)
- 각 템플릿에 "Legal review recommended" 워터마크
- 추후 변호사 검토 서비스 제휴 (월 $99 옵션)

### 3. 결제 링크 법적 책임
**문제**: 착수금 받고 작업 안 하면?

**해결책**
- Disclaimer: "SnapQuote is a tool provider, not a party to any contract"
- Stripe Disputes 자동 알림 (사용자에게 경고)
- 악용 사례 발견 시 계정 정지 정책

---

## M. 성공 지표 (KPI)

### 1. Retention (가장 중요)
- **Week 2 Retention**: 첫 사용 후 2주 내 재사용률
  - 목표: 60% 이상
- **Monthly Active Users**: 월 3회 이상 사용
  - 목표: 전체 가입자의 40%

### 2. Efficiency Metrics
- **Time on Task**: 앱 실행 → 전송 완료
  - 목표: 평균 2분 이내
  - Red Flag: 5분 초과 (UX 개선 필요)
- **Voice Recognition Accuracy**: 음성 → 텍스트 정확도
  - 목표: 90% 이상
  - 측정: 사용자가 수정한 단어 수 / 전체 단어 수

### 3. Conversion Metrics
- **Free → Paid**: 무료 사용자의 유료 전환율
  - Pay-As-You-Go: 목표 15%
  - Pro 구독: 목표 5%
- **Trial → Subscribe**: 첫 유료 사용 후 구독 전환
  - 목표: 30% (3번 쓰면 구독한다는 가설)

### 4. Revenue Metrics
- **ARPU** (Average Revenue Per User): 사용자당 평균 수익
  - 목표: $8/월 (Free 포함 전체 평균)
- **LTV:CAC Ratio**: 생애 가치 대비 고객 획득 비용
  - 목표: 3:1 이상

### 5. Product-Market Fit Signals
- **"Would you be disappointed if this product disappeared?"**
  - 목표: 40% 이상 "Very disappointed"
- **NPS (Net Promoter Score)**
  - 목표: 50 이상
- **Weekend Usage Rate** (새로운 지표)
  - 일요일 저녁 사용률
  - 목표: 5% 이하 (높으면 문제 = 아직 집에서 일함)

### 6. Operational Metrics
- **Voice Processing Time**: Whisper API 응답 시간
  - 목표: 평균 3초 이내
- **Sync Failure Rate**: 동기화 실패율
  - 목표: 1% 이하
- **PDF Generation Time**: PDF 생성 속도
  - 목표: 5초 이내

---

## N. 위험 요소 & 대응 전략 (Risk Mitigation)

### 1. 기술적 위험

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| Whisper API 오인식률 높음 | 높음 | 중간 | Custom Vocabulary + Fallback UI |
| 오프라인 동기화 충돌 | 중간 | 낮음 | Queue System + 재시도 로직 |
| 모바일 배터리 소모 과다 | 낮음 | 중간 | Background 처리 최적화 |

### 2. 시장 위험

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| 타겟 고객 지불 의사 낮음 | 높음 | 중간 | Pay-As-You-Go 옵션 강화 |
| ServiceTitan 등 대형 경쟁사 진입 | 높음 | 낮음 | 틈새 시장 (소규모) 집중 |
| 음성 입력 거부감 | 중간 | 중간 | 텍스트 입력 옵션 병행 |

### 3. 법적 위험

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| 계약서 양식 법적 문제 | 높음 | 낮음 | Disclaimer 강화 + 변호사 검토 |
| 사용자 간 분쟁 연루 | 중간 | 낮음 | ToS 명확화 + 중립 입장 유지 |
| 결제 사기 | 중간 | 낮음 | Stripe Radar 사기 방지 |

---

## O. 6개월 로드맵 (Long-term Vision)

### Month 1-2: PMF 검증
- 베타 사용자 50명 확보
- Week 2 Retention 60% 달성
- 핵심 버그 0건 유지

### Month 3-4: 성장 가속
- Product Hunt 런칭
- 유료 사용자 100명 돌파
- 추가 업종 지원 (Landscaping, Cleaning)

### Month 5-6: 스케일업
- Team Plan 출시
- 자재상 파트너십 10곳
- 월 $10K MRR 달성

---

## P. 예상 비용 & ROI (Financial Projection)

### 초기 개발 비용 (4주)
- 개발 시간: 160시간 (주 40시간 x 4주)
- 시간당 비용: $0 (본인 개발) 또는 외주 시 $50/시간
- **총 개발 비용: $0 ~ $8,000**

### 월간 운영 비용
| 항목 | 비용 | 비고 |
|------|------|------|
| Supabase | $25/월 | Pro Plan |
| OpenAI API | $100/월 | 사용자 100명 기준 |
| Vercel Hosting | $20/월 | Pro Plan |
| Stripe 수수료 | 2.9% + $0.30 | 거래당 |
| Sentry | $26/월 | Team Plan |
| 도메인 | $12/년 | |
| **합계** | **~$180/월** | |

### 손익분기점 (Break-even)
- 월 운영 비용: $180
- Pro 구독 ($19/월) 필요 인원: **10명**
- Pay-As-You-Go ($1.99/건) 필요 거래: **90건**

### 6개월 수익 예측 (보수적)
| 월 | 무료 사용자 | Pro 구독 | 월 수익 | 누적 |
|-----|-------------|----------|---------|------|
| 1 | 20 | 2 | $38 | $38 |
| 2 | 50 | 5 | $95 | $133 |
| 3 | 100 | 15 | $285 | $418 |
| 4 | 200 | 30 | $570 | $988 |
| 5 | 350 | 50 | $950 | $1,938 |
| 6 | 500 | 80 | $1,520 | $3,458 |

---

## Q. 경쟁 분석 (Competitive Landscape)

### 직접 경쟁자

#### ServiceTitan ($399/월)
- **강점**: 완전한 비즈니스 관리 솔루션
- **약점**: 너무 비싸고 복잡함, 소규모 업체엔 과함
- **우리의 차별화**: 1/20 가격, 오직 견적에만 집중

#### Jobber ($29~$299/월)
- **강점**: 스케줄링 + 견적 통합
- **약점**: 오프라인 지원 약함, 음성 입력 없음
- **우리의 차별화**: 오프라인 불사신, 음성 우선

### 간접 경쟁자

#### Excel + 템플릿 (무료)
- **강점**: 무료, 익숙함
- **약점**: 시간 잡아먹음, 전문성 없음
- **우리의 차별화**: "엑셀보다 빠르고, 10배 전문적"

#### 이메일/문자 (무료)
- **강점**: 빠름
- **약점**: 신뢰도 제로
- **우리의 차별화**: 프로페셔널 PDF + 결제 링크

---

## R. 성공 사례 시나리오 (Success Stories)

### 페르소나 1: "토니" - 배관공 오너 (3인 팀)
**Before**
- 직원들이 현장에서 종이에 낙서
- 토니가 집에서 밤 10시까지 엑셀로 정리
- 주말에도 밀린 견적서 작성

**After**
- 직원들이 현장에서 앱으로 녹음
- 토니는 승인만 누르면 끝
- "금요일 저녁에 TV 보는 시간이 생겼어요"

**ROI**: 주 10시간 절약 = 월 $800 인건비 절감

### 페르소나 2: "김" - 한인 전기 기술자 (1인)
**Before**
- 영어 견적서 쓰느라 2시간
- 고객이 "영어가 이상해요" 피드백
- 대형 프로젝트 수주 실패

**After**
- 한국어로 녹음해도 완벽한 영어 PDF
- 고객: "정말 프로페셔널하네요!"
- 계약 성사율 30% → 60% 상승

**ROI**: 월 1건 더 수주 = 월 $2,000 추가 수익

---

## S. FAQ (자주 묻는 질문)

### 제품 관련

**Q: 인터넷 없어도 작동하나요?**  
A: 네! 녹음과 로컬 저장은 완전 오프라인입니다. AI 변환은 인터넷 연결 시 자동 처리됩니다.

**Q: 음성 인식 정확도는?**  
A: 조용한 환경 95%, 시끄러운 현장 85~90%. Custom Vocabulary로 전문 용어 학습 가능합니다.

**Q: 한국어도 되나요?**  
A: 현재는 영어만 지원하지만, 한국어 녹음 → 영어 변환 기능 추가 예정입니다.

### 가격 관련

**Q: 무료로 계속 쓸 수 있나요?**  
A: 월 3건까지는 무료입니다. 그 이상은 $1.99/건 또는 $19/월 구독이 필요합니다.

**Q: 환불 정책은?**  
A: Pro 구독은 첫 7일 무조건 환불입니다. Pay-As-You-Go는 환불 불가합니다.

### 법적 관련

**Q: 이 견적서로 법적 문제 생기면?**  
A: SnapQuote는 도구 제공자일 뿐, 계약 당사자가 아닙니다. 사용자가 해당 지역 법률을 준수할 책임이 있습니다.

**Q: 라이선스 없어도 쓸 수 있나요?**  
A: 기술적으로는 가능하지만, 대부분의 주에서 라이선스 없이 유료 계약은 불법입니다.

---

## T. 다음 단계 (Next Steps)

### 즉시 시작할 것
1. **Week 0 실행**: Shadow Work Calculator 제작 시작
2. **베타 테스터 모집**: Facebook에 게시물 작성
3. **기술 스택 확정**: Next.js 프로젝트 생성

### 이번 주 내 완료할 것
- [ ] 랜딩 페이지 초안 작성
- [ ] Whisper API 키 발급 및 첫 테스트
- [ ] Dexie.js 샘플 코드 작성

### 의사결정 필요 사항
- PDF 라이브러리: React-pdf vs Puppeteer?
- 베타 기간: 2주 vs 4주?
- 초기 타겟 업종: Plumbing만? vs 3개 업종?

---

## U. 연락처 & 피드백

### 프로젝트 관련 문의
- 이메일: [your-email@example.com]
- 텔레그램: [@your-telegram]

### 베타 테스터 신청
- 구글 폼: [링크 추가]
- 조건: 주 3건 이상 견적 작성, 피드백 제공 의지

### 투자/파트너십 문의
- 현재 상태: Pre-seed, 자체 개발
- 관심사: 자재상 파트너십, 업계 멘토링

---

## V. 부록 (Appendix)

### A. 기술 용어집

| 용어 | 설명 |
|------|------|
| IndexedDB | 브라우저 내장 로컬 데이터베이스 |
| PWA | 설치 가능한 웹앱 |
| Whisper | OpenAI의 음성 인식 모델 |
| Service Worker | 오프라인 작동 가능하게 하는 기술 |

### B. 업종별 전문 용어 예시

**Plumbing**
- PEX pipe, CPVC, Shut-off valve, P-trap, Sewer line

**HVAC**
- BTU, SEER rating, Ductwork, Refrigerant, Heat pump

**Electrical**
- GFCI outlet, Circuit breaker, Amperage, Grounding, Conduit

### C. 참고 자료
- [ServiceTitan Pricing](https://www.servicetitan.com/pricing)
- [Jobber Features](https://getjobber.com/features)
- [OpenAI Whisper Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [Stripe Payment Links](https://stripe.com/payments/payment-links)

---

## 📌 핵심 요약 (TL;DR)

### 무엇을?
음성으로 말하면 프로페셔널 견적서 PDF가 나오는 앱

### 누구를 위해?
집에서 엑셀 쓰는 소규모 기술자/시공업체 (2-10인)

### 왜 성공할까?
1. **진짜 문제 해결**: "그림자 노동" 제거
2. **차별화**: 오프라인 + 음성 + 선금 결제
3. **적절한 가격**: $1.99/건 (커피값)
4. **명확한 가치**: "주당 10시간 절약"

### 언제 출시?
4주 후 베타, 8주 후 정식 런칭

### 얼마나 벌까?
6개월 내 월 $1,500 목표 (보수적)

---

**"Don't take your work home."**

*- SnapQuote Team*