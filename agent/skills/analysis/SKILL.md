---
name: analysis
display_name: AI 분석
description: Manually trigger AI analysis — conversation insights, spending patterns, memory compaction. Runs automatically on schedule; only invoke when user explicitly requests an analysis or memory update.
version: 2.0.0
emoji: "📊"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 분석해줘
    - 인사이트
    - 패턴
    - 요약해줘
    - 메모리 업데이트
    - 대화 분석
    - 지출 패턴
    - 통계
    - 리포트
    - analysis
    - insight
    - pattern
    - summarize
    - memory update
    - weekly report
  when_to_use:
    - User explicitly requests an AI analysis or insights report
    - User asks to update or compact memory
    - User asks for spending pattern analysis or conversation summary
    - User says "분석해줘" or "인사이트 보여줘"
  not_for:
    - Automatic scheduled analysis (runs on its own cron schedule)
    - Real-time data queries (use finance or memory skill instead)
---

# AI Analysis (Manual Trigger)

Analysis runs **automatically on schedule**. Only trigger manually when the user explicitly asks.

| User intent | Type | Schedule (auto) |
|---|---|---|
| User wants analysis of today's conversations or daily insights | `conversation` | Daily 23:00 |
| User wants spending pattern analysis or expense insights | `patterns` | Daily 06:00 |
| User wants memory compaction or old diary cleanup | `compact` | Weekly Mon 05:00 |

## Manual trigger via agent API

The scheduler exposes `triggerAnalysis(type, userId)` — but this is a TypeScript function,
not a CLI script. To manually trigger from conversation, use the gateway admin endpoint
or restart the agent service (scheduler runs automatically on bind).

> **Note**: Results appear in the `AI 기억` menu after the job completes.
> Data is stored in `knowledge_base` table with keys:
> - `conversation:analysis:YYYY-MM-DD`
> - `pattern:analysis_result`
> - `memory:weekly_summary:YYYY-Www`
