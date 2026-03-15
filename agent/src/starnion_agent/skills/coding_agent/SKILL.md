---
name: 코딩 에이전트
description: Claude Code CLI로 코딩 작업을 위임합니다. 새 기능 구현, 코드 리뷰, 리팩토링, 테스트 작성에 사용하세요.
keywords: ["코딩", "coding", "claude code", "구현", "implement", "코드 작성", "리팩토링", "refactor", "테스트", "test", "코드 생성", "コーディング", "编程", "코드"]
---

# 코딩 에이전트 (coding_agent)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `run_coding_agent` | Claude Code CLI로 코딩 작업 실행 (최대 120초) |

## run_coding_agent 사용 지침

- **써야 할 때**: 새 기능/앱 구현, 리팩토링, 단위 테스트 작성, README 생성, 버그 수정 등 파일을 읽고 쓰는 코딩 작업
- **쓰지 말 것**: 한 줄짜리 단순 수정(직접 수정), 코드 읽기만 할 때(read tool 사용)
- `task`: 자연어로 작업을 상세히 설명 — 구체적일수록 결과가 좋습니다
- `workdir`: 작업 디렉토리 절대 경로 (생략 시 사용자 전용 임시 디렉토리 자동 생성)
- 제한 시간: 120초 / 복잡한 작업은 단계별로 나눠서 요청하세요

### 사용 시나리오

```
"Python으로 할일 관리 CLI 만들어줘"
→ run_coding_agent(task="Python으로 할일 관리 CLI를 만들어줘. add/list/done 명령을 지원하고 JSON 파일에 저장해줘")

"이 프로젝트에 단위 테스트 추가해줘"
→ run_coding_agent(task="기존 함수들에 대한 pytest 단위 테스트를 작성해줘", workdir="/path/to/project")

"README 작성해줘"
→ run_coding_agent(task="프로젝트를 분석해서 README.md를 작성해줘. 설치 방법, 사용법, 예시 포함", workdir="/path/to/project")

"auth 모듈 리팩토링해줘"
→ run_coding_agent(task="auth 모듈을 리팩토링해줘. 중복 코드를 줄이고 가독성을 높여줘", workdir="/path/to/project")
```

## 응답 스타일

- Claude Code의 실행 결과를 그대로 전달
- 오류 발생 시 원인과 해결 방법 안내
- 작업이 복잡하면 단계를 나눠서 순서대로 실행 권장
- `workdir` 생략 시 자동 생성된 임시 경로를 사용자에게 알려주세요
