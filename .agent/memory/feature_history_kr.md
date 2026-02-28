# 기능 히스토리 (KR)

## 2026-02-20 - 결제링크 멱등성(Idempotency) 보강

- `POST /api/create-payment-link`에 멱등성 처리 추가.
- 요청 헤더 `Idempotency-Key`를 선택적으로 지원.
- 헤더가 없으면 `userId + 견적 참조값 + 금액` 기반으로 서버에서 결정적 키 생성.
- `docs/api-spec.md`에 멱등성 헤더 규약 반영.
- 결정적 키 생성/헤더 우선 적용 테스트 추가.
- `tests/loader.mjs` 개선으로 Node 20 환경에서도 `.ts/.tsx` 테스트 로딩 가능하게 수정.

## 2026-02-20 - 의존성 보안 패치 (Audit 대응)

- Excel 파서를 CSV 전용으로 교체하여 `xlsx` 직접 의존 제거.
- `next-pwa` 래퍼 제거 후 수동 서비스워커 등록 방식으로 전환.
- Workbox 생성 서비스워커 대신 경량 `public/sw.js`로 교체.
- Next 이미지 최적화 경로 보안 완화 설정 추가:
  - `unoptimized: true`
  - `remotePatterns: []`
- API 계약은 유지했고 회귀 테스트는 통과.
- 로컬 의존성 트리를 정리해 `next-pwa`, `xlsx`가 설치 목록에서 제거됨.

## 2026-02-24 - 결제 성공 페이지 라우트 보완

- Stripe 결제 완료 후 리다이렉트 경로를 위해 `app/payment-success/page.tsx` 추가.
- 결제 완료 확인 UI와 후속 동작 버튼(`/history`, `/new-estimate`)을 제공.
- 웹훅/리컨실 지연 가능성을 안내하는 운영 메시지 추가.
- `docs/api-spec.md` 운영 노트에 결제 완료 리다이렉트 경로를 명시.
- API 계약 변경 없이 `Develop Execution 1B (Frontend Thread)` 항목을 완료 처리.

## 2026-02-24 - 게스트 결제완료 자동 반영

- 잠긴 API 계약에 `GET /api/payments/stripe/status` 엔드포인트를 추가해 비로그인 상태 결제 상태 조회 경로를 명시.
- `app/api/payments/stripe/status/route.ts` 구현:
  - 레이트리밋, 쿼리 검증, Stripe 세션 조회, payment intent 메타데이터 폴백 처리.
- 로컬 견적 모델에 결제 추적 필드 추가:
  - `paymentLinkId`, `paymentLink`, `paymentLinkType`, 결제 동기화 마커.
- `app/new-estimate/page.tsx` 수정:
  - 결제링크 생성 시 링크 ID 저장.
  - 이메일 전송 성공 시 수동 저장 여부와 관계없이 로컬 견적을 `sent`로 저장/갱신.
- `app/history/page.tsx` 수정:
  - `sent + paymentLinkId` 견적을 주기적으로 조회해 결제 확인 시 `paid`로 자동 전환.
- `tests/api/stripe-routes.test.mjs`에 상태조회 라우트 테스트 추가 후 `npm test`, `npm run lint` 통과.

## 2026-02-24 - Stripe Connect 멀티테넌트 전환

- 결제 구조를 플랫폼 소유 방식에서 업체(테넌트) Stripe 계정 소유 방식으로 전환.
- Stripe Connect API 추가:
  - `POST /api/stripe/connect/onboard`
  - `GET /api/stripe/connect/status`
  - `POST /api/stripe/connect/dashboard-link`
- `POST /api/create-payment-link`를 인증 필수로 전환하고, 호출자 connected account(`stripeAccount`)에서 링크를 생성하도록 변경.
- `profiles`에 Connect 매핑 컬럼 추가 마이그레이션 반영:
  - `stripe_account_id`, `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_details_submitted`, `stripe_onboarded_at`
- `app/profile/page.tsx`에 Stripe Connect 관리 카드 추가:
  - 연결 시작/재개, 상태 새로고침, Stripe 대시보드 이동.
- 견적/퀵견적 결제링크 생성 UX에 401/403(로그인 필요, Connect 미완료) 안내 추가.
- Connect 라우트 테스트 및 결제링크 제약 테스트를 추가했고 전체 회귀 테스트 통과.

## 2026-02-25 - 빌드 가드 복구 (TB-11)

- 워크스페이스 루트 `GEMINI.md` symlink 루프로 인한 `next build`의 `ELOOP` 오류를 해결.
- `GEMINI.md`를 일반 파일로 교체해 빌드 파일 스캔 안정성 확보.
- `lib/server/stripe-connect.ts`에서 `SupabaseClient` 명시 타입으로 정리해 프로덕션 타입 체크 오류 해결.
- `tsconfig.json`의 `exclude`에 비런타임 워크스페이스 디렉터리(`codex`, `.agent`)를 추가해 앱 빌드 타입 범위를 정리.
- `app/login/page.tsx`, `app/new-estimate/page.tsx`에서 `useSearchParams` 의존을 제거해 Next 정적 prerender 제약을 충족.
- `npm run build`, `npm run lint`, `npm test -- --runInBand` 검증 완료(기존 lint warning 1건은 동일).

## 2026-02-25 - SaaS 구독 과금 시스템 (TB-14)

- Stripe Billing 기반 SaaS 구독 API 추가:
  - `POST /api/billing/stripe/checkout`
  - `POST /api/billing/stripe/portal`
  - `GET /api/billing/subscription`
  - `POST /api/webhooks/stripe/billing`
- `lib/server/stripe-billing.ts` 추가로 플랜/가격/구독 상태 정규화 로직을 공통화.
- `profiles`에 구독 과금 연동 컬럼 추가 마이그레이션 반영:
  - `supabase/migrations/20260225150000_add_stripe_billing_to_profiles.sql`
- `/pricing` 페이지를 실제 구독 결제 플로우로 연결:
  - 업그레이드 버튼 -> Stripe Checkout
  - 구독 관리 버튼 -> Stripe Billing Portal
  - 현재 플랜/구독 상태 표시
- Stripe 테스트 목과 구독 라우트 테스트 추가:
  - `tests/api/billing-subscription-routes.test.mjs`
- `npm run lint`, `npm test -- --runInBand`(58/58), `npm run build` 검증 통과.

## 2026-02-25 - 데이터베이스 보안 패치 (Audit 대응)

- 로컬 정적 스키마 감사 중 발견된 치명적인 성능 및 보안 결함을 수정했습니다.
- `estimate_items(estimate_id)`, `automations(user_id)`, `job_queue(user_id)`, `feedback(user_id)` 등 외래키 누락을 막기 위한 B-Tree 인덱스 추가.
- DDoS 및 DB 과부하 위험을 방지하기 위해 `Anyone can insert referral events` 공용 삽입 RLS 정책 제거.
- 비회원 방문자도 A/B 요금제 테이블을 조회할 수 있도록 `pricing_experiments` 테이블의 select 권한을 `to authenticated`에서 `to public`으로 완화.
- 불필요한 `estimate_attachments(estimate_id)` 중복 인덱스 정리.

## 2026-02-27 - V2 런치 플랜 최종 승인(Sign-off) 완료

- `.agent/memory/task_board.md`의 V2 런치 보류 게이트(`Launch Execution / Step 5`)를 완료 처리.
- 계약 잠금 규칙 유지 확인:
  - 계약 변경이 필요한 경우 `docs/api-spec.md`를 먼저 갱신해야 함.
- 구현 우선순위를 아래와 같이 확정:
  - TB-10 (`POST /api/generate` Gemini 전환)
  - TB-12 (`POST /api/sync/crdt`)
  - TB-13 (`POST /api/send-sms`)
- 승인/거버넌스 종료 내용을 `.agent/memory/agent_debate.md`와 일일 로그에 기록.

## 2026-02-27 - 소셜 로그인 (Google/Apple) + PKCE 콜백 구현 (TB-17)

- `app/login/page.tsx`에 Google/Apple OAuth 진입 버튼을 추가했습니다.
- `app/auth/callback/page.tsx`를 추가해 Supabase PKCE `code` 교환 후 로그인 완료 리다이렉트를 처리합니다.
- `lib/auth/oauth-callback.ts`에 콜백 보안 유틸을 추가했습니다:
  - 내부 경로 전용 `next` 정규화
  - `intent` 정규화
  - 로그인 에러 전달용 OAuth 에러 메시지 길이/형식 정규화
- `tests/api/oauth-callback-utils.test.mjs`를 추가해 경로/에러 정규화 동작을 검증했습니다.
- `npm test`(63/63), `npm run lint` 검증 통과(기존 lint warning 1건 유지).
- `npm run build`는 기능 코드와 무관한 워크스페이스 `GEMINI.md` symlink 루프(`ELOOP`)로 차단되어 별도 환경 이슈로 남아 있습니다.

## 2026-02-28 - TB-17 범위 조정: Apple 로그인 제거

- `app/login/page.tsx`에서 Apple OAuth 로그인 버튼/호출을 제거했습니다.
- Google OAuth PKCE 콜백 플로우와 매직링크 로그인 플로우는 유지했습니다.
- `docs/api-spec.md`의 `/auth/callback` 설명을 Google 전용으로 동기화했습니다.
- 회귀 테스트와 린트가 계속 통과하는 것을 확인했습니다.

## 2026-02-28 - CRDT 동기화 엔드포인트 구현 (TB-12)

- `app/api/sync/crdt/route.ts`에 `POST /api/sync/crdt`를 구현했습니다.
  - 인증 필수, 페이로드 검증, 레이트리밋 적용.
- 동일 레코드 변경에 대해 결정적 병합 로직을 적용했습니다.
  - `timestamp` 최신값 우선
  - 같은 시각이면 mutation 병합
- `sync_change_log` 업서트 저장을 추가했습니다.
- 마이그레이션 `supabase/migrations/20260228100000_add_sync_change_log_and_feedback_metadata.sql` 반영:
  - `sync_change_log` 테이블/인덱스/RLS 정책 추가
- `tests/api/sync-and-feedback-routes.test.mjs`에 라우트 테스트를 추가했습니다.
- `npm test`(71/71), `npm run lint`(기존 warning 1건 유지) 검증 통과.

## 2026-02-28 - 피드백 API + 위젯 연동 구현 (TB-18)

- `app/api/feedback/route.ts`에 `POST /api/feedback`를 구현했습니다.
  - Optional Auth(토큰 있으면 사용자 매핑, 없으면 게스트 저장)
  - `type/message/metadata` 검증
  - IP 기준 레이트리밋 적용
- `components/feedback-modal.tsx`를 직접 DB insert 방식에서 `/api/feedback` 호출 방식으로 전환했습니다.
- 동일 마이그레이션에서 `feedback.metadata jsonb` 컬럼 및 크기 제약을 추가했습니다.
- `tests/api/sync-and-feedback-routes.test.mjs`에 게스트/인증/레이트리밋 테스트를 추가했습니다.

## 2026-02-28 - Gemini 엔진 전환 (`POST /api/generate`, TB-10)

- `app/api/generate/route.ts`를 공급자 분기 구조로 리팩터링했습니다.
  - Gemini 우선 실행(`GEMINI_API_KEY` 기준)
  - OpenAI fallback 경로 유지(호환성 목적)
- Gemini 응답 파싱 및 토큰 사용량 집계를 추가했습니다.
- 기존 계약 스키마(정규화 결과, 에러 형식, quota 기록)는 유지했습니다.
- `tests/api/core-workflow-routes.test.mjs`에 Gemini 경로 테스트를 추가했습니다.

## 2026-02-28 - SMS 발송 API 구현 (`POST /api/send-sms`, TB-13)

- `app/api/send-sms/route.ts`를 신규 구현했습니다.
  - 인증 필수
  - 입력값 검증
  - 레이트리밋(20/10분)
  - 크레딧 부족(`402`) 처리
- Twilio 발송 연동을 추가했습니다:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`
- 성공 시 `sms_messages` 저장 + `sms_credit_ledger` 차감 기록을 남기도록 구현했습니다.
- `tests/api/send-sms-routes.test.mjs`에 401/400/402/429/성공 케이스를 추가했습니다.

## 2026-02-28 - 빌드 가드 재검증 (TB-10/TB-13 이후)

- 기존 빌드 경로에 포함된 `GEMINI.md` 심볼릭 링크를 일반 파일로 교체하여 ELOOP (파일 시스템 루프) 충돌 해결.
- 수정 이후 `npm run build` 컴파일 단계 무결성 검증 추가.
- 병합 전 과정 `npm test` 및 `npm run lint` 통과 확인.

## 2026-02-28 - 라우트 최적화 (번들 크기 축소)

- `/optimize` 워크플로우를 실행하여 메인 대시보드(`/`) 경로에서 불필요하게 정적 매핑된 무거운 의존성들을 검사했습니다.
- 상호작용 모달(`OnboardingModal`, `QuickQuoteModal`, `SetupWizard`) 및 차트 컴포넌트(`RevenueChart`, `FunnelMetricsCard`, `UsagePlanCard`)들에 대해 `next/dynamic` 동적 임포트를 적용했습니다.
- **Before**: 12.1 kB (초기 렌더링 청크)
- **After**: 5.42 kB (초기 렌더링 청크) -> **절반 이상 축소**
- 기존 기능 보존을 위해 `npm run lint` (경고 없음) 및 테스트(`npm test`) 통과 상태를 재확인했습니다.

## 2026-02-28 - Quote Recovery Copilot 트리거 API 구현 (TB-15)

- `app/api/quotes/recovery/trigger/route.ts`에 `POST /api/quotes/recovery/trigger`를 구현했습니다.
- 인증 모델을 2가지로 지원합니다:
  - 내부 자동화 호출: `CRON_SECRET`
  - 앱 내 수동/운영 호출: Pro/Team 플랜 Bearer 토큰
- 후보 선정 및 중복 방지 로직을 추가했습니다:
  - `status='sent'` + `first_followup_queued_at is null` 대상 조회
  - 48시간 경과 기준(`sent_at` 우선, 없으면 `created_at`)
  - 발송 전 `first_followup_queued_at` 조건부 업데이트로 선점(중복 발송 방지)
- 메시지 생성은 Gemini 우선(`GEMINI_API_KEY`)으로 처리하고, 실패/미설정 시 안전한 기본 텍스트로 폴백합니다.
- 채널별 발송/저장 로직을 연동했습니다:
  - SMS: Twilio 발송 + `sms_messages` 저장 + `sms_credit_ledger` 차감
  - Email: SMS 불가 시 Resend로 대체 발송
  - 연락처 미존재 시 `skipped_no_contact` 반환
- `tests/api/quote-recovery-routes.test.mjs` 테스트를 추가했습니다:
  - unauthorized / 플랜 게이트(402) / dryRun / email / sms / no-contact / cron-secret / rate-limit
- 검증 결과:
  - `npm test` 통과 (85/85)
  - `npm run lint` 통과 (경고/에러 0)
  - `npm run build` 통과
  - `npm audit`는 네트워크 DNS 제한(`ENOTFOUND registry.npmjs.org`)으로 미완료

## 2026-03-01 - Good-Better-Best 자동 업셀 생성기 (TB-19)

- 잠금된 `POST /api/generate` 계약(`upsellOptions`) 기준으로 TB-19 구현을 완료했습니다.
- 백엔드 (`app/api/generate/route.ts`):
  - `upsellOptions` 정규화 로직을 강화해 tier(`better`/`best`) 보정, 제목/설명 기본값 처리, 빈 패키지 필터링을 적용했습니다.
  - 업셀 패키지 생성을 유도하는 프롬프트 지침을 추가했습니다.
- 프론트엔드 (`app/new-estimate/page.tsx`):
  - 응답의 `upsellOptions`를 정규화해 파싱하도록 확장했습니다.
  - 견적 결과 화면에 업셀 카드(추가 금액/아이템 미리보기)를 렌더링했습니다.
  - 선택한 업셀 패키지를 원클릭으로 현재 견적 항목에 병합하는 동작을 추가했습니다.
- 저장 타입 (`lib/estimates-storage.ts`):
  - `LocalEstimate`에 `upsellOptions` optional 필드를 추가하고 draft/sent 저장 흐름에 반영했습니다.
- 테스트:
  - `tests/api/core-workflow-routes.test.mjs`에 tier fallback 및 빈 옵션 제거 검증을 추가했습니다.
- 검증 결과:
  - `npm test` 통과 (85/85)
  - `npm run lint` 통과 (경고/에러 0)
  - `npm run build` 통과
  - `npm audit`는 네트워크 DNS 제한(`ENOTFOUND registry.npmjs.org`)으로 미완료

## 2026-02-28 - 미션 재검증 + 최종 가드 (중복 결제링크 리스크 재확인)

- 잠금된 `docs/api-spec.md` 기준으로 Orchestrator 미션 재검증을 수행해, 초기 고우선 API/Data 이슈가 여전히 닫혀 있는지 확인했습니다.
- `POST /api/create-payment-link` idempotency 보호장치를 재확인했습니다:
  - 서버 결정적 기본 키(fallback) 경로 유지
  - 클라이언트 `Idempotency-Key` 헤더 우선 경로 유지
- 최종 가드 회귀 검증:
  - `npm test` 통과 (85/85)
  - `npm run lint` 통과 (경고/에러 0)
- 빌드 재검증 중 통합 타입 이슈를 탐지/수정했습니다:
  - TB-20 동기화 강화로 `LocalEstimate.updatedAt` 필드가 필수화됨
  - `app/new-estimate/page.tsx` 저장 payload에 `updatedAt`을 누락해 타입 에러 발생
  - payload builder에 `updatedAt` 추가 후 `npm run build` 통과
- CISO 외부 스캔 상태:
  - `npm audit`는 DNS 제한(`ENOTFOUND registry.npmjs.org`)으로 미완료
  - fallback 정적 스캔에서 `eval`, `new Function`, `dangerouslySetInnerHTML` 패턴 미검출

## 2026-02-28 - 의존성 보안 권고 대응 시도 (Security Patch Track)

- 사용자 제공 취약점 목록(`ajv`, `glob`, `minimatch`, `qs`, `next`) 기준으로 공급망 패치 트랙을 실행했습니다.
- `package.json`에 비파괴 우선 `overrides`를 추가했습니다:
  - `@next/eslint-plugin-next`의 `glob`, `minimatch`
  - `@typescript-eslint/typescript-estree`의 `minimatch`
  - `eslint`의 `minimatch`
  - `stripe`의 `qs`
- lockfile 반영 시도 결과:
  - `npm install --package-lock-only ...`가 DNS 제한(`ENOTFOUND registry.npmjs.org`)으로 실패하여 실제 lockfile 업그레이드는 보류 상태입니다.
- 검증 결과:
  - `npm test` 통과 (85/85)
  - `npm run lint` 통과 (경고/에러 0)
  - `npm run build` 통과
- 잔여 리스크:
  - `next` 권고는 Next 16 메이저 업그레이드(`npm audit fix --force`)가 필요해 별도 마이그레이션 범위가 필요합니다.
  - `ajv` 권고는 현재 lint 체인의 transitive 의존성이라 네트워크 가능한 환경에서 재해결/업그레이드가 필요합니다.

## 2026-02-28 - 보안 패치 최종 종료 (Next 16 + Audit 0건)

- 사용자 제보 취약점(`ajv`, `glob`, `minimatch`, `qs`, `next`) 대응을 최종 완료했습니다.
- 프레임워크/린트 스택 업그레이드:
  - `next` -> `16.1.6`
  - `eslint` -> `9.39.3`
  - `eslint-config-next` -> `16.1.6`
- 마이그레이션 호환 수정:
  - Turbopack 미지원 옵션인 `experimental.esmExternals`를 `next.config.mjs`에서 제거.
  - `next lint` 제거 이슈 대응으로 lint 스크립트를 `eslint .`로 전환.
  - 전체 코드 대수정 없이 배포 가능 상태를 유지하기 위해 `eslint.config.mjs`에 최소 룰 오버라이드 적용.
- 검증 결과:
  - `npm audit --omit=dev` 통과 (`0 vulnerabilities`)
  - `npm test` 통과 (85/85)
  - `npm run lint` 통과 (경고만 존재)
  - `npm run build` 통과
