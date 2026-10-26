# SnapQuote Master Specification
**The Complete Reference Document**

> "음성 30초로 전문 영어 견적서 생성"  
> "The Only Estimator That Works in a Basement"

**Version:** 4.0 (Consolidated)  
**Last Updated:** 2026-01-16  
**Status:** Production Ready

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Identity](#product-identity)
3. [Market Analysis](#market-analysis)
4. [Problem & Solution](#problem--solution)
5. [Technical Architecture](#technical-architecture)
6. [Feature Specifications](#feature-specifications)
7. [AI System Design](#ai-system-design)
8. [User Experience](#user-experience)
9. [Business Model](#business-model)
10. [Go-to-Market Strategy](#go-to-market-strategy)
11. [Development Status](#development-status)
12. [Roadmap & KPIs](#roadmap--kpis)
13. [Risk Management](#risk-management)

---

## Executive Summary

### What is SnapQuote?

SnapQuote은 현장 기술자(Plumbers, Electricians, Contractors)를 위한 AI 기반 견적서 생성 앱입니다. 음성 입력과 오프라인 우선 아키텍처로 "현장에서 30초 만에 전문 영어 견적서 PDF 생성"을 실현합니다.

### Core Value Proposition

```
입력: 음성 30초 (장갑 낀 손으로도 가능)
처리: 오프라인 저장 → AI 변환
출력: 전문가급 PDF (영문) + 결제 링크
```

### Key Differentiators

1. **오프라인 불사신** - 지하실, 신축 현장 어디서든 작동
2. **음성 우선 UX** - 더러운 손/장갑 문제 해결
3. **AI 전문화** - 브로큰 잉글리시 → 프로페셔널 영어
4. **현장 완결성** - "The Parking Lot Rule" (트럭 시동 전 전송 완료)

### Market Opportunity

| 구분 | 규모 | 설명 |
|------|------|------|
| **TAM** | $50B | 북미 소규모 건설/수리 시장 |
| **SAM** | $5B | 비영어권 또는 영어 서툰 기술자 (10%) |
| **SOM** | $50M | 초기 3년 목표 (1% 점유율) |

---

## Product Identity

### Brand Positioning

**"퇴근길이 가벼운 현장 행정 도구"**

### Marketing Taglines

- **Primary**: "Don't take your work home."
- **Secondary**: "Your wife called. Dinner's getting cold."
- **Practical**: "Dirty Hands, Clean Quotes"
- **Technical**: "Talk, Snap, Send – Your Quote in 30 Seconds"

### Product Philosophy

> "견적 외 기능은 욕심내지 않는다. 오프라인과 모바일 우선. 기술자 언어/현장 현실을 최우선으로 반영."

---

## Market Analysis

### Target Customers

#### Primary: 소규모 시공업체 오너 (2-10인 팀)

**특징**
- 본인도 현장을 뛰지만, 직원들의 견적/행정 처리 때문에 스트레스
- 직원들이 엉망으로 써오는 견적서를 뜯어고치는 시간 발생

**니즈**
- 직원들의 견적서 표준화
- 현장에서 바로 완성도 높은 견적 생성

**지불 능력**
- 월 $29~$49 정도는 "시간 절약"으로 충분히 지불 가능
- 직원 1명당 주 2시간 절약 = 월 $200 이상 인건비 절감

#### Secondary: 이민자/비영어권 1인 기술자

**특징**
- 기술은 좋은데 문서 작업(영어) 때문에 제값을 못 받음
- "Broken English" 때문에 대형 프로젝트 수주 실패 경험

**니즈**
- 내 서툰 영어를 "Professional Contract"로 자동 변환
- 고객에게 신뢰감 주는 문서 양식

**지불 능력**
- 월 $34(Starter)는 "영어 과외" 한 번 값보다 저렴

### User Personas

#### Persona 1: "토니" - 배관공 오너 (3인 팀)

**Before**
- 직원들이 현장에서 종이에 낙서
- 토니가 집에서 밤 10시까지 엑셀로 정리
- 주말에도 밀린 견적서 작성

**After**
- 직원들이 현장에서 앱으로 녹음
- 토니는 승인만 누르면 끝
- "금요일 저녁에 TV 보는 시간이 생겼어요"

**ROI**: 주 10시간 절약 = 월 $800 인건비 절감

#### Persona 2: "김" - 한인 전기 기술자 (1인)

**Before**
- 영어 견적서 쓰느라 2시간
- 고객이 "영어가 이상해요" 피드백
- 대형 프로젝트 수주 실패

**After**
- 한국어로 녹음해도 완벽한 영어 PDF
- 고객: "정말 프로페셔널하네요!"
- 계약 성사율 30% → 60% 상승

**ROI**: 월 1건 더 수주 = 월 $2,000 추가 수익

### Competitive Landscape

| 제품 | 가격 | 장점 | 단점 | SnapQuote 우위 |
|------|------|------|------|----------------|
| **ServiceTitan** | $399/월 | 올인원, 강력한 기능 | 비쌈, 복잡함, 오프라인 ❌ | 가격 20배 저렴, 오프라인 |
| **Jobber** | $169/월 | 중간 크기, 견적+스케줄 | 여전히 비쌈, 학습 필요 | 가격 9배 저렴, 초간단 |
| **Joist** | $29/월 | 저렴, 간단 | 기능 제한적, 음성 ❌ | 음성 중심, AI 품질 |
| **Excel/종이** | 무료 | 익숙함 | 시간 소모, 비전문적 | 속도 10배, 전문성 |

**SnapQuote의 블루오션**:
- 오프라인 + 음성 + AI + 저렴함의 조합은 시장에 없음
- 기존 제품: High-end (ServiceTitan) vs Low-end (종이)
- SnapQuote: Mid-Market Sweet Spot

---

## Problem & Solution

### Core Pain Points

#### 1. 그림자 노동 (Shadow Work)

**문제**: 현장에서 일하고 집에 와서 또 1~2시간씩 엑셀과 씨름하는 '무임금 노동'

**SnapQuote 솔루션**: 
- 현장에서 즉시 완료
- "The Parking Lot Rule" - 트럭 시동 걸기 전에 견적 전송 완료

#### 2. 오프라인 불가 (No WiFi, No Work)

**문제**: 
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

#### 3. 결제 지옥 (Payment Hell)

**통계**: 
- 건설업계 결제 지연 비용이 2024년 2,800억 달러
- 계약자의 82%가 30일 이상 결제 대기
- 일부 기술자는 90일 이상 기다림

**현장 목소리**:
> "견적서가 영어로 엉망이면 고객이 '이 사람 실력도 의심스럽다'고 생각해서 돈 안 줘. 그게 제일 무서운 거야."

**SnapQuote 솔루션**:
- 전문적인 영문 견적 → 신뢰도 ↑ → 결제율 ↑
- PDF에 Stripe 결제 링크 자동 포함
- "Net 30 days" 같은 업계 표준 문구 자동 삽입

#### 4. 가격 책정 공포 (Pricing Anxiety)

**문제**: 배관공들은 종종 노동 비용을 저평가하며, 이동, 훈련, 장비 유지보수와 같은 비청구 시간을 포함하지 않음

**현장 사례**:
- 신참: 너무 싸게 부름 → 적자
- 베테랑: 경험으로 때려맞춤 → 지역 차이 무시

**SnapQuote 솔루션**:
- 우편번호별 평균가 데이터베이스
- AI가 가격 미입력 시 지역 평균 제안
- 사용자가 최종 수정 가능

#### 5. 음성 인식 실패 처리

**문제**: 
- 시끄러운 공사장에서 "P-trap" → "Peter's trap"
- 전문 용어 오인식 빈번

**SnapQuote 안전장치**:
```
[Step 1: 음성 녹음]
    ↓
[Step 2: 텍스트 확인 화면] ← 2단계 검증
- 원본 오디오 재생 버튼
- 수정 가능한 텍스트 박스
- 불확실한 단어는 🟡 하이라이트
    ↓
[Step 3: "확인" 버튼 후 AI 처리]
```

---

## Technical Architecture

### Tech Stack

#### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI
- **Icons**: Lucide React
- **PWA**: next-pwa (Progressive Web App)

#### Local Storage & Offline
- **IndexedDB**: Dexie.js (오프라인 CRUD)
- **Service Worker**: Workbox (오프라인 캐싱)
- **Sync Queue**: 충돌 방지 시스템

#### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Subscriptions (동기화 상태)
- **Storage**: Supabase Storage (사진)

#### AI & Voice
- **Speech-to-Text**: OpenAI Whisper-1
- **Text Formatting**: GPT-4o (견적 생성)
- **Custom Vocabulary**: 사용자별 전문 용어 저장

#### PDF Generation
- **Library**: @react-pdf/renderer
- **Font**: Helvetica (기본)
- **Templates**: 주별 Legal Templates

#### Payment
- **Provider**: Stripe Payment Links
- **Webhook**: 결제 완료 알림

#### Monitoring
- **Error Tracking**: Sentry (선택)
- **Analytics**: PostHog (선택)

### Database Schema

```sql
-- Profiles (사용자 프로필)
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  business_name TEXT,
  phone TEXT,
  city TEXT,                    -- 가격 책정용
  country TEXT DEFAULT 'Canada', -- 지역별 포맷팅
  tax_rate FLOAT DEFAULT 0.13,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Estimates (견적서)
CREATE TABLE estimates (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  
  -- 견적 번호
  estimate_number TEXT,         -- EST-YYYY-NNN
  
  -- 고객 정보 (별도 테이블 없이)
  client_name TEXT,
  client_address TEXT,
  client_phone TEXT,
  
  -- 견적 데이터
  items JSONB,                  -- [{description, qty, price, is_value_add}]
  total_amount NUMERIC,
  
  -- 파일
  photo_url TEXT,
  pdf_url TEXT,
  
  -- 오프라인 동기화
  synced BOOLEAN DEFAULT false,
  created_offline BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own estimates"
  ON estimates FOR SELECT
  USING (auth.uid() = user_id);
```

### Project Structure

```
/app
  /api
    /generate/route.ts          # AI 견적 생성 API
    /transcribe/route.ts        # Whisper 음성 인식 API
  /new-estimate/page.tsx        # 새 견적 생성 페이지
  /history/page.tsx             # 견적 히스토리
  layout.tsx                    # 전역 레이아웃 + metadata

/components
  audio-recorder.tsx            # 음성 녹음 컴포넌트
  estimate-pdf.tsx              # PDF 문서 생성
  pdf-preview-modal.tsx         # PDF 미리보기 모달
  legal-modal.tsx               # 법적 고지 모달
  sync-manager.tsx              # Supabase 동기화
  /ui/*                         # Shadcn UI 컴포넌트

/lib
  db.ts                         # IndexedDB 설정
  estimates-storage.ts          # 견적 CRUD
  sync.ts                       # Supabase 동기화 로직
  supabase.ts                   # Supabase 클라이언트
  openai.ts                     # OpenAI 클라이언트
  utils.ts                      # 유틸리티 함수

/public
  manifest.json                 # PWA 매니페스트
  icon-192x192.png             # 앱 아이콘
  icon-512x512.png             # 앱 아이콘
```

---

## Feature Specifications

### 1. Core Features (MVP 완료)

#### Smart Voice Record
- **음성 입력**: 큰 마이크 버튼 (120px, 장갑 고려)
- **Whisper API**: 음성 인식 (영어 우선)
- **업계 용어 힌트**: 2x4, PEX, P-trap, GFCI, Moen, Delta 등
- **오프라인 저장**: IndexedDB via Dexie.js
- **백그라운드 동기화**: 인터넷 복구 시 자동 업로드

#### Mistake Proofing (2단계 확인)
- **1차**: 음성 → 텍스트 변환 결과 표시
- **2차**: 사용자가 텍스트 에디터에서 수정 가능
- **재녹음 버튼**: 수정 버튼보다 2배 크게 (실수 인정이 더 쉽게)
- **원본 재생**: 녹음된 오디오 확인 가능

#### Magic Formatter (AI 문장 변환)
- **입력**: "싱크대 교체"
- **출력**: "Kitchen Sink Installation & Sealing with Warranty"
- **모델**: GPT-4o
- **비용**: ~$0.004/견적

#### Professional PDF Generation
- **회사 정보**: 로고, 사업체명, 연락처
- **견적 번호**: EST-YYYY-NNN 형식
- **고객 정보**: 이름, 주소, 전화번호
- **항목 테이블**: Description, Qty, Unit Price, Total
- **요약**: Subtotal, Tax, Grand Total
- **Notes**: Summary, Payment Terms, Closing Note
- **법적 고지**: Disclaimer 자동 포함
- **Trust Badges**: 라이선스 번호, 보험 가입 여부

### 2. Killer Features (유료화 핵심)

#### Deposit Request (선금 결제 링크)
- **Stripe 연동**: 결제 링크를 PDF에 삽입
- **버튼**: "Deposit 50% ($XXX)" 클릭 → 즉시 결제
- **알림**: 결제 완료 시 앱 & 이메일 알림

#### Sync Status Indicator
- **실시간 표시**: 업로드 진행 상황
- **3단계**: 로컬 저장됨 → 업로드 중 → 동기화 완료
- **충돌 방지**: 큐 시스템으로 순차 처리

#### Project Type Classification
- **Residential (기본값)**:
  - 자재: Romex, Wood Studs, PVC 등 주거용
  - 톤앤매너: 친절하고 이해하기 쉬운 설명
  
- **Commercial / Industrial**:
  - 자재: EMT/Rigid Conduit, Steel Studs, Plenum Cable 등
  - 톤앤매너: 전문적이고 시설 관리자 타겟

#### Value Stacking (무료 항목 자동 추가)
- **자동 포함** ($0, `is_value_add: true`):
  - Site Preparation & Floor Protection
  - Post-Service Safety Inspection
  - Debris Removal & Cleanup

### 3. Offline-First Architecture

#### IndexedDB Storage
```typescript
// lib/db.ts
import Dexie from 'dexie';

export class EstimateDB extends Dexie {
  estimates!: Dexie.Table<Estimate, number>;
  
  constructor() {
    super('SnapQuoteDB');
    this.version(1).stores({
      estimates: '++id, user_id, synced, created_at'
    });
  }
}

export const db = new EstimateDB();
```

#### Service Worker
- **캐싱**: App shell, 정적 리소스
- **오프라인 표시**: 📶 인디케이터
- **자동 업로드**: 온라인 복구 시

#### Sync Queue System
```typescript
// lib/sync.ts
export async function syncEstimates() {
  const unsyncedEstimates = await db.estimates
    .where('synced')
    .equals(false)
    .toArray();
    
  for (const estimate of unsyncedEstimates) {
    try {
      await supabase.from('estimates').insert(estimate);
      await db.estimates.update(estimate.id, { synced: true });
    } catch (error) {
      // 재시도 로직
    }
  }
}
```

---

## AI System Design

### System Prompt v5 LITE (Production)

**점수: 100/100** ⭐⭐⭐⭐⭐

#### Core Principles

1. **"ASSUME ALL CURRENCY IS LOCAL"**
   - 모든 숫자 = 현지 통화 (CAD/USD)
   - 환율 변환 불필요
   - "200불" or "200" → "$200.00"

2. **Professionalization**
   - "fix leak" → "Hydraulic Seal Replacement & Pressure Test"
   - "toilet broken" → "Toilet Diagnostic, Component Replacement & Calibration"

3. **Pricing Logic**
   - 가격 제공 시: 정확한 금액 사용
   - 가격 미제공 시: `unit_price = 0` + `suggested_price` 제안
   - $5,000 이상: 경고 추가

4. **Value Stacking**
   - 무료 항목 자동 추가 (`is_value_add: true`)
   - 전문성 강조

5. **Regional Formatting**
   - 캐나다: "Labour", "HST/GST applies"
   - 미국: "Labor", "Sales tax applies"

#### Full Prompt

```typescript
const SYSTEM_PROMPT_V5_LITE = `
You are an expert North American Trade Estimator.
Goal: Create a professional, high-value estimate from rough notes.

CONTEXT:
- Location: ${userProfile.city}, ${userProfile.country}
- Tax Rate: ${userProfile.taxRate}%
- Business: ${userProfile.businessName}

INPUT DATA:
- Text: Rough notes (English, Korean, mixed slang)
- Images: Optional site photos

═══════════════════════════════════════
CRITICAL INSTRUCTIONS
═══════════════════════════════════════

1. 👀 VISION ANALYSIS (If images provided):
   ✓ Identify visible Brands, Materials, and Issues.
   ⚠️ ONLY state what is factually visible. Do not guess.

2. 🌐 LANGUAGE PROCESSING:
   - The user is a professional working in North America.
   - **ASSUME ALL CURRENCY IS LOCAL (CAD/USD).**
   - Translate Korean terms to Professional English:
     "변기" → "Toilet Fixture"
     "수전" → "Faucet"
     "200불" or "200" → "$200.00"

3. ✍️ PROFESSIONALIZATION:
   ❌ "fix leak" → ✅ "Hydraulic Seal Replacement & Pressure Test"
   ❌ "toilet broken" → ✅ "Toilet Diagnostic, Component Replacement & Calibration"
   ❌ "change light" → ✅ "Fixture Removal, New LED Installation & Testing"

4. 🛡️ PRICING LOGIC:
   - IF price provided: Use EXACT number.
   - IF price missing: Set unit_price = 0 and suggest market rate.
   - IF price > $5,000: Add warning.
   - NEVER invent prices.

5. 🎁 VALUE STACKING (Auto-add $0 items):
   - "Site Preparation & Floor Protection" ($0)
   - "Post-Service Safety Inspection" ($0)
   - "Debris Removal & Cleanup" ($0)

6. 🇨🇦/🇺🇸 REGIONAL FORMATTING:
   IF Canada: "Labour", "HST/GST applies"
   IF USA: "Labor", "Sales tax applies"

OUTPUT FORMAT (JSON ONLY):
{
  "items": [
    {
      "description": "Professional description",
      "quantity": 1,
      "unit_price": 150.00,
      "is_value_add": false
    }
  ],
  "summary_note": "Concise scope summary.",
  "payment_terms": "Standard terms",
  "closing_note": "Thank you message",
  "warnings": []
}
`;
```

#### Performance Metrics

| 항목 | 수치 |
|------|------|
| **토큰 수** | ~650 |
| **비용/견적** | $0.004 |
| **응답 시간** | ~5초 |
| **정확도** | 100% |

---

## User Experience

### UX Flow: "The Parking Lot Flow"

**목표**: 기술자가 고객 집 주차장을 떠나기 전에 모든 과정이 끝나야 함

```
[1. 앱 실행]
   ↓ (오프라인 상태여도 0.3초 로딩)
   
[2. 🎤 녹음 시작]
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
   ↓ (GPT-4o가 전문 문장으로 변환)
   
[6. 최종 검토]
   ↓ (신호 대기 or 점심시간에 변환된 PDF 미리보기)
   ↓ (고객 이메일 입력)
   
[7. 전송 완료]
   ✅ "Quote sent! ☕️ 커피 한 잔 하세요."
```

### Mobile-First Design

- **버튼 크기**: 최소 80x80px (장갑 고려)
- **햅틱 피드백**: 중요한 액션마다
- **시각적 표시**: 녹음 중 파동 애니메이션
- **오프라인 인디케이터**: 📶 상태 표시
- **반응형**: 모든 화면 크기 지원

---

## Business Model

### Pricing Strategy

**경쟁 상대 재정의**:
- ❌ ServiceTitan ($399/월)
- ✅ Netflix ($15/월) + 점심값

> 기준: `lib/marketing-plans.ts`, `lib/server/usage-quota.ts`, `lib/free-tier.ts` (2026-10-22). 실제 청구액은 Stripe price ID(`STRIPE_BILLING_PRICE_*` env)에 묶여 있으니 가격 변경 시 코드와 Stripe를 함께 갱신할 것.

#### Free
- 견적 생성 3건 / 전사 3건 / 이메일 발송 3건 (월)
- 워터마크 포함 ("Created with SnapQuote")
- 기본 PDF 템플릿

#### Starter ($34/월)
- 타겟: 현장에서 스페인어·한국어로 말하고 영어 견적서가 바로 필요한 1인 사업자
- 월 견적 80건 / 전사 60분 / 이메일 발송 60건
- 로고·결제 링크 포함 브랜드 PDF 헤더
- 스페인어/한국어 음성 캡처 + 오프라인 견적 초안

#### Pro ($59/월)
- 타겟: 더 깔끔한 영어 문구, 빠른 승인, Deposit Request가 필요한 1인 사업자
- 월 견적 250건 / 전사 180분 / 이메일 발송 200건
- 영수증 스캔, 영어 견적 문구 정리, 결제 가능 견적서

#### Team ($129/월)
- 타겟: 2~10명 기술자 팀의 영어 견적 표준화
- 월 견적 800건 / 전사 600분 / 이메일 발송 600건
- 팀 공유 견적 기준, 자동화 포함, 우선 지원

### Revenue Projections

#### 월간 운영 비용
| 항목 | 비용 |
|------|------|
| Supabase | $25/월 |
| OpenAI API | $100/월 (100명 기준) |
| Vercel Hosting | $20/월 |
| Stripe 수수료 | 2.9% + $0.30 |
| **합계** | **~$180/월** |

#### 손익분기점
- Pro($59) 구독 필요 인원: **4명**
- Starter($34) 구독만이라면: **6명**

#### 6개월 수익 예측 (보수적)
| 월 | 무료 사용자 | Pro 구독 ($59) | 월 수익 | 누적 |
|-----|-------------|----------|---------|------|
| 1 | 20 | 2 | $118 | $118 |
| 2 | 50 | 5 | $295 | $413 |
| 3 | 100 | 15 | $885 | $1,298 |
| 4 | 200 | 30 | $1,770 | $3,068 |
| 5 | 350 | 50 | $2,950 | $6,018 |
| 6 | 500 | 80 | $4,720 | $10,738 |

### Additional Revenue Streams (Future)

1. **자재 제휴**: Home Depot API 연동 → 주문당 5% 커미션
2. **보험 제휴**: 기술자 배상책임보험 중개 → 가입당 $50
3. **교육 콘텐츠**: "영어 견적서 작성법" 온라인 강의 $99

---

## Go-to-Market Strategy

### Positioning

**"사무실 효율화 도구"가 아닌 "가족 시간 지킴이"**

### Core Messages

#### 권장 메시지
- ✅ "견적 작성 시간을 주당 10시간 줄이세요. 엑셀은 이제 그만."
- ✅ "말로 하면 프로 계약서가 됩니다."
- ✅ "주말에 엑셀 켜지 마세요."

#### 금지 메시지
- ❌ "최첨단 AI 음성 견적 앱입니다" (기술 중심)
- ❌ "생산성을 200% 향상시킵니다" (추상적)

### Channel Strategy

#### Online Channels

**Facebook Groups**
- 타겟: "Small Business Owners", "[도시명] Contractors"
- 콘텐츠: "엑셀 지옥에서 탈출한 썰" (스토리텔링)

**Reddit**
- r/smallbusiness, r/Plumbing, r/HVAC, r/GeneralContractor
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

### Viral Content Strategy

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

## Development Status

### v3.0 구현 완료 기능 (MVP)

#### 1. 음성 입력 시스템 ✅
- 🎤 실시간 음성 녹음 - 시각적 오디오 파형 표시
- 🔄 재녹음 기능
- 🎧 재생 기능
- 🗑️ 삭제 기능
- Whisper API 통합 (영어 우선, 업계 용어 힌트)

#### 2. 텍스트 검증 단계 ✅
- ✏️ 수정 가능한 텍스트 박스
- 🔍 2단계 확인 프로세스

#### 3. AI 견적 생성 (V5 LITE) ✅
- 📋 세부 항목화 (Parts/Labor/Service)
- 🎁 Value Stacking (무료 항목 자동 추가)
- 🌐 다국어 지원 (한글 → 영어)
- ⚠️ 안전 장치 ($5,000 이상 경고)
- 🇨🇦/🇺🇸 지역별 포맷팅

#### 4. 견적 편집 화면 ✅
- 📝 항목별 편집 (Description, Qty, Price)
- 🎨 FREE 항목 시각화
- ➕ 항목 추가/삭제
- 💾 자동 Total 계산

#### 5. PDF 생성 및 미리보기 ✅
- PDF 구성: 헤더, 고객 정보, 항목 테이블, 요약, Notes
- 미리보기 모달 (`<iframe>`)
- 다운로드 버튼
- 라이브러리: @react-pdf/renderer

#### 6. 오프라인 저장 (IndexedDB) ✅
- 📦 로컬 저장소 (Dexie.js)
- 🔄 CRUD 기능
- 📊 통계 (저장 개수, 총 금액)

#### 7. Supabase 동기화 ✅
- Background Sync (온라인 복구 시 자동 업로드)
- RLS (Row Level Security)

#### 8. 히스토리 페이지 ✅
- 📜 견적 목록 (최신순)
- 🔧 액션: View, Preview, Download, Duplicate, Delete
- 📱 모바일 최적화

#### 9. PWA 설정 ✅
- 📱 앱 설치 가능
- 🏠 홈 스크린 아이콘
- 📴 오프라인 지원

#### 10. 법적 고지 모달 ✅
- ⚖️ 첫 방문 시 표시
- ✅ 동의 후 사용 가능

### Performance Metrics

| 항목 | 수치 |
|------|------|
| **음성 → 견적 생성** | ~30초 |
| **AI 응답 시간** | ~5초 |
| **PDF 생성** | ~2초 |
| **비용/견적** | ~$0.01 |
| **오프라인 지원** | ✅ 완전 지원 |

---

## Roadmap & KPIs

### 3개월 로드맵

#### Month 1-2: PMF 검증
- 베타 사용자 50명 확보
- Week 2 Retention 60% 달성
- 핵심 버그 0건 유지

#### Month 3-4: 성장 가속
- Product Hunt 런칭
- 유료 사용자 100명 돌파
- 추가 업종 지원 (Landscaping, Cleaning)

#### Month 5-6: 스케일업
- Team Plan 출시
- 자재상 파트너십 10곳
- 월 $10K MRR 달성

### Success Metrics

#### Phase 1 (3개월)
| 지표 | 목표 |
|------|------|
| 가입자 | 100명 |
| 견적서 생성 | 500개 |
| 주간 활성 사용자 (WAU) | 30명 |
| 평균 세션 시간 | 90초 이하 |
| 오프라인 사용률 | 20% |

#### Phase 2 (6개월)
| 지표 | 목표 |
|------|------|
| 유료 전환율 | 5% |
| MRR | $500 |
| 견적 수락률 | 40% |
| 추천율 | 20% |

### Product-Market Fit Signals

- **"Would you be disappointed if this product disappeared?"**
  - 목표: 40% 이상 "Very disappointed"
- **NPS (Net Promoter Score)**
  - 목표: 50 이상
- **Weekend Usage Rate** (새로운 지표)
  - 일요일 저녁 사용률
  - 목표: 5% 이하 (높으면 문제 = 아직 집에서 일함)

### Long-term Vision

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

## Risk Management

### Technical Risks

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| Whisper API 오인식률 높음 | 높음 | 중간 | Custom Vocabulary + 텍스트 확인 단계 |
| 오프라인 동기화 충돌 | 중간 | 낮음 | Queue System + 재시도 로직 |
| 모바일 배터리 소모 과다 | 낮음 | 중간 | Background 처리 최적화 |
| AI 가격 폭등 | 중간 | 높음 | 로컬 캐싱, Web Speech API 대체 |

### Market Risks

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| 타겟 고객 지불 의사 낮음 | 높음 | 중간 | Starter 티어 가격·한도 조정 |
| ServiceTitan 등 대형 경쟁사 진입 | 높음 | 낮음 | 틈새 시장 (소규모) 집중 |
| 음성 입력 거부감 | 중간 | 중간 | 텍스트 입력 옵션 병행 |
| 타겟 시장 너무 작음 | 높음 | 중간 | 3개월 내 미달 시 일반 기술자로 확장 |

### Legal Risks

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| 계약서 양식 법적 문제 | 높음 | 낮음 | Disclaimer 강화 + 변호사 검토 |
| 사용자 간 분쟁 연루 | 중간 | 낮음 | ToS 명확화 + 중립 입장 유지 |
| 결제 사기 | 중간 | 낮음 | Stripe Radar 사기 방지 |
| 잘못된 견적 소송 | 치명적 | 낮음 | 디스클레이머 강화, 보험 가입 권장 |

### Legal Safeguards

#### 1. 건설업 라이선스 이슈
- Terms of Service에 명시: "사용자는 해당 지역 법률 준수 책임"
- PDF 하단: "Valid license required in your jurisdiction"
- 회원가입 시 체크박스: "I confirm I have proper licensing"

#### 2. 계약서 양식 법적 요구사항
- State-Specific Templates 제공
- "Legal review recommended" 워터마크
- 추후 변호사 검토 서비스 제휴 (월 $99 옵션)

#### 3. 결제 링크 법적 책임
- Disclaimer: "SnapQuote is a tool provider, not a party to any contract"
- Stripe Disputes 자동 알림
- 악용 사례 발견 시 계정 정지 정책

---

## Appendix

### A. 업종별 전문 용어

**Plumbing**
- PEX pipe, CPVC, Shut-off valve, P-trap, Sewer line

**HVAC**
- BTU, SEER rating, Ductwork, Refrigerant, Heat pump

**Electrical**
- GFCI outlet, Circuit breaker, Amperage, Grounding, Conduit

### B. FAQ

**Q: 인터넷 없어도 작동하나요?**  
A: 네! 녹음과 로컬 저장은 완전 오프라인입니다. AI 변환은 인터넷 연결 시 자동 처리됩니다.

**Q: 음성 인식 정확도는?**  
A: 조용한 환경 95%, 시끄러운 현장 85~90%. Custom Vocabulary로 전문 용어 학습 가능합니다.

**Q: 한국어도 되나요?**  
A: 한국어 녹음 → 영어 변환 기능이 AI 프롬프트에 포함되어 있습니다.

**Q: 무료로 계속 쓸 수 있나요?**  
A: 월 3건까지는 무료입니다. 그 이상은 Starter $34/월부터 구독이 필요합니다.

**Q: 이 견적서로 법적 문제 생기면?**  
A: SnapQuote는 도구 제공자일 뿐, 계약 당사자가 아닙니다. 사용자가 해당 지역 법률을 준수할 책임이 있습니다.

### C. 참고 자료

- [ServiceTitan Pricing](https://www.servicetitan.com/pricing)
- [Jobber Features](https://getjobber.com/features)
- [OpenAI Whisper Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [Stripe Payment Links](https://stripe.com/payments/payment-links)

---

## 🎯 핵심 요약 (TL;DR)

### 무엇을?
음성으로 말하면 프로페셔널 견적서 PDF가 나오는 앱

### 누구를 위해?
집에서 엑셀 쓰는 소규모 기술자/시공업체 (2-10인)

### 왜 성공할까?
1. **진짜 문제 해결**: "그림자 노동" 제거
2. **차별화**: 오프라인 + 음성 + 선금 결제
3. **적절한 가격**: Starter $34/월 (시간 절약 대비 저렴)
4. **명확한 가치**: "주당 10시간 절약"

### 현재 상태?
MVP 완료, 프로덕션 배포 완료, 베타 테스터 모집 중

### 다음 단계?
- 베타 사용자 100명 확보
- Product Hunt 런칭
- 유료화 시작 (3-6개월)

---

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

*Version: Master Specification v1.0*  
*Consolidated from: README.md, DEVELOPMENT.md, A-to-Z, v3 Final, v4 Plan, Prompt Analysis*  
*Last Updated: 2026-01-16*  
*Status: Production Ready*
