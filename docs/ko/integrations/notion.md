---
title: Notion 연동
nav_order: 2
parent: 통합
grand_parent: 🇰🇷 한국어
---

# Notion 연동

Starnion과 Notion을 연결하면 AI 에이전트가 자연어로 Notion 페이지를 검색하고, 새 페이지를 생성하고, 내용을 읽거나 추가할 수 있습니다. 회의록 작성, 아이디어 기록, 지식 베이스 검색, 데이터베이스 조회 및 관리 등에 활용할 수 있습니다.

> **API 버전:** Notion API `2025-09-03` (최신)을 사용합니다.

---

## 개요

Notion 연동을 사용하면:

- **검색**: 워크스페이스에서 페이지와 데이터베이스를 자연어로 검색
- **페이지 생성**: 제목과 본문을 포함한 새 페이지 생성
- **내용 읽기**: 페이지 ID 또는 URL로 페이지 내용 조회 및 요약
- **내용 추가**: 기존 페이지에 새 텍스트 블록 추가
- **데이터베이스 조회**: 필터·정렬 조건으로 데이터베이스 항목 조회
- **속성 업데이트**: 페이지의 Status, Date, Checkbox 등 속성 변경

> **옵트인 기능:** Notion 연동은 기본적으로 비활성화되어 있습니다. 아래 설정 절차를 완료한 후 스킬을 활성화해야 사용할 수 있습니다.

---

## 지원 기능 목록

| 도구 | 설명 |
|------|------|
| `notion_search` | 페이지 및 데이터베이스 검색 |
| `notion_page_create` | 새 페이지 생성 (본문 포함 가능) |
| `notion_page_read` | 페이지 내용 읽기 |
| `notion_block_append` | 기존 페이지에 블록 추가 |
| `notion_database_query` | 데이터베이스 항목 필터·정렬 조회 |
| `notion_page_update` | 페이지 속성(Status, Date 등) 업데이트 |

---

## 사전 준비: Notion Integration 만들기

Notion 연동은 **Integration Token** 방식을 사용합니다. Notion 워크스페이스에서 Integration을 생성하고, 접근을 허용할 페이지를 직접 지정합니다.

### 1단계: Notion Integration 생성

1. [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)에 접속합니다.
2. **+ 새 통합** (또는 **New integration**) 버튼 클릭.
3. 통합 이름을 입력합니다 (예: `Starnion`).
4. 연결할 **워크스페이스**를 선택합니다.
5. **기능(Capabilities)** 탭에서 필요한 권한을 확인·활성화합니다.

   | 권한 | 설명 | 필요 여부 |
   |------|------|----------|
   | Read content | 페이지 및 데이터베이스 읽기 | 필수 |
   | Update content | 페이지 내용 수정 | 권장 |
   | Insert content | 새 페이지 및 블록 생성 | 권장 |

6. **저장** 버튼 클릭.
7. **비밀 키** (Internal Integration Secret)를 복사합니다.

```
secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **보안 주의:** Integration 토큰은 비밀번호와 같습니다. 절대 공개하지 마세요.

### 2단계: 페이지에 Integration 연결

Notion Integration은 기본적으로 어떤 페이지에도 접근할 수 없습니다. AI가 접근해야 할 페이지나 데이터베이스에 개별적으로 접근 권한을 부여해야 합니다.

1. Notion에서 접근을 허용할 페이지를 엽니다.
2. 우측 상단 **...** (더보기) → **연결** (또는 **Connections**) 클릭.
3. 생성한 Integration 이름(예: `Starnion`)을 검색하고 선택합니다.
4. **확인**을 클릭합니다.

> **팁:** 상위 페이지에 Integration을 연결하면 하위 페이지도 자동으로 접근 가능합니다. 전체 워크스페이스에 접근하려면 최상위 페이지에 연결하세요.

---

## 설정 방법

### 웹 UI에서 Integration Token 등록

1. Starnion 웹 UI에 로그인합니다.
2. 좌측 메뉴 → **Settings** → **Integrations** 탭 클릭.
3. **Notion** 섹션에서 **Integration Token** 입력 필드를 찾습니다.
4. 복사한 비밀 키(`secret_...`)를 붙여넣습니다.
5. **저장** 버튼 클릭.
6. **Notion 스킬 활성화** 토글을 켭니다.

저장이 완료되면 토큰이 데이터베이스에 저장되고 이후 모든 Notion 요청에 사용됩니다.

---

## 사용 방법

Notion Integration이 설정되면 AI에게 자연어로 요청합니다.

### 페이지 검색

워크스페이스에서 페이지와 데이터베이스를 검색합니다.

```
나: 노션에서 "Q2 계획" 찾아줘
봇: 'Q2 계획' 검색 결과 (2개):
    📄 [페이지] 2026 Q2 사업 계획 | ID: abc123
    📄 [페이지] Q2 마케팅 계획    | ID: def456

나: 노션에서 데이터베이스만 검색해줘 (프로젝트)
봇: '프로젝트' 검색 결과 (1개):
    🗄️ [데이터베이스] 프로젝트 관리 보드 | ID: ghi789
```

필터 옵션:
- 전체 검색 (기본): 페이지와 데이터베이스 모두 검색
- `page` 필터: 페이지만 검색
- `database` 필터: 데이터베이스만 검색

> **팁:** 데이터베이스 검색 결과에는 **ID**와 **data_source_id** 두 가지가 표시됩니다. 데이터베이스 항목을 조회할 때는 `data_source_id`를 사용하세요.

### 페이지 생성

제목과 본문을 포함한 새 페이지를 생성합니다.

```
나: "2026년 3월 회의록"이라는 노션 페이지 만들어줘
봇: 노션 페이지가 생성됐어요!
    제목: 2026년 3월 회의록
    URL: https://notion.so/2026-abc123...

나: 노션에 "독서 목록" 페이지 만들고 아래 내용 써줘
    1. 원씽
    2. 아토믹 해빗
봇: 노션 페이지가 생성됐어요!
    제목: 독서 목록
    URL: https://notion.so/def456...
```

상위 페이지를 지정하여 하위 페이지로 생성할 수도 있습니다.

```
나: abc123 페이지 아래에 "회의록 2026-03-08" 페이지 만들어줘
봇: 노션 페이지가 생성됐어요!
    제목: 회의록 2026-03-08
    URL: https://notion.so/...
```

### 페이지 내용 읽기

페이지 ID 또는 URL로 내용을 조회합니다.

```
나: 노션 페이지 abc123 내용 알려줘
봇: 📄 2026 Q2 사업 계획
    URL: https://notion.so/...

    ## 목표
    - 매출 15% 성장
    - 신규 고객 20개사 이상

나: https://notion.so/프로젝트-기획서-abc123 내용 요약해줘
봇: (페이지 내용을 읽고 요약합니다.)
    이 페이지는 2026년 신규 서비스 기획서로...
```

### 기존 페이지에 내용 추가

```
나: abc123 페이지에 "액션 아이템: UI 개선 다음 주까지" 추가해줘
봇: 노션 페이지에 내용이 추가됐어요.

나: 회의록 페이지에 오늘 결정사항 추가해줘
    - 4월 런칭 확정
    - 담당자: 김철수
봇: 노션 페이지에 내용이 추가됐어요.
```

---

## 활용 예시

### 회의록 자동 정리

```
나: 방금 회의 내용 노션에 정리해줘.
    참석자: 김철수, 이영희
    주요 내용: Q2 로드맵 논의, 4월 런칭 확정
    액션 아이템: 기획서 초안 작성(김철수, ~3/15)

봇: 노션 페이지가 생성됐어요!
    제목: 2026-03-08 Q2 로드맵 회의
    URL: https://notion.so/...
```

### 아이디어 메모 저장

```
나: 방금 떠오른 아이디어 노션에 저장해줘.
    "AI 기반 일정 최적화 기능 — 사용자의 에너지 패턴을 학습해
    최적의 시간대에 중요 일정 배치"

봇: 노션 페이지가 생성됐어요!
    제목: 아이디어 메모 2026-03-08
    URL: https://notion.so/...
```

### 데이터베이스 항목 조회

```
나: 노션 Task DB에서 완료된 항목 보여줘
봇: (먼저 DB를 검색하여 data_source_id를 확인합니다.)
    데이터베이스 조회 결과 (5개):
    • 분기 보고서 작성  (ID: abc123)
      Status: Done  |  Due: 2026-03-10
    • 코드 리뷰   (ID: def456)
      Status: Done  |  Due: 2026-03-08
    ...
```

날짜 기준 정렬 조회:

```
나: 프로젝트 DB에서 마감일 빠른 순으로 할일 보여줘
봇: 데이터베이스 조회 결과 (10개):
    • API 문서 작성  Due: 2026-03-15
    • 디자인 리뷰    Due: 2026-03-18
    ...
```

### 페이지 속성 업데이트

```
나: abc123 페이지 상태를 완료로 바꿔줘
봇: ✅ 노션 페이지 속성이 업데이트됐어요.
    URL: https://notion.so/...

나: 이 할일 마감일을 3월 20일로 바꿔줘
봇: ✅ 노션 페이지 속성이 업데이트됐어요.
```

### 지식 베이스 검색 및 조회

```
나: 노션에서 API 가이드 찾아줘
봇: 'API 가이드' 검색 결과 (2개):
    📄 [페이지] 내부 REST API 가이드 v2 | ID: ...
    📄 [페이지] 외부 API 연동 체크리스트 | ID: ...

나: 내부 REST API 가이드 v2 내용 요약해줘
봇: (내용을 읽고 요약합니다.)
    이 문서는 내부 REST API 사용 방법을...
```

---

## 주의사항

### Integration 접근 범위

Notion Integration은 **명시적으로 접근 권한을 부여한 페이지와 데이터베이스에만 접근**할 수 있습니다. Integration이 연결되어 있지 않은 페이지를 조회하면 "페이지를 찾을 수 없어요" 오류가 반환됩니다.

### 페이지 내용 길이 제한

`notion_page_read`는 최대 3,000자까지 반환합니다. 내용이 더 긴 경우 "내용이 길어 잘렸어요" 메시지와 함께 앞부분만 표시됩니다.

### 페이지 최상위 생성 시 권한

상위 페이지를 지정하지 않으면 워크스페이스 최상위에 페이지가 생성됩니다. 이를 위해 Integration에 **워크스페이스 레벨의 쓰기 권한**이 필요합니다.

---

## 연결 해제 방법

1. Settings → Integrations → Notion 섹션.
2. **연결 해제** 버튼 클릭.
3. 저장된 Notion API 키가 즉시 삭제됩니다.

Notion 워크스페이스에서도 Integration 연결을 제거하려면:

1. [my-integrations](https://www.notion.so/my-integrations) → 해당 Integration 선택.
2. **Delete integration** 클릭.

---

## 문제 해결

### "노션(Notion) 연동이 되어 있지 않아요"

Settings → Integrations → Notion에서 Integration Token을 등록했는지 확인하세요. 토큰은 `secret_`으로 시작합니다.

### "Notion API 키가 유효하지 않아요" (401 오류)

- Integration 토큰이 올바른지 확인합니다.
- [my-integrations](https://www.notion.so/my-integrations)에서 토큰이 유효한지 확인합니다.
- 토큰을 새로 생성한 후 Settings에서 업데이트하세요.

### "페이지를 찾을 수 없어요" (404 오류)

- 해당 페이지에 Integration 연결이 되어 있는지 확인합니다.
- Notion에서 페이지를 열고 **...** → **연결** → Integration을 추가하세요.

### "페이지 생성 권한이 없어요" (403 오류)

- Integration의 **Insert content** 권한이 활성화되어 있는지 확인합니다.
- [my-integrations](https://www.notion.so/my-integrations)에서 해당 Integration의 기능 설정을 확인하세요.

---

## FAQ

**Q: Notion 데이터베이스 항목을 조회하거나 상태를 변경할 수 있나요?**
A: 네, 지원합니다. `notion_database_query`로 필터·정렬 조건을 걸어 항목을 조회하고, `notion_page_update`로 Status·Date·Checkbox 등 속성을 업데이트할 수 있습니다.

**Q: 여러 Notion 워크스페이스를 연결할 수 있나요?**
A: 현재는 사용자당 하나의 Integration Token만 등록됩니다. 여러 워크스페이스의 페이지에 동일한 Integration을 연결하는 방법을 사용하세요.

**Q: Integration Token은 만료되나요?**
A: Notion Internal Integration Token은 수동으로 재발급하지 않는 한 만료되지 않습니다. 단, Notion에서 해당 통합을 삭제하면 더 이상 사용할 수 없습니다.

**Q: 기존 페이지 내용을 수정(덮어쓰기)할 수 있나요?**
A: 블록 단위의 텍스트 추가는 `notion_block_append`로 지원합니다. 기존 블록 내용 수정 및 덮어쓰기는 현재 지원하지 않습니다.

**Q: Starnion이 Notion API 키를 어떻게 보호하나요?**
A: API 키는 서버 측 데이터베이스(`integration_keys` 테이블)에 저장되며, UI에는 표시되지 않습니다. HTTPS 통신을 통해서만 전송됩니다.
