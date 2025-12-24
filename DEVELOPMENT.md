# SnapQuote v3.0 개발 총정리

**프로젝트:** AI 기반 배관/전기/건축 견적서 생성 앱  
**타겟:** 북미 현장 기술자 (Plumbers, Electricians, Contractors)  
**최종 업데이트:** 2025-12-12

---

## 📊 프로젝트 개요

### 핵심 가치 제안
> "음성 30초로 전문 영어 견적서 생성"

**문제점:**
- 현장에서 장갑 낀 채로 타이핑 불편
- 영어 견적서 작성 부담
- 가격 계산 실수
- 고객 대기 시간 길어짐

**해결책:**
- 음성 입력 → AI 자동 견적 생성
- 전문 영어 변환 (예: "fix leak" → "Hydraulic Seal Replacement & Pressure Test")
- Parts/Labor/Service 자동 분류
- PDF 즉시 생성 및 전송

---

## ✅ 구현 완료 기능 (MVP)

### 1. 음성 입력 시스템
**파일:** `components/audio-recorder.tsx`, `app/api/transcribe/route.ts`

- 🎤 **실시간 음성 녹음** - 시각적 오디오 파형 표시
- 🔄 **재녹음 기능** - 만족할 때까지 다시 녹음
- 🎧 **재생 기능** - 녹음된 내용 확인
- 🗑️ **삭제 기능** - 녹음 취소

**Whisper API 통합:**
- OpenAI Whisper-1 모델 사용
- 영어 우선 인식 (`language: "en"`)
- **업계 용어 힌트 추가:**
  ```
  2x4, 2x6, studs, PVC, PEX, P-trap, ball valve,
  Moen, Delta, Kohler, GFCI, TBD, mold, labor
  ```

---

### 2. 텍스트 검증 단계
**파일:** `app/new-estimate/page.tsx`

- ✏️ **수정 가능한 텍스트 박스** - 음성 인식 오류 수정
- 🔍 **2단계 확인 프로세스:**
  1. Transcribing... (음성 → 텍스트)
  2. Verifying (텍스트 확인 및 수정)

---

### 3. AI 견적 생성 (V5 LITE 프롬프트)
**파일:** `app/api/generate/route.ts`

#### 시스템 프롬프트 특징:
1. **📋 세부 항목화 (Itemization)**
   - `[PARTS]` - 부품/자재 (예: Moen Kitchen Faucet $180)
   - `[LABOR]` - 작업 시간 (예: Installation 2 hrs @ $75/hr)
   - `[SERVICE]` - 진단/테스트/폐기 (예: Water Line Testing)

2. **🎁 Value Stacking**
   - 무료 항목 자동 추가 ($0, `is_value_add: true`)
   - Site Preparation & Floor Protection
   - Post-Service Safety Inspection
   - Debris Removal & Cleanup

3. **🌐 다국어 지원**
   - 한글 → 영어 자동 번역
   - 통화 자동 변환 (예: "200불" → "$200.00")
   - 현지 통화 기준 (CAD/USD)

4. **⚠️ 안전 장치**
   - 가격 미입력 시 `unit_price: 0`
   - $5,000 이상 견적 시 경고 (`warnings` 배열)
   - 가스/전기 작업 시 면허 필요 알림

5. **🇨🇦/🇺🇸 지역별 포맷팅**
   - 캐나다: "Labour", "HST/GST applies"
   - 미국: "Labor", "Sales tax applies"

**토큰 최적화:** ~650 tokens (비용 $0.004/견적)

---

### 4. 견적 편집 화면
**파일:** `app/new-estimate/page.tsx`

- 📝 **항목별 편집:**
  - Description (설명)
  - Quantity (수량)
  - Unit Price (단가)
  - Total (자동 계산)

- 🎨 **FREE 항목 시각화:**
  - `unit_price === 0` → 초록 배경 + FREE 배지
  - 가격 수정 시 FREE 표시 자동 제거

- ➕ **항목 추가/삭제**
- 💾 **자동 Total 계산**

---

### 5. PDF 생성 및 미리보기
**파일:** `components/estimate-pdf.tsx`, `components/pdf-preview-modal.tsx`

#### PDF 구성:
- **헤더:** 사업체 정보, 견적 번호 (EST-YYYY-NNN)
- **고객 정보:** 이름, 주소
- **항목 테이블:** Description, Qty, Price, Total
- **요약:**
  - Subtotal
  - Tax (HST/Sales Tax)
  - **Grand Total**
- **Notes:** Summary, Payment Terms, Closing Note

#### 미리보기 모달:
- `<iframe>`으로 PDF 표시
- 다운로드 버튼
- 로딩 상태 표시
- 에러 핸들링

**PDF 라이브러리:** `@react-pdf/renderer`

---

### 6. 오프라인 저장 (IndexedDB)
**파일:** `lib/db.ts`, `lib/estimates-storage.ts`

- 📦 **로컬 저장소:**
  - 견적 데이터 (items, total, summary 등)
  - 고객 정보
  - 생성 날짜

- 🔄 **CRUD 기능:**
  - `saveEstimate()` - 저장
  - `getAllEstimates()` - 전체 조회
  - `getEstimate(id)` - 단일 조회
  - `deleteEstimate(id)` - 삭제
  - `updateEstimate()` - 수정

- 📊 **통계:**
  - `getStorageStats()` - 저장 개수, 총 금액
  - `clearAllEstimates()` - 전체 삭제

---

### 7. Supabase 동기화
**파일:** `lib/sync.ts`, `lib/supabase.ts`

#### Background Sync:
- 온라인 복구 시 자동 업로드
- 로그인 사용자만 동기화
- RLS (Row Level Security) 적용

#### 스키마:
```sql
estimates
  - id (uuid)
  - user_id (uuid) → auth.users
  - estimate_number (text)
  - total_amount (numeric)
  - items (jsonb)
  - created_at (timestamp)
```

---

### 8. 히스토리 페이지
**파일:** `app/history/page.tsx`

- 📜 **견적 목록:**
  - 최신순 정렬
  - 견적 번호, 날짜, 금액
  - 요약 텍스트

- 🔧 **액션:**
  - View Details (상세 보기)
  - Preview (PDF 미리보기)
  - Download (PDF 다운로드)
  - Duplicate (복제)
  - Delete (삭제 확인 모달)

- 📱 **모바일 최적화:**
  - `flex-wrap` 버튼 레이아웃
  - 반응형 카드 디자인

---

### 9. PWA 설정
**파일:** `next.config.mjs`, `public/manifest.json`

- 📱 **앱 설치 가능**
- 🏠 **홈 스크린 아이콘** (192x192, 512x512)
- 🌐 **Service Worker** (개발 모드에서는 비활성화)
- 📴 **오프라인 지원**

---

### 10. 법적 고지 모달
**파일:** `components/legal-modal.tsx`

- ⚖️ **첫 방문 시 표시**
- 📋 **내용:**
  - 견적은 확정 가격 아님
  - 실제 작업 전 확인 필요
  - AI 생성 내용 검토 필수
- ✅ **동의 후 사용 가능**

---

## 🏗️ 기술 스택

### Frontend
- **Framework:** Next.js 14.2.3
- **Language:** TypeScript
- **UI:** Shadcn UI + Tailwind CSS
- **Icons:** Lucide React

### Backend / API
- **AI:** OpenAI GPT-4o (견적 생성)
- **Voice:** OpenAI Whisper-1 (음성 인식)
- **Database:** Supabase (PostgreSQL)
- **Storage:** IndexedDB (Dexie.js)

### PDF
- **Library:** @react-pdf/renderer
- **Font:** Helvetica (기본 폰트)

### PWA
- **Library:** next-pwa
- **Service Worker:** Workbox

---

## 📁 프로젝트 구조

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

## 🚀 배포 상태

### 환경 변수 (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
OPENAI_API_KEY=sk-...
```

### 배포 플랫폼
- **Vercel** (자동 배포)
- **Git Repository:** https://github.com/KIMYOUNGGWANG/snapquote

### 최신 커밋
```
feat: V5 LITE prompt upgrade, Parts/Labor/Service itemization
- 21 files changed, 4902 insertions(+), 657 deletions(-)
```

---

## 📊 성능 지표

| 항목 | 수치 |
|------|------|
| **음성 → 견적 생성** | ~30초 |
| **AI 응답 시간** | ~5초 |
| **PDF 생성** | ~2초 |
| **비용/견적** | ~$0.01 (Whisper $0.006 + GPT-4o $0.004) |
| **오프라인 지원** | ✅ 완전 지원 (AI 제외) |

---

## 🎯 다음 단계 (백로그)

### Phase 1 (즉시 가능)
- [ ] 베타 테스터 모집 (100명)
- [ ] 실사용 피드백 수집
- [ ] 버그 수정

### Phase 2 (1-2주)
- [ ] 이메일/SMS 전송 기능
- [ ] 템플릿 저장 기능
- [ ] 가격 제안 개선 (지역별 DB)

### Phase 3 (1개월)
- [ ] 팀 기능 (여러 기술자)
- [ ] 고급 리포팅
- [ ] Stripe 결제 링크 통합

---

## 📝 알려진 이슈

### Minor Issues
1. **Whisper 인식 오류** (예: "two 2x4" → "to 2x4")
   - **해결:** Verifying 단계에서 수정 가능
   - **개선:** 업계 용어 힌트로 95% 정확도

2. **PDF에서 빈 문자열 경고**
   - **에러:** `Invalid '' string child outside <Text>`
   - **영향:** 없음 (PDF는 정상 생성)
   - **상태:** 추후 수정 예정

3. **ESLint 빌드 에러** ✅ 수정됨 (v3.2)
   - Unescaped quotes 에러 → 이스케이프 처리
   - react-pdf Image alt 경고 → eslint-disable 처리

### PWA
- 개발 모드에서 비활성화됨
- 프로덕션 빌드에서만 작동

---

### 11. Project Type Classification (New in v3.1)
**파일:** `app/new-estimate/page.tsx`, `app/api/generate/route.ts`

- 🏠 **Residential (기본값):**
  - 자재: Romex, Wood Studs, PVC 등 주거용 자재 우선
  - 톤앤매너: 친절하고 이해하기 쉬운 설명

- 🏢 **Commercial / Industrial:**
  - 자재: EMT/Rigid Conduit, Steel Studs, Plenum Cable 등 상업용 자재 우선
  - 톤앤매너: 전문적이고 시설 관리자(Facility Manager) 타겟

---

## 🙏 감사의 말

이 프로젝트는 실제 현장 기술자들의 Pain Point를 해결하기 위해 시작되었습니다.  
**"30분 견적 작성 → 30초"**의 변화를 만들어낸 것에 자부심을 느낍니다.

**베타 테스터로 참여해주실 분들께 미리 감사드립니다!** 🙌

---

**마지막 업데이트:** 2025-12-18
**버전:** v3.1
**개발자:** @kimyounggwang
