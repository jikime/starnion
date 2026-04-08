# StarNion Skill Development Conventions

## Output Prefix Protocol

The agent harness inspects skill output to determine success or failure.
**All skill scripts must follow this prefix convention.**

### Success output
Any output that does NOT start with `❌` is treated as success.

```
📔 오늘의 한마디 저장됨 (2026-04-08)
  ★★ 좋은 하루였어
```

### Soft error (exit 0 with error message)
Start the first line of stdout with `❌` when the operation fails but the
process should exit cleanly (e.g. validation errors, missing input).

```python
print("❌ 날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요.")
sys.exit(0)   # or sys.exit(1) — both are detected
```

The middleware (`SkillTrackingMiddleware`) will set `is_error: true` for the
tool result, signalling the LLM to report failure instead of success.

### Hard error (exit non-zero)
Use `sys.exit(1)` for unrecoverable errors (DB connection failure, missing
environment variables). The harness detects non-zero exit codes and sets
`is_error: true` automatically.

```python
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)
```

---

## SKILL.md `description` Format

The `description` frontmatter field drives two features:

1. **Skill index** shown to the LLM (compact routing hint)
2. **Dynamic scoping** — keyword extraction for per-message skill filtering

### Required format
```yaml
description: "One-line summary of what this skill does. Use for: keyword1, keyword2, 한국어키워드, keyword3"
```

- The `Use for:` suffix is **mandatory** for skills that handle specific user intents.
- Keywords are comma-separated; the first 4 are shown in the compact index.
- Skills with **no** `Use for:` keywords are always included (treated as general-purpose).
- Keep the full description (before `Use for:`) under 120 characters.

### Example
```yaml
description: "Record and query income/expense transactions. Use for: 가계부, 지출, 수입, 얼마 썼어, 이번 달 지출"
```

---

## Environment Variables

All skill scripts receive these environment variables via the exec harness:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `MINIO_*` | Object storage credentials (if skill uses files) |
| `<PROVIDER>_API_KEY` | Third-party API keys configured by the user |

Never hardcode credentials. Always read from environment.
