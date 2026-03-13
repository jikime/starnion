# SPEC Documents Directory

이 디렉토리는 EARS 형식의 SPEC 문서를 저장합니다.

## Directory Structure

```
.jikime/specs/
├── README.md                    # This file
└── SPEC-{DOMAIN}-{NUMBER}/      # SPEC document directory
    ├── spec.md                  # EARS requirements
    ├── plan.md                  # Implementation plan
    └── acceptance.md            # Acceptance criteria
```

## SPEC ID Format

- **Pattern**: `SPEC-{DOMAIN}-{NUMBER}`
- **Domain**: Uppercase letters (AUTH, USER, API, DB, UI, PERF, SEC, etc.)
- **Number**: 3-digit zero-padded (001, 002, etc.)

### Examples

```
SPEC-AUTH-001/   # Authentication feature
SPEC-USER-002/   # User management feature
SPEC-API-003/    # API endpoint feature
```

## Creating a New SPEC

Use the `/jikime:1-plan` command:

```bash
# Create new SPEC
/jikime:1-plan Add user authentication

# Specify domain
/jikime:1-plan --domain AUTH Add JWT login

# Use existing SPEC
/jikime:1-plan SPEC-AUTH-001
```

## 3-File Structure

### spec.md (Requirements)

EARS format specification:
- Metadata (ID, Title, Status, Priority)
- Environment and Assumptions
- Requirements (5 EARS patterns)
- Specifications and Traceability

### plan.md (Implementation Plan)

- Milestones by priority
- Technical approach
- Implementation phases
- Risks and mitigations

### acceptance.md (Acceptance Criteria)

- Success criteria
- Test scenarios (Given-When-Then)
- Quality gates
- Definition of Done

## EARS Patterns

1. **Ubiquitous**: 시스템은 항상 [동작]해야 한다
2. **Event-driven**: WHEN [이벤트] THEN [동작]
3. **State-driven**: IF [조건] THEN [동작]
4. **Unwanted**: 시스템은 [동작]하지 않아야 한다
5. **Optional**: 가능하면 [동작]을 제공한다

## Workflow

```
/jikime:1-plan  → Creates SPEC in this directory
        ↓
/jikime:2-run SPEC-XXX → Implements based on SPEC
        ↓
/jikime:test SPEC-XXX → Tests implementation
        ↓
/jikime:3-sync SPEC-XXX → Syncs documentation
```

## Important Rules

1. **No Flat Files**: `.jikime/specs/SPEC-*.md` 단일 파일 금지
2. **3-File Required**: 모든 SPEC은 3파일 구조 필수
3. **EARS Format**: 요구사항은 EARS 패턴 사용
4. **Unique IDs**: SPEC ID는 고유해야 함

---

Version: 1.0.0
Last Updated: 2026-01-22
