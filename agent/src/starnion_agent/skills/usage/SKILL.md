---
name: 사용량 조회
description: AI 사용 통계 — 요청 수, 토큰, 비용, 모델별/일별 분석
keywords: ["사용량", "usage", "비용", "cost", "토큰", "token", "얼마", "사용했어", "사용했어?", "썼어", "모델", "model", "통계", "statistics"]
---

# 사용량 조회 (usage)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `get_usage_summary` | AI 사용 통계 조회 (요약 / 모델별 / 일별) |

## get_usage_summary 사용 지침

### 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `days` | 30 | 조회 기간 (1~90일) |
| `mode` | summary | `summary` · `model` · `daily` |

### 모드별 반환 내용

| mode | 반환 내용 |
|------|-----------|
| `summary` | 총 요청 수, 성공률, 사용 토큰, 총 비용, 사용 모델 수 |
| `model` | 모델별 요청 수 · 토큰 · 비용 (비용 내림차순 Top 10) |
| `daily` | 일별 요청 수 · 토큰 · 비용 · 오류 수 (최대 30일) |

## 사용 시나리오

```
"이번 달 AI 비용 얼마야?"
→ get_usage_summary(days=30, mode="summary")

"오늘 몇 번 대화했어?"
→ get_usage_summary(days=1, mode="summary")

"어떤 모델을 가장 많이 썼어?"
→ get_usage_summary(days=30, mode="model")

"지난 7일 일별 사용량 보여줘"
→ get_usage_summary(days=7, mode="daily")

"3개월치 모델별 비용 분석해줘"
→ get_usage_summary(days=90, mode="model")
```

## 응답 스타일

- 비용은 `$0.0000` (소수 4자리) 형식
- 토큰은 `1.2K` / `3.5M` 등 단위 변환
- 일별 모드에서 오류가 있으면 ⚠️ 표시
