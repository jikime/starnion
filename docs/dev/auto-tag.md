# 자동 태깅 (Auto-Tagging)

## 개요

일기나 메모가 저장될 때 사용자의 LLM을 활용해 핵심 태그를 자동으로 추출하고 `content_tags` 오버레이 테이블에 저장하는 시스템.

**문제**: 사용자가 일기/메모를 저장할 때마다 수동으로 태그를 입력해야 하는 번거로움. 과거 기록을 주제별로 찾아볼 방법 부재.

**해결**: 저장 시점에 LLM이 내용을 분석해 태그를 자동 추출. 기존 테이블 구조를 변경하지 않고 별도 오버레이 테이블(`content_tags`)에 저장. fire-and-forget 방식으로 응답 지연 없음.

---

## 아키텍처

```
사용자: "오늘 친구들이랑 카페 갔어. 기록해줘."
  │
  └─ save_daily_log() 또는 save_diary_entry()
       ├─ diary_entries 테이블 INSERT  ← 즉시 완료, 사용자에게 응답
       └─ schedule_auto_tag(user_id, "diary", entry_id, title, content)
            └─ asyncio.create_task(_do_auto_tag(...))  ← 백그라운드 실행

_do_auto_tag() [백그라운드]
  ├─ provider_repo: 사용자 LLM 설정 조회 (provider, model, api_key)
  ├─ LLM.ainvoke("핵심 태그 3~7개 추출...")
  │     → "친구, 카페, 커피, 수다, 일상, 즐거움"
  └─ content_tags 테이블 UPSERT

사용자: "카페 태그가 달린 일기 보여줘"
  └─ search_by_tags(tags=["카페"], source="diary")
       └─ content_tags 조회 → diary_entries 내용 조회 → 결과 반환
```

---

## 파일 구조

```
agent/src/starnion_agent/
├── skills/memory/
│   ├── auto_tag.py              # 태그 추출 서비스 (핵심)
│   └── tools.py                 # search_by_tags 도구
└── db/repositories/
    └── content_tags.py          # DB CRUD
```

---

## 핵심 컴포넌트

### `auto_tag.py` — 태그 추출 서비스

#### `schedule_auto_tag()` — 진입점

```python
def schedule_auto_tag(
    user_id: str,
    source: Literal["diary", "memo"],
    source_id: int,
    title: str,
    content: str,
) -> None:
```

도구(tool)에서 호출하는 공개 함수. 현재 실행 중인 event loop에 `create_task`로 비동기 작업을 등록하고 즉시 반환한다. 실패해도 예외를 전파하지 않는다.

**호출 시점:**
- `save_daily_log()` — 일상 기록 저장 후
- `save_diary_entry()` — 구조화된 일기 저장 후
- `save_memo()` — 메모 저장 후

#### `_do_auto_tag()` — 실제 처리 로직

```python
async def _do_auto_tag(user_id, source, source_id, title, content) -> None:
```

1. `provider_repo.get_default_persona_with_provider(pool, user_id)` — 사용자 LLM 설정 조회
2. `_make_llm(prov, model, api_key, base_url)` — LLM 인스턴스 생성
3. `llm.ainvoke(prompt)` — 태그 추출 (최대 500자 truncation)
4. `tags_repo.upsert_tags(pool, user_id, source, source_id, tags)` — DB 저장
5. 모든 단계에서 예외 발생 시 `logger.debug()` 로그만 남기고 무시 (non-critical)

**프롬프트:**
```
다음 내용에서 핵심 태그를 3~7개 추출해주세요.
태그는 한국어 단어나 짧은 구문으로 작성하고 쉼표로 구분해 반환하세요.
다른 설명 없이 태그만 반환하세요.

내용: {text}

태그:
```

**태그 후처리:**
- 쉼표 구분 파싱
- `#` prefix 제거
- 최대 20자 초과 태그 제거
- 최대 7개 보존

#### `_make_llm()` — 독립적 LLM 팩토리

`graph/agent.py`의 `_make_llm`을 복제한 독립 함수. 순환 임포트(`auto_tag` ← `agent` ← `diary/tools` ← `auto_tag`)를 방지하기 위해 별도 구현.

지원 프로바이더: `anthropic`, `gemini`, `openai`, `zai`, `custom`

---

### `content_tags` 테이블 — DB 스키마

```sql
CREATE TABLE content_tags (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    source      TEXT        NOT NULL CHECK (source IN ('diary', 'memo')),
    source_id   BIGINT      NOT NULL,
    tag         TEXT        NOT NULL,
    auto_tagged BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, source_id, tag)
);

CREATE INDEX idx_content_tags_user_tag ON content_tags(user_id, tag);
CREATE INDEX idx_content_tags_source   ON content_tags(source, source_id);
```

**설계 원칙:**
- `diary_entries`, `memos` 테이블을 수정하지 않는 **오버레이 구조**
- `(source, source_id, tag)` 유니크 제약으로 중복 삽입 방지 (`ON CONFLICT DO NOTHING`)
- `auto_tagged` 플래그로 AI 생성 태그 vs 수동 태그 구분 (향후 수동 태그 추가 대비)

---

### `content_tags.py` — DB 레포지토리

| 함수 | 설명 |
|------|------|
| `upsert_tags(pool, user_id, source, source_id, tags, auto_tagged=True)` | 태그 목록 INSERT, 중복은 무시 |
| `get_tags_for(pool, source, source_id)` | 특정 항목의 태그 목록 조회 (알파벳순) |
| `search_by_tags(pool, user_id, tags, source=None, limit=20)` | OR 조건 태그 검색, `DISTINCT ON`으로 중복 제거 |
| `delete_tags_for(pool, source, source_id)` | 항목 삭제 시 연계 태그 정리 |

#### `search_by_tags` 쿼리 전략

```sql
SELECT DISTINCT ON (source, source_id)
       source, source_id, tag, created_at
FROM content_tags
WHERE user_id = %s
  AND LOWER(tag) = ANY(%s)   -- 대소문자 무시 OR 매칭
  [AND source = %s]          -- 선택적 source 필터
ORDER BY source, source_id, created_at DESC
LIMIT %s
```

- `LOWER(tag) = ANY(array)` — 대소문자 무시, 다중 태그 OR 검색
- `DISTINCT ON (source, source_id)` — 같은 항목이 여러 태그 매칭 시 중복 제거

---

### `search_by_tags` 도구 (`skills/memory/tools.py`)

```python
@tool(args_schema=SearchByTagsInput)
@skill_guard("memory")
async def search_by_tags(tags: list[str], source: str = "", limit: int = 10) -> str:
```

**입력:**
- `tags`: 검색할 태그 목록 (1개 이상 필수)
- `source`: `'diary'`, `'memo'`, 또는 빈 문자열(전체)
- `limit`: 최대 결과 수 (1~30)

**처리 흐름:**
1. `content_tags` 테이블에서 태그 매칭 항목 조회
2. 조회 결과에서 `diary` IDs, `memo` IDs 분리
3. `diary_repo.list_entries()`, `memo_repo.list_memos()` 호출로 내용 스니펫 병렬 조회
4. 포맷팅 후 반환

**예시 응답:**
```
🏷️ #카페, #친구 검색 결과 (2건)

  📔 [일기] 2026/03/10 친구들과 카페에서 커피 마시고 즐거웠다.: 친구들과 카페에서 커피를...
  📔 [일기] 2026/03/08 아내, 현지와 함께: 메가커피에서 바닐라라떼를...
```

---

## 통합 지점

### 일기 도구 (`skills/diary/tools.py`)

```python
from starnion_agent.skills.memory.auto_tag import schedule_auto_tag

# save_daily_log(): 저장 후
diary_row = await diary_entry_repo.list_entries(pool, user_id, limit=1)
if diary_row:
    schedule_auto_tag(user_id, "diary", diary_row[0]["id"], title, content)

# save_diary_entry(): 저장 후
schedule_auto_tag(user_id, "diary", entry["id"], title, content)
```

### 메모 도구 (`skills/memo/tools.py`)

```python
from starnion_agent.skills.memory.auto_tag import schedule_auto_tag

# save_memo(): 저장 후
schedule_auto_tag(user_id, "memo", memo["id"], memo["title"], content)
```

---

## 설계 결정

### Fire-and-Forget 방식 선택

LLM API 호출은 수 초가 걸릴 수 있어, 도구 응답을 블로킹하면 UX가 나빠진다. `asyncio.create_task()`로 백그라운드에 위임해 사용자 응답은 즉시 반환하고 태그는 수 초 내 비동기로 저장된다.

### 순환 임포트 방지

```
graph/agent.py
  └─ skills/diary/tools.py    (imports)
       └─ skills/memory/auto_tag.py   (needs LLM)
            └─ graph/agent.py ?      ← 순환!
```

`auto_tag.py`에 독립적인 `_make_llm()` 함수를 중복 구현해 순환을 제거했다. LLM 캐시는 공유하지 않지만, 태그 추출은 저빈도 작업이므로 허용 가능한 트레이드오프.

### 오버레이 테이블 전략

`diary_entries`나 `memos`에 `tags TEXT[]` 컬럼을 추가하는 대신 별도 테이블을 사용:
- 마이그레이션 없이 기존 DB에 적용 가능
- 태그별 인덱스 최적화 가능
- `auto_tagged` 플래그로 AI/수동 구분
- 향후 다른 소스 타입 확장 용이

---

## 로그 예시

```
# 성공
[INFO] auto_tag: auto_tag: diary/4 → ['친구', '카페', '커피', '수다', '일상', '즐거움']

# 실패 (LLM 미설정 등) — DEBUG 레벨, 서비스 영향 없음
[DEBUG] auto_tag: auto_tag failed (non-critical)
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `agent/src/starnion_agent/skills/memory/auto_tag.py` | 태그 추출 서비스 |
| `agent/src/starnion_agent/skills/memory/tools.py` | `search_by_tags` 도구 |
| `agent/src/starnion_agent/db/repositories/content_tags.py` | DB CRUD |
| `agent/src/starnion_agent/skills/diary/tools.py` | 일기 저장 시 호출 |
| `agent/src/starnion_agent/skills/memo/tools.py` | 메모 저장 시 호출 |
| `docker/init.sql` | `content_tags` 테이블 DDL |
