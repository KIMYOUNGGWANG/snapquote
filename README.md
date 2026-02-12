# SnapQuote 🎤📄

**현장에서 음성 30초로 전문 영어 견적서 생성**

> "The Only Estimator That Works in a Basement"

---

## 🎯 What is SnapQuote?

SnapQuote은 현장 기술자(Plumbers, Electricians, Contractors)를 위한 AI 기반 견적서 생성 앱입니다.

**핵심 기능:**
- 🎤 **음성 입력** - 장갑 낀 채로 30초 녹음
- 🤖 **AI 자동 변환** - 러프한 메모 → 전문 영어 견적서
- 📄 **PDF 즉시 생성** - 고객에게 바로 전송
- 📴 **오프라인 지원** - 지하실에서도 작동

---

## 🚀 Quick Start

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일 생성:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

### 3. 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인

---

## 🏗️ Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Shadcn UI |
| **Backend** | Supabase (PostgreSQL, Auth) |
| **AI** | OpenAI GPT-4o (견적), Whisper-1 (음성) |
| **PDF** | @react-pdf/renderer |
| **Offline** | IndexedDB (Dexie.js), Service Worker |

---

## 📁 Project Structure

```
/app
  /api/generate       # AI 견적 생성 API
  /api/transcribe     # Whisper 음성 인식 API
  /new-estimate       # 새 견적 생성 페이지
  /history            # 견적 히스토리

/components
  audio-recorder.tsx  # 음성 녹음
  estimate-pdf.tsx    # PDF 생성
  pdf-preview-modal   # PDF 미리보기

/lib
  db.ts               # IndexedDB 설정
  supabase.ts         # Supabase 클라이언트
```

---

## 📖 Documentation

- [Product Requirements (PRD)](./PRODUCT_REQUIREMENTS_DOCUMENT.md)
- [Master Specification](./MASTER_SPECIFICATION.md)
- [Automation Expansion PRD](./AUTOMATION_PRD.md)
- [Platform Expansion Plan (Activepieces)](./SNAPQUOTE_PLATFORM_EXPANSION_PLAN.md)
- [Development Status](./DEVELOPMENT.md)

---

## 📝 License

MIT

---

**Made with ❤️ for Trade Professionals**
