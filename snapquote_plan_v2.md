# SnapQuote v2.0
## Trade-Focused AI Estimator (전문 기술자용 AI 견적 생성기)

---

## 1. 제1원리 정의 (The Core Physics)

**목표**: 현장 기술자가 '사진 1장'과 '음성 메모'만으로 30초 안에 "돈을 받을 수 있는(Payable)" 전문가 수준의 PDF 견적서를 생성한다.

**핵심 가치**: 
- 속도(Speed): 현장에서 즉시 생성
- 전문성(Professionalism): AI가 영어 비즈니스 표현으로 자동 변환
- 언어 장벽 제거: 영어가 서툰 기술자도 네이티브급 견적서 작성

**타겟 고객**:
- 1차: 캐나다/미국 한인 기술자 (배관공, 전기공, 수리기사)
- 2차: 모든 비영어권 기술자 (라틴계, 중국계 등)
- 시장 규모(TAM): 북미 소규모 건설/수리업 종사자 약 500만 명 중 비영어권 약 20% = 100만 명

**타겟 디바이스**: Mobile First (iOS/Android PWA)

---

## 2. 사용자 흐름 (The Happy Path)

### Step 1: Input (입력)
1. 앱 실행 → [+ 새 견적] 버튼
2. **사진 촬영** (선택사항 - 고객에게 보여주기용)
3. **음성 녹음 또는 텍스트 입력**
   - 예: "Replace kitchen sink P-trap, 1 hour labor, $50 parts"
   - 예: "화장실 변기 수리, 부품비 5만원, 공임 10만원"

### Step 2: Process (AI 처리)
1. 음성 → 텍스트 변환 (Whisper API)
2. GPT-4o가 **전문 영어 표현**으로 항목 생성
   - ❌ "fix toilet" 
   - ✅ "Toilet Flapper Valve Replacement & Seal Inspection"
3. **가격 로직**:
   - 사용자가 말한 가격 우선 사용
   - 가격 없으면 $0으로 두고 수동 입력 유도
   - (V2 기능) AI가 지역 평균가 추천
4. 법적 고지문 자동 추가

### Step 3: Output (출력)
1. **편집 가능한 미리보기**
   - 각 항목의 설명/수량/가격 수정 가능
   - 세금(Tax) 자동 계산
2. [PDF 생성] 클릭
3. 이메일/문자 공유 또는 다운로드

---

## 3. 비즈니스 모델 (The Money)

### 수익화 전략 (3단계)
| 단계 | 기간 | 정책 | 목표 |
|------|------|------|------|
| **Phase 1: Free** | 출시 후 3개월 | 견적서 무제한 무료 | PMF 검증, 100명 유저 확보 |
| **Phase 2: Freemium** | 3~6개월 | 월 5개 무료 / 이후 $0.99/개 | 전환율 테스트 |
| **Phase 3: Subscription** | 6개월~ | $19/월 (무제한) 또는 $2/개 | 안정적 수익 |

### 추가 수익 가능성 (나중에)
- Premium: 로고 커스터마이징, 브랜드 색상 ($29/월)
- Enterprise: 팀 계정, 고객 DB 통합 ($99/월)
- Referral: 자재 공급업체 제휴 수수료

---

## 4. 기술 스택 & 아키텍처 (The Stack)

**원칙**: 1인 개발, 서버 관리 제로, 확장 가능

| Layer | Technology | 이유 |
|-------|-----------|------|
| **Frontend** | Next.js 14 (App Router) + Tailwind + Shadcn/UI | SEO, SSR, 컴포넌트 재사용 |
| **Backend** | Supabase (Auth, Postgres, Storage) | 백엔드 코드 없이 DB+Auth 해결 |
| **AI** | OpenAI GPT-4o + Whisper | Vision(선택) + Text + Audio 올인원 |
| **Payment** | Stripe | 글로벌 결제, 구독 관리 |
| **Deploy** | Vercel | 무료 티어, 자동 배포 |
| **PDF** | react-pdf 또는 jsPDF | 클라이언트 사이드 생성 |

---

## 5. 데이터베이스 스키마 (The Skeleton)

```sql
-- Users (기술자 정보)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  business_name TEXT,
  logo_url TEXT,
  phone TEXT,
  address TEXT,
  tax_rate FLOAT DEFAULT 0.13, -- 캐나다 HST 기본값
  license_number TEXT, -- 주별 라이센스 번호
  created_at TIMESTAMP DEFAULT NOW()
);

-- Clients (고객 정보)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Estimates (견적서)
CREATE TABLE estimates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  status TEXT DEFAULT 'draft', -- 'draft' | 'sent' | 'paid'
  total_amount FLOAT,
  currency TEXT DEFAULT 'CAD', -- 'CAD' | 'USD'
  ai_summary TEXT, -- AI가 생성한 작업 요약
  photo_url TEXT, -- 현장 사진 URL
  pdf_url TEXT, -- 생성된 PDF 파일 URL
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP
);

-- Estimate Items (견적 세부 항목)
CREATE TABLE estimate_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE,
  description TEXT NOT NULL, -- 예: "Installation of heavy-duty brass P-trap"
  quantity INT DEFAULT 1,
  unit_price FLOAT,
  total FLOAT, -- quantity * unit_price
  sort_order INT DEFAULT 0
);
```

---

## 6. AI 시스템 프롬프트 (The Brain)

```javascript
const SYSTEM_PROMPT = `
You are an expert Construction & Trade Estimator. Convert rough field notes into professional English estimates.

RULES:
1. Professionalize Language:
   - "fix toilet" → "Toilet Flapper Valve Replacement & Seal Inspection"
   - "change pipe" → "PVC Pipe Replacement (3/4 inch, Schedule 40)"

2. Pricing Logic:
   - IF user mentions price: Use that exact amount
   - IF no price given: Set unit_price to 0 (user will fill manually)
   - NEVER invent prices

3. Add Value Items:
   - Always include "Post-Service Safety Inspection" with $0 price (shows professionalism)

4. Output Format (JSON):
{
  "items": [
    {
      "description": "Professional description",
      "quantity": 1,
      "unit_price": 50.00
    }
  ],
  "summary_note": "Brief summary of work scope"
}

5. Tone: Professional, trustworthy, concise.
`;
```

---

## 7. 개발 로드맵 (Step-by-Step for AI IDE)

### Week 1: MVP Core (MVP 핵심 기능)
**Step 1: 프로젝트 세팅**
```
Prompt: "Create a mobile-first Next.js 14 application using App Router, 
Tailwind CSS, and Shadcn UI. Set up Supabase client with environment 
variables. Create a bottom navigation with 'Home', 'New', 'History' tabs."
```

**Step 2: New Estimate 페이지**
```
Prompt: "Create /new page with:
1. Optional image upload (camera/gallery)
2. Text area for notes (placeholder: 'Describe the job and pricing')
3. 'Generate' button that calls OpenAI API with the system prompt
4. Display returned JSON as editable list (Description, Qty, Price columns)
5. 'Save' button to store in Supabase estimates table"
```

**Step 3: PDF 생성**
```
Prompt: "Add 'Generate PDF' button. Use jsPDF to create professional invoice:
- Header: User's business name, address, phone
- Client section
- Line items table (Description | Qty | Unit Price | Total)
- Subtotal, Tax (13%), Grand Total
- Footer: 'This is an estimate. Final price subject to change.'
- Download as 'Estimate_[ClientName]_[Date].pdf'"
```

### Week 2: Polish (다듬기)
**Step 4: History 페이지**
```
Prompt: "Create /history page showing all estimates in card format.
Each card shows: Client name, Date, Total amount, Status badge.
Clicking card opens detail view with 'Download PDF' and 'Mark as Sent' buttons."
```

**Step 5: 인증 & 프로필**
```
Prompt: "Add Supabase Auth (Google Sign-in).
Create /profile page where user can edit: Business name, Logo upload, 
Tax rate, License number. Save to profiles table."
```

---

## 8. 법적 보호장치 (Legal Safeguards)

### PDF 하단 필수 문구 (하드코딩)
```
IMPORTANT NOTICE:
This is an estimate only, not a binding contract. Final costs may vary 
based on unforeseen conditions. Work requires written approval. 
License #: [USER_LICENSE_NUMBER]

Valid for 30 days from issue date.
```

### 주별 규정 대응 (V2 기능)
- 사용자가 주(State/Province) 선택 시 해당 규정 문구 자동 삽입
- 예: 캐나다 온타리오 → "HST Registration #: [TBD]"

---

## 9. 최소 실행 가능한 돌파구 (MVB) 체크리스트

**이것만 되면 즉시 배포:**

- [ ] 모바일에서 사진 업로드 가능
- [ ] "화장실 변기 수리 10만원"이라고 입력 → 영문 견적서 항목 생성됨
- [ ] 가격 수정 가능
- [ ] PDF 다운로드 또는 공유 가능
- [ ] 견적서가 Supabase에 저장됨

**배포 후 첫 주 목표:**
- 실제 기술자 5명에게 테스트
- "이거 돈 내고 쓸래요?" 질문
- 3명 이상 "Yes" → 다음 단계 진행

---

## 10. 리스크 & 대응 전략

| 리스크 | 확률 | 대응책 |
|--------|------|--------|
| AI가 가격 잘못 추정 | 높음 | 사용자 가격 우선, AI는 보조만 |
| 사진 분석 정확도 낮음 | 중간 | V1에서는 사진 = 첨부용만 |
| 타겟 시장 너무 작음 | 중간 | 초기엔 한인 집중, PMF 후 확장 |
| 법적 문제 | 낮음 | 디스클레이머 명확히, 변호사 검토 |

---

## 11. 성공 지표 (Success Metrics)

### Phase 1 (3개월)
- 가입자 100명
- 생성된 견적서 500개
- 주간 활성 사용자(WAU) 30명 이상

### Phase 2 (6개월)
- 유료 전환율 5% 이상
- MRR $500 달성
- 고객 재방문율 40% 이상

---

## 12. 즉시 실행 사항

**오늘 할 일:**
1. ✅ Cursor/Windsurf 열기
2. ✅ Step 1 프롬프트 입력
3. ✅ OpenAI API 키 발급 ($20 크레딧으로 시작)
4. ✅ Supabase 프로젝트 생성

**이번 주말까지:**
- Step 1~3 완성
- 본인 핸드폰에서 테스트
- 주변 기술자 1명에게 시연

**복잡한 생각은 버리고, 지금 바로 시작하세요. 코드가 답입니다.** 🚀

---

*버전 관리: v2.0 (2024-12-05) - 비즈니스 모델, 법적 대응, 리스크 분석 추가*