# User Feedback - Real Estimator Insights
> Date: 2026-01-18

## Summary
실제 현장 Estimator로부터 받은 피드백. 전문적인 견적 시스템으로 발전하기 위한 핵심 개선점들.

---

## 1. 🔢 Labour Pricing 방식 개선

**현재**: Qty × Unit Price (단순 계산)  
**요청**: **Qty / Unit / Unit Price** 포맷 (업계 표준)

### Unit 옵션 예시
| Unit | 의미 | 사용 예 |
|------|------|---------|
| `ea` | Each (개당) | 부품 |
| `LS` | Lump Sum (일괄) | 소규모 작업 |
| `hr` | Hour (시간당) | 노무 |
| `SF` | Square Foot | 면적 작업 |
| `LF` | Linear Foot | 배관/케이블 |

**우선순위**: 🔴 높음 (핵심 기능)

---

## 2. 📎 원본 데이터 보존

**현재**: Summary note만 저장  
**요청**: 사진, 음성 원본 파일도 견적에 첨부 보관

**목적**:
- Dispute prevention (분쟁 시 증거)
- 나중에 확인 용이

**우선순위**: 🟡 중간

---

## 3. 🏷️ Category 컬럼 분리

**현재**: Description에 `[PARTS]`, `[LABOR]` prefix 포함  
**요청**: 별도 Category 컬럼으로 분리

```
Before: "[PARTS] Kitchen Faucet"
After:  Category: PARTS | Description: Kitchen Faucet
```

**우선순위**: 🟡 중간

---

## 4. 🔢 Item Number

**요청**:
- 각 항목에 Item # 부여
- 순서 변경(재정렬) 가능

**우선순위**: 🟢 낮음 (UX 개선)

---

## 5. 📁 Division 기반 그룹핑

**현재**: 모든 Parts 먼저 → 모든 Labor 뒤에  
**요청**: **CSI Division** 기준 그룹핑 (Parts + Labor 혼합)

### CSI Division 예시
- Div 3: Concrete (콘크리트 자재 + 노무 함께)
- Div 9: Finishes
- Div 15: Mechanical
- Div 16: Electrical

**목적**: 대형 공사 확장성  
**우선순위**: 🟡 중간 (Scale-up 대비)

---

## 6. 📊 Excel 파일 Import

**요청**: 사진 외에 Excel 파일 업로드 → 견적 생성

**우선순위**: 🟢 낮음 (Nice-to-have)

---

## 7. 📅 Daily Use 기능 (Scope 확장)

**요청**:
- 영수증 보관 (Receipt storage)
- 본인/직원 근무 시간 기록 (Time tracking)

**효과**: Trade 외 일반 사용자도 활용 가능

**우선순위**: 🔵 향후 (Scope 확장)

---

## 구현 우선순위 정리

| # | 기능 | 난이도 | 우선순위 | 비고 |
|---|------|--------|----------|------|
| 1 | Qty/Unit/Unit Price | 중 | 🔴 높음 | 업계 표준 필수 |
| 3 | Category 컬럼 분리 | 하 | 🔴 높음 | 1번과 함께 구현 |
| 2 | 원본 데이터 보존 | 중 | 🟡 중간 | Dispute 대비 |
| 5 | Division 그룹핑 | 상 | 🟡 중간 | 대형 공사 대비 |
| 4 | Item # 순서 변경 | 하 | 🟢 낮음 | UX |
| 6 | Excel Import | 중 | 🟢 낮음 | Nice-to-have |
| 7 | Daily 기능 | 상 | 🔵 향후 | Scope 확장 |
