# SnapQuote v3.0
## 현장 기술자를 위한 30초 견적서 생성기
**The Only Estimator That Works in a Basement**

---

## 📍 Executive Summary (경영진 요약)

### 문제의 본질
기존 견적 소프트웨어(ServiceTitan $399/월, Jobber $169/월)의 치명적 결함:
1. **인터넷 없으면 무용지물** - 지하실/신축 현장에서 사용 불가
2. **타이핑 전제** - 더러운 장갑 낀 손으로는 입력 불가능
3. **복잡한 학습 곡선** - 50대+ 기술자들이 포기함
4. **과한 기능** - 견적 하나 만드는데 팀 관리 기능까지 강매

### SnapQuote의 해결책
```
입력: 사진 + 음성 (30초)
처리: 오프라인 저장 → AI 변환
출력: 전문가급 PDF (영문)
```

**핵심 차별화**: 
- 지하실에서도 작동 (오프라인 우선)
- 손 안 씻어도 사용 가능 (음성 중심)
- 배우는데 3분 (복잡도 제로)

---

## 🎯 타겟 시장 (TAM/SAM/SOM)

| 구분 | 규모 | 설명 |
|------|------|------|
| **TAM** | $50B | 북미 소규모 건설/수리 시장 |
| **SAM** | $5B | 비영어권 또는 영어 서툰 기술자 (10%) |
| **SOM** | $50M | 초기 3년 목표 (1% 점유율) |

**1차 타겟**: 캐나다 온타리오 한인 기술자 (5,000명 추산)  
**2차 타겟**: 미국 동부 라틴계/중국계 기술자  
**3차 타겟**: 전체 소규모 트레이더

---

## 🔥 Pain Points (2024 현장 리서치)

### A. 결제 지옥 (Payment Hell)
**통계**: 
- 건설업계 결제 지연 비용이 2024년 2,800억 달러에 달함
- 계약자의 82%가 30일 이상 결제 대기
- 일부 기술자는 90일 이상 기다림

**현장 목소리**:
> "견적서가 영어로 엉망이면 고객이 '이 사람 실력도 의심스럽다'고 생각해서 돈 안 줘. 그게 제일 무서운 거야."

**SnapQuote 솔루션**:
- 전문적인 영문 견적 → 신뢰도 ↑ → 결제율 ↑
- PDF에 결제 링크 자동 포함 (Stripe 연동)
- "Net 30 days" 같은 업계 표준 문구 자동 삽입

---

### B. 오프라인 불가 (No WiFi, No Work)
**현실**:
- 지하실, 신축 현장, 지방 지역은 인터넷 불안정
- 기존 앱들: "인터넷 연결 필요" → 현장에서 무용지물

**기술자 인터뷰**:
> "집 지하실 보일러 고치려 갔는데 와이파이 안 터져. ServiceTitan 열어봤자 로딩만 10분."

**SnapQuote 솔루션**:
```
[오프라인 모드]
1. 사진 촬영 → IndexedDB 저장
2. 음성 녹음 → 로컬 저장
3. "인터넷 연결 시 자동 업로드" 표시

[와이파이 잡히는 순간]
4. 백그라운드 자동 sync
5. AI 처리 → 결과 푸시 알림
```

---

### C. 음성 인식 실패 처리 (Whisper Mistakes)
**문제**: 
- 시끄러운 공사장에서 "P-trap" → "Peter's trap"
- 전문 용어 오인식 빈번

**SnapQuote 안전장치**:
```
[Step 1: 음성 녹음]
    ↓
[Step 2: 텍스트 확인 화면] ← NEW
- 원본 오디오 재생 버튼
- 수정 가능한 텍스트 박스
- 불확실한 단어는 🟡 하이라이트
    ↓
[Step 3: "확인" 버튼 후 AI 처리]
```

---

### D. 가격 책정 공포 (Pricing Anxiety)
배관공들은 종종 노동 비용을 저평가하며, 이동, 훈련, 장비 유지보수와 같은 비청구 시간을 포함하지 않음

**현장 사례**:
- 신참: 너무 싸게 부름 → 적자
- 베테랑: 경험으로 때려맞춤 → 지역 차이 무시

**SnapQuote 솔루션**:
```javascript
// AI 프롬프트에 가격 가이드 포함
const PRICING_GUIDE = {
  "Toronto Downtown": {
    "basic_service_call": 120,
    "hourly_rate_journeyman": 85,
    "emergency_multiplier": 1.5
  },
  // 우편번호별 데이터
};

// 사용자가 가격 안 말하면
if (!userPrice) {
  suggestPrice = PRICING_GUIDE[zipcode][jobType];
  aiResponse += `
    💡 Suggested: $${suggestPrice} (Toronto avg)
    ⚠️ You can edit this before sending
  `;
}
```

---

### E. 기존 소프트웨어의 과잉 기능
배관업체들은 스케줄북, 작업주문서, 송장에 같은 정보를 세 번씩 적어야 함

**ServiceTitan의 문제**:
- 견적 만드는데 팀 관리, 재고, 마케팅 기능 강요
- 월 $399 + 직원당 추가 비용
- 온보딩 2주 필요

**SnapQuote 철학**:
> "견적만 만들게 해줘. 나머지는 나중 문제야."

---

## 🏗️ 제품 아키텍처 (v3.0 업데이트)

### 기술 스택 변경사항

| 항목 | v2.0 | v3.0 | 이유 |
|------|------|------|------|
| 오프라인 저장 | ❌ | ✅ IndexedDB + Service Worker | 지하실 대응 |
| 음성 확인 | ❌ | ✅ 중간 검증 단계 | Whisper 오류 방지 |
| 가격 DB | ❌ | ✅ 우편번호별 평균가 | 신규 기술자 지원 |
| 결제 링크 | ❌ | ✅ Stripe Payment Link | 결제 지연 감소 |
| MVP 범위 | Clients 테이블 포함 | 제외 | 출시 속도 우선 |

---

## 📱 UX Flow (완전 재설계)

### 기존 Flow (v2.0)
```
[사진] → [텍스트 입력] → [AI 처리] → [PDF]
❌ 오프라인 안됨
❌ 음성 오류 못 잡음
```

### 신규 Flow (v3.0)
```
[앱 열기]
    ↓
[🎤 음성 녹음 버튼] (대형, 화면 중앙)
    ↓
[녹음 완료] → "처리 중..." 
    ↓
[텍스트 확인 화면] ← 여기서 수정 가능
- 원본: "페트랩 교체 10만원"
- AI 변환: "P-trap replacement, labor $80"
- [✏️ 수정] [✅ 확인] 버튼
    ↓
[견적 항목 생성] (AI)
    ↓
[가격 편집 화면]
- 각 항목별 수량/단가 수정
- 💡 지역 평균가 표시
- [사진 추가] (선택)
    ↓
[미리보기]
    ↓
[📧 전송] 또는 [💾 저장]

---
[오프라인 상태일 경우]
📶 "인터넷 없음. 작업 내용 저장됨."
→ 와이파이 연결 시 자동 처리
```

---

## 🧠 AI System Prompt (v3.0 업데이트)

```javascript
const SYSTEM_PROMPT_V3 = `
You are a Canadian/US Trade Estimator specializing in residential services.

INPUT: Rough field notes (often in broken English or mixed languages)
OUTPUT: Professional English estimate items (JSON)

CRITICAL RULES:

1. PROFESSIONALIZATION
   - "toilet fix" → "Toilet Fill Valve Replacement & Tank Seal Inspection"
   - "sink pipe broken" → "Kitchen Sink P-Trap Replacement (PVC, 1.5")"
   - "no hot water" → "Water Heater Diagnostic & Element Testing"
   
2. PRICING LOGIC
   - IF user mentions price: Use EXACT amount
   - IF no price: Set unit_price to 0 AND include "suggested_price" field
   - NEVER invent prices
   - Example: {"unit_price": 0, "suggested_price": 85, "note": "Toronto avg for journeyman rate"}

3. PROFESSIONALISM BOOSTERS (Always include)
   - "Work area will be left clean and swept"
   - "All debris and packaging removed from premises"
   - "Post-service safety check included at no charge"

4. PAYMENT TERMS (Add to every estimate)
   - "Payment due upon completion unless otherwise agreed"
   - "Net 30 days for established clients"
   - "Checks, e-transfer, or credit card accepted"

5. OUTPUT FORMAT (JSON)
{
  "items": [
    {
      "description": "Professional English description",
      "quantity": 1,
      "unit_price": 75.00,
      "suggested_price": 85.00,  // Toronto avg, can be null
      "notes": "Includes basic cleanup"
    }
  ],
  "closing_note": "Thank you for choosing [Business Name]. We guarantee our work for 90 days.",
  "payment_terms": "Payment due upon completion. Net 30 for established clients."
}

6. REGIONAL CONTEXT
   - Use Canadian spelling (labour, colour) if location = Canada
   - Include HST/GST reminders for Canadian estimates
   - Use appropriate units (imperial for US, metric for Canada when relevant)

TONE: Professional, trustworthy, concise. Avoid corporate jargon.
`;
```

---

## 💾 데이터베이스 스키마 (간소화)

```sql
-- MVP는 이것만
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  business_name TEXT,
  phone TEXT,
  city TEXT, -- 가격 책정용
  tax_rate FLOAT DEFAULT 0.13,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE estimates (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  
  -- 기본 정보 (고객 테이블 없이)
  client_name TEXT,
  client_address TEXT,
  client_phone TEXT,
  
  -- 견적 데이터
  items JSONB, -- [{description, qty, price}]
  total_amount FLOAT,
  
  -- 파일
  photo_url TEXT,
  pdf_url TEXT,
  
  -- 오프라인 동기화
  synced BOOLEAN DEFAULT false,
  created_offline BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- V2 기능 (출시 후 추가)
-- Clients 테이블은 나중에
-- History AI는 나중에
```

---

## 🚀 MVP 개발 로드맵 (재정의)

### Week 0: 사전 준비 (1일)
- [ ] Next.js 14 + Tailwind + Shadcn 세팅
- [ ] Supabase 프로젝트 생성
- [ ] OpenAI API 키 발급
- [ ] Vercel 배포 설정

### Week 1: 핵심 기능 (3-4일)
**Step 1: 음성 입력 (가장 중요)**
```
Prompt: "Create /new page with:
1. Large microphone button (center, 120px)
2. Recording animation (pulsing red circle)
3. Stop button after 3 seconds
4. Compress audio to OPUS format
5. Store in IndexedDB if offline
6. Call Whisper API if online"
```

**Step 2: 텍스트 확인 단계 (신규)**
```
Prompt: "After Whisper transcription:
1. Show original audio player (replayable)
2. Editable text area with transcription
3. Highlight uncertain words in yellow
4. [Edit] [Confirm] buttons
5. Only after Confirm → call GPT-4"
```

**Step 3: AI 견적 생성**
```
Prompt: "Use System Prompt v3.0.
Display result as:
- List of items (description, qty, price)
- Each row editable
- Show 💡 suggested_price if available
- [+ Add Item] button"
```

**Step 4: PDF 생성**
```
Prompt: "Use jsPDF to create:
- Company header (business name, phone)
- Client info
- Line items table
- Subtotal, Tax, Total
- Payment terms (from AI output)
- Footer: 'Valid 30 days. License # [TBD]'
- Stripe payment link QR code
- Download as 'Estimate_ClientName_Date.pdf'"
```

### Week 2: 오프라인 + 법적 보호 (2-3일)
**Step 5: Service Worker**
```
Prompt: "Implement offline-first strategy:
1. Cache app shell
2. Store photos in IndexedDB
3. Store audio recordings locally
4. Add 'sync' background task
5. Show 📶 indicator when offline
6. Auto-upload when online"
```

**Step 6: 법적 팝업**
```
Prompt: "On first launch, show modal:
Title: 'Privacy & Terms'
Body: 
- This app stores client data locally
- Data encrypted and never shared
- Estimates are not binding contracts
- You are responsible for pricing accuracy
[✓ I Agree] button (required)"
```

---

## 💰 수익 모델 (업데이트)

### Phase 1: Free (0-3개월)
- 무제한 견적서 생성
- **목표**: 100명 활성 유저
- **지표**: 
  - 주 3회 이상 사용자 50명
  - 평균 견적서 수락률 추적

### Phase 2: Freemium (3-6개월)
```
무료: 월 5개 견적서
유료: 
  - $0.99/개 (pay-as-you-go)
  - $19/월 (무제한)
```

**전환 트리거**:
- 6번째 견적부터 "Upgrade" 팝업
- "이번 달 5개 사용했어요. 계속 쓰려면?"

### Phase 3: Premium (6개월~)
```
Basic ($19/월): 무제한 견적
Pro ($49/월): 
  - 로고 커스터마이징
  - 견적 템플릿 10개
  - 우선 고객 지원
  - 월간 수익 리포트
```

### 추가 수익원 (나중에)
1. **자재 제휴**: Home Depot API 연동 → 주문당 5% 커미션
2. **보험 제휴**: 기술자 배상책임보험 중개 → 가입당 $50
3. **교육 콘텐츠**: "영어 견적서 작성법" 온라인 강의 $99

---

## 📊 성공 지표 (KPIs)

### Phase 1 (3개월)
| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 가입자 | 100명 | Supabase Auth |
| 견적서 생성 | 500개 | DB count |
| 주간 활성 사용자 (WAU) | 30명 | 7일 내 로그인 |
| 평균 세션 시간 | 90초 이하 | Analytics |
| 오프라인 사용률 | 20% | Offline flag 분석 |

### Phase 2 (6개월)
| 지표 | 목표 | 의미 |
|------|------|------|
| 유료 전환율 | 5% | 5/100명 결제 |
| MRR | $500 | 월 반복 매출 |
| 견적 수락률 | 40% | 고객이 서명한 비율 |
| 추천율 | 20% | 신규 중 추천 가입 |

---

## ⚠️ 리스크 관리

| 리스크 | 확률 | 영향 | 대응 전략 |
|--------|------|------|----------|
| AI 가격 폭등 | 중간 | 높음 | 로컬 캐싱, Whisper 대신 Web Speech API 대체 |
| 법적 소송 (잘못된 견적) | 낮음 | 치명적 | 디스클레이머 강화, 보험 가입 권장 |
| 경쟁사 모방 | 높음 | 중간 | 오프라인 기능으로 차별화 유지 |
| 타겟 시장 너무 작음 | 중간 | 높음 | 3개월 내 미달 시 일반 기술자로 확장 |
| 음성 인식 정확도 낮음 | 중간 | 중간 | 텍스트 확인 단계로 해결 |

---

## 🎓 경쟁 분석

| 제품 | 가격 | 장점 | 단점 | SnapQuote 우위 |
|------|------|------|------|---------------|
| **ServiceTitan** | $399/월 | 올인원, 강력한 기능 | 비쌈, 복잡함, 오프라인 ❌ | 가격 20배 저렴, 오프라인 |
| **Jobber** | $169/월 | 중간 크기, 견적+스케줄 | 여전히 비쌈, 학습 필요 | 가격 9배 저렴, 초간단 |
| **Joist** | $29/월 | 저렴, 간단 | 기능 제한적, 음성 ❌ | 음성 중심, AI 품질 |
| **Excel/종이** | 무료 | 익숙함 | 시간 소모, 비전문적 | 속도 10배, 전문성 |

**SnapQuote의 블루오션**:
- 오프라인 + 음성 + AI + 저렴함의 조합은 시장에 없음
- 기존 제품: High-end (ServiceTitan) vs Low-end (종이)
- SnapQuote: Mid-Market Sweet Spot

---

## 🚨 즉시 실행 항목 (Action Items)

### 오늘 (1시간)
1. [ ] 현재 Vercel 사이트 `/new-estimate` 페이지에 음성 녹음 버튼 추가
2. [ ] Web Speech API로 간단한 음성→텍스트 테스트 (Whisper 전에)
3. [ ] 본인 핸드폰으로 "Replace kitchen faucet 80 dollars" 말해보기

### 이번 주말 (8시간)
4. [ ] Whisper API 연동
5. [ ] 텍스트 확인 화면 구현
6. [ ] GPT-4o로 간단한 견적 생성 (가격 하드코딩)
7. [ ] 친구 기술자 1명에게 시연

### 다음 주 (출시 전)
8. [ ] jsPDF로 PDF 생성
9. [ ] IndexedDB 오프라인 저장
10. [ ] 법적 고지 팝업
11. [ ] 실제 현장에서 테스트 (지하실 가서 해보기)

---

## 💡 Gemini 피드백 반영 요약

✅ **즉시 반영됨**:
1. 오프라인 우선 전략 (Service Worker + IndexedDB)
2. 음성 확인 단계 추가 (Whisper 오류 방지)
3. MVP 범위 축소 (Clients 테이블 제거)
4. 법적 고지 팝업 강화
5. 시스템 프롬프트에 가격 가이드 추가

⏳ **Phase 2로 연기됨**:
1. 히스토리 AI (과거 견적 기반 추천)
2. 고객 관리 기능
3. 팀 계정

---

## 🎯 최종 목표

**3개월 후**:
- 100명의 기술자가 매주 SnapQuote 사용
- "이거 없으면 일 못해" 피드백 3건 이상
- 유료 전환 준비 완료

**1년 후**:
- MRR $10,000 달성
- 캐나다 한인 기술자 시장 20% 점유
- 미국 라틴계 시장 진출

**3년 후**:
- 북미 소규모 기술자의 표준 도구
- 자재 제휴로 추가 수익
- M&A 또는 시리즈 A 펀딩

---

## 📝 맺음말

**기존 소프트웨어가 놓친 것**:
1. 현장은 인터넷이 없다
2. 손은 더럽다
3. 영어는 어렵다
4. 시간은 없다

**SnapQuote가 지키는 것**:
1. 오프라인에서도 작동한다
2. 음성만으로 입력한다
3. AI가 영어로 바꿔준다
4. 30초면 끝난다

> "The best product is the one that solves a real problem nobody else is solving."

**지금 당장 시작하세요. 코드가 증명입니다.** 🚀

---

*Version: v3.0 (2024-12-10)*  
*Contributors: Original Plan + Gemini Analysis + Real-World Pain Points*  
*Next Review: 출시 후 1개월*