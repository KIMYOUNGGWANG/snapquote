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
