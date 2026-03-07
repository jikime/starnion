# 하이브리드 검색 (Hybrid Search: Vector + Full-Text + RRF)

## 개요

기존 pgvector 기반 벡터 유사도 검색에 PostgreSQL 내장 Full-Text Search를 추가하고,
Reciprocal Rank Fusion(RRF)으로 두 결과를 합쳐 검색 품질을 향상시킨다.

**문제**: 의미적으로 유사한 결과는 잘 찾지만, 정확한 키워드(카테고리명, 금액, 날짜 등)로 검색할 때 누락 발생.

**해결**: Vector Search (의미 매칭) + Full-Text Search (키워드 매칭) → RRF Merge

---

## 아키텍처

```
Query: "지난주 식비"
  │
  ├─▶ embed_text() → 768-dim vector
  │     ├─ daily_logs.search_similar()       (의미 매칭)
  │     ├─ knowledge_base.search_similar()
  │     └─ document_sections.search_by_user()
  │
  ├─▶ plainto_tsquery('simple', query)
  │     ├─ daily_logs.search_fulltext()       (키워드 매칭)
  │     ├─ knowledge_base.search_fulltext()
  │     └─ document_sections.search_fulltext_by_user()
  │
  └─▶ RRF Merge (k=60)
        ├─ 소스별 vector + fulltext 결과를 RRF로 합산
        ├─ 정규화 (0~1 스케일)
        └─ 전체 소스 병합 → top_k 반환
```

### 검색 파이프라인 상세

```
retriever.search(query, user_id)
  │
  ├─ embed_text(query)  →  768-dim vector
  │
  ├─ asyncio.gather (7개 쿼리 병렬 실행)
  │   ├─ daily_log.search_similar()          # vector
  │   ├─ daily_log.search_fulltext()         # fulltext
  │   ├─ knowledge.search_similar()          # vector
  │   ├─ knowledge.search_fulltext()         # fulltext
  │   ├─ document.search_by_user()           # vector
  │   ├─ document.search_fulltext_by_user()  # fulltext
  │   └─ finance.get_recent()                # text (no embedding)
  │
  ├─ Per-source RRF merge
  │   ├─ _rrf_merge(log_vec, log_ft)     → log_merged
  │   ├─ _rrf_merge(kb_vec, kb_ft)       → kb_merged
  │   └─ _rrf_merge(doc_vec, doc_ft)     → doc_merged
  │
  ├─ Source tagging (daily_log, knowledge, document, finance)
  │
  └─ Global sort by similarity → top_k
```

---

## 핵심 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| tsvector 설정 | `'simple'` | 한국어 형태소 분석기 불필요. 공백 기준 토큰화로 한영 혼용 처리 |
| tsvector 채움 | Trigger (`BEFORE INSERT OR UPDATE`) | `GENERATED ALWAYS` 불가 (`to_tsvector`는 `stable`, `immutable` 아님). 기존 repo 함수 변경 불필요 |
| RRF 구현 위치 | Python (`retriever.py`) | SQL CTE보다 단순하고 유연, 소스별 가중치 조정 용이 |
| RRF 상수 k | 60 | 원 논문(Cormack et al., 2009) 표준값 |
| 쿼리 변환 | `plainto_tsquery()` | 특수문자 안전, AND 조합, 한영 혼용 처리 |
| 병렬 실행 | `asyncio.gather` (7개 쿼리) | 기존 순차 실행 대비 지연시간 대폭 단축 |
| 외부 인터페이스 | 변경 없음 | `retriever.search()` 시그니처 불변 → tools/memory.py 수정 불필요 |

---

## RRF (Reciprocal Rank Fusion) 알고리즘

```python
RRF_K = 60  # 상수

# 각 결과 리스트에서:
score(doc) = Σ 1 / (k + rank + 1)

# rank: 0-based 순위
# 두 리스트에 모두 존재하면 점수 합산 (가산적)
# 최종 정규화: score / max_score → [0, 1]
```

**예시**:
```
Vector 결과:  [A(1위), B(2위), C(3위)]
Fulltext 결과: [B(1위), D(2위), A(3위)]

A: 1/(60+0+1) + 1/(60+2+1) = 0.01639 + 0.01587 = 0.03226
B: 1/(60+1+1) + 1/(60+0+1) = 0.01613 + 0.01639 = 0.03252  ← 최고
C: 1/(60+2+1) = 0.01587
D: 1/(60+1+1) = 0.01613

→ B > A > D > C (양쪽 모두 등장한 B가 최상위)
```

---

## DB 스키마 변경

### 추가된 칼럼

3개 테이블에 `content_tsv tsvector` 칼럼 추가:

```sql
-- daily_logs
ALTER TABLE daily_logs ADD COLUMN content_tsv tsvector;

-- knowledge_base
ALTER TABLE knowledge_base ADD COLUMN content_tsv tsvector;

-- document_sections
ALTER TABLE document_sections ADD COLUMN content_tsv tsvector;
```

### GIN 인덱스

```sql
CREATE INDEX idx_daily_logs_content_tsv ON daily_logs USING gin(content_tsv);
CREATE INDEX idx_knowledge_base_content_tsv ON knowledge_base USING gin(content_tsv);
CREATE INDEX idx_document_sections_content_tsv ON document_sections USING gin(content_tsv);
```

### 트리거 함수

| 테이블 | 소스 필드 | tsvector 생성 로직 |
|--------|-----------|---------------------|
| `daily_logs` | content | `to_tsvector('simple', content)` |
| `knowledge_base` | key + value | `to_tsvector('simple', key \|\| ' ' \|\| value)` |
| `document_sections` | content | `to_tsvector('simple', content)` |

트리거는 `BEFORE INSERT OR UPDATE`로 동작하여 기존 INSERT/UPDATE 코드 변경 불필요.

---

## 변경 파일 목록

### New Files

| File | Description |
|------|-------------|
| `docker/migrations/002_add_fulltext_search.sql` | tsvector 칼럼, GIN 인덱스, 트리거, 기존 데이터 백필 |

### Modified Files

| File | Changes |
|------|---------|
| `docker/init.sql` | 3개 테이블에 `content_tsv` 칼럼, GIN 인덱스, 트리거 함수/트리거 추가 |
| `agent/src/jiki_agent/db/repositories/daily_log.py` | `search_fulltext()` 함수 추가 |
| `agent/src/jiki_agent/db/repositories/knowledge.py` | `search_fulltext()` 함수 추가 |
| `agent/src/jiki_agent/db/repositories/document.py` | `search_fulltext_by_user()` 함수 추가 |
| `agent/src/jiki_agent/memory/retriever.py` | `_rrf_merge()` + `asyncio.gather` 병렬 실행 + RRF 합산으로 전면 재작성 |

### 변경 없는 파일

`tools/memory.py`, `graph/agent.py`, `embedding/service.py`, `db/repositories/finance.py` — 외부 인터페이스 불변

---

## Before vs After

| 항목 | Before | After |
|------|--------|-------|
| 검색 방식 | Vector only | Vector + Full-Text + RRF |
| 쿼리 실행 | 순차 4개 | 병렬 7개 (`asyncio.gather`) |
| "식비" 키워드 | 의미적 유사도에 의존 | tsvector 정확 매칭 + 벡터 보완 |
| "지난주 기분" 의미 검색 | 잘 동작 | 동일하게 잘 동작 (벡터 유지) |
| 결과 합산 | similarity 단순 정렬 | RRF (양쪽 등장 시 가산) |
| 새 Python 의존성 | - | 없음 (PostgreSQL 내장 기능만 사용) |

---

## 배포 가이드

### 기존 환경 (마이그레이션 필요)

```bash
psql -U jiki -d jiki -f docker/migrations/002_add_fulltext_search.sql
```

마이그레이션이 수행하는 작업:
1. `content_tsv tsvector` 칼럼 추가 (3개 테이블)
2. GIN 인덱스 생성 (3개)
3. 트리거 함수 + 트리거 생성 (3세트)
4. 기존 데이터 백필 (`WHERE content_tsv IS NULL`)

### 신규 환경

`docker/init.sql`에 이미 포함되어 있어 별도 작업 불필요.

---

## 검증 방법

### 1. 트리거 확인

```sql
INSERT INTO daily_logs (user_id, content) VALUES ('test_user', '오늘 점심 식비 만원');
SELECT content_tsv FROM daily_logs WHERE user_id = 'test_user' ORDER BY id DESC LIMIT 1;
-- 결과: '만원':5 '식비':4 '오늘':1 '점심':3
```

### 2. Full-text 검색 확인

```sql
SELECT content, ts_rank(content_tsv, plainto_tsquery('simple', '식비')) AS rank
FROM daily_logs
WHERE content_tsv @@ plainto_tsquery('simple', '식비')
ORDER BY rank DESC;
```

### 3. Telegram에서 retrieve_memory 테스트

- "식비" 같은 키워드 검색 → 벡터+키워드 결과 모두 포함 확인
- "지난주 기분" 같은 의미 검색 → 기존과 동일하게 동작 확인
- 양쪽 모두에서 발견된 결과가 상위에 랭크되는지 확인

---

**상태**: ✅ 구현 완료
**날짜**: 2026-03-02
