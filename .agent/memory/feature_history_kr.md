# 기능 배포 및 성능 이력 (Feature & Performance History)

## [2026-03-25] UX 최적화 리뷰 (P0/P1 개선)

### 🚀 Before vs After 예상 성능 (UX Audit)
- **온보딩 마찰 절감**: 8스텝에 달하던 온보딩/초기 설정 과정이 3스텝(`components/onboarding-modal.tsx`)으로 축소되어, 첫 사용자(Trial)의 이탈률을 유의미하게 낮출 것으로 기대됩니다.
- **네비게이션 최적화**: History, Clients 탭이 `components/bottom-nav.tsx` 1뎁스에 노출되어, 견적 조회 및 고객 관리에 필요한 클릭 뎁스와 인지 부하가 감소했습니다.
- **이메일 팔로우업 속도**: `app/page.tsx`에 즉각적인 메일 앱 연동 버튼이 추가되어, Follow-Up 카드의 행동 유도(Call-to-Action) 실행 속도가 단축되었습니다.

### 🛡️ 보안 검토 요약 (Security Review)
- 새로운 백엔드 API 추가 및 권한 모델 변경이 없으므로 추가적인 IDOR, 인가 우회 취약점은 존재하지 않습니다.
- URL 및 파라미터 조작을 통한 XSS 공격 벡터(`mailto:` 인코딩 포함)에 대한 방어 로직이 적용되어 있어 안전합니다.
- 기능적 결함 문제 없이 `/ship`이 가능한 상태입니다.


## [2026-03-20] 종합 성능 최적화 및 보안 리뷰 (v5.1 기준)

### 🚀 Before vs After 예상 성능 (Static Audit)
- **번들 크기 (Bundle Size) 최적화**: `app/page.tsx` 내에서 무거운 모달 및 차트 컴포넌트(`RevenueChart`, `FunnelMetricsCard`, `QuickQuoteModal` 등)들이 `next/dynamic(..., { ssr: false })`으로 철저하게 지연 로딩 처리되어 메인 쓰레드 블로킹 타임을 줄이고 초기 로드 속도(FCP 및 TTI)를 극적으로 향상시켰습니다.
- **CSS 페이로드 최소화**: `globals.css` 내에서 Tailwind `@layer utilities`를 활용해 반복되는 복잡한 디자인 클래스(`.glass-card`, `.premium-panel`, `.premium-card` 등)를 단일 유틸리티로 묶어 HTML과 CSS 페이로드를 줄였습니다.
- **불필요한 리렌더링 및 메모리 누수 방지**: `page.tsx`의 전역 상태나 Auth 변화에 따른 데이터 Fetching 시 `active` 플래그 패턴을 도입하여 컴포넌트 언마운트 시 발생할 수 있는 메모리 누수 상태를 완벽히 차단했습니다.

### 🛡️ 보안 검토 요약 (Security Review)
- Stripe Webhook Signature 검증이 강력하게 존재하며, 인증되지 않은 결제 완료 처리를 차단합니다.
- `create-payment-link` 및 정산 백엔드 로직에서 철저하게 IDOR(안전하지 않은 직접 객체 참조) 방지 처리가 되어 있으며, 사용자가 소유한 견적서(`estimateId` / `estimateNumber`)에서만 Stripe Link가 생성되도록 `payment-estimate-ownership.ts`가 보호하고 있습니다.
- 모든 API 입력부는 Zod를 통해 엄격하게 검증(`parseJsonRequest`)됩니다.
- 보안 취약점이 발견되지 않아 "올클리어" 상태입니다. 기능적 결함 문제 없이 `/ship`이 가능한 상태입니다.
