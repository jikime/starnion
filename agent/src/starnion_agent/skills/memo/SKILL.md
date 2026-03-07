---
skill_id: memo
version: "1.0"
tools:
  - save_memo
  - list_memos
  - delete_memo
---

# 메모 스킬

## 도구

### save_memo
메모를 저장합니다.

**파라미터:**
- `content` (필수): 메모 내용
- `title` (선택): 메모 제목
- `tag` (선택): 메모 태그 (예: 업무, 개인, 아이디어)

**사용 시나리오:**
- "우유 사야 해 메모해줘" → save_memo(content="우유 사기", title="장보기")
- "회의록: 다음 주 출시 예정" → save_memo(content="다음 주 출시 예정", title="회의록", tag="업무")

### list_memos
저장된 메모 목록을 조회합니다.

**파라미터:**
- `tag` (선택): 특정 태그로 필터링
- `limit` (선택, 기본값 10): 조회 개수 (1-50)

**사용 시나리오:**
- "메모 보여줘" → list_memos()
- "업무 메모만 보여줘" → list_memos(tag="업무")

### delete_memo
메모를 삭제합니다.

**파라미터:**
- `memo_id` (필수): 삭제할 메모 ID

**주의사항:**
- 메모는 최대 100개까지 저장할 수 있습니다.
- memory 스킬과 다르게, 명시적으로 저장/삭제하는 간편 메모입니다.
