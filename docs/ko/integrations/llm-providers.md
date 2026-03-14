---
title: 모델 설정 (구 LLM 프로바이더)
nav_order: 1
parent: 통합
grand_parent: 🇰🇷 한국어
---

# 모델 설정

> **이전 문서 안내**: 이 페이지의 내용은 **설정 > 모델 설정** 으로 이동했습니다.
> 최신 정보는 [모델 설정](../settings/models.md) 페이지를 참고하세요.

---

## 개요

Starnion은 단일 AI 모델에 종속되지 않습니다. Gemini, OpenAI, Anthropic Claude, Z.AI 등 다양한 LLM 프로바이더를 지원하며, 사용자가 직접 원하는 모델과 API 키를 설정할 수 있습니다. 모델은 대화별로 선택하거나 페르소나(Persona)에 연결하여 자동으로 적용할 수 있습니다.

---

## 지원 프로바이더

| 프로바이더 | 식별자 | 주요 모델 | 특징 |
|-----------|--------|----------|------|
| Google Gemini | `gemini` | gemini-2.0-flash, gemini-1.5-pro | 기본 프로바이더, 무료 티어 제공 |
| OpenAI | `openai` | gpt-4o, gpt-4o-mini, gpt-4-turbo | 넓은 생태계, 강력한 코딩 성능 |
| Anthropic | `anthropic` | claude-opus-4-5, claude-sonnet-4-5, claude-haiku-3-5 | 긴 컨텍스트, 정교한 추론 |
| Z.AI | `zai` | z1-preview, z1-mini | 고성능 추론 모델 |
| Custom | `custom` | (직접 지정) | OpenAI 호환 엔드포인트 |

> **기본 설정**: 새로 가입한 사용자는 Gemini가 기본 프로바이더로 설정됩니다.

---

## API 키 설정 방법

1. 웹 UI에서 **Settings** 메뉴로 이동합니다.
2. **Models** 탭을 선택합니다.
3. 원하는 프로바이더를 선택하고 **API Key** 필드에 키를 입력합니다.
4. 사용할 모델을 체크합니다 (복수 선택 가능).
5. **저장** 버튼을 클릭합니다.

API 키는 저장 즉시 백엔드에서 자동 검증됩니다 (아래 [API 키 검증](#api-키-검증) 참고).

---

## Gemini 설정 (무료 시작 가능)

Gemini API는 무료 티어를 제공하므로 처음 시작하기에 좋습니다.

1. [Google AI Studio](https://aistudio.google.com/)에 접속합니다.
2. 로그인 후 **Get API key** 버튼을 클릭합니다.
3. **Create API key** → 프로젝트 선택 또는 새 프로젝트 생성.
4. 생성된 키를 복사합니다 (`AIza...` 형식).
5. Starnion Settings > Models > Gemini에 붙여넣고 저장합니다.

**무료 한도**: 분당 15회 요청, 일 1,500회 요청 (2025년 기준).

---

## OpenAI 설정

1. [OpenAI Platform](https://platform.openai.com/)에 로그인합니다.
2. 우측 상단 프로필 아이콘 → **API keys** 클릭.
3. **Create new secret key** 버튼 클릭.
4. 키 이름을 입력하고 생성합니다 (`sk-proj-...` 형식).
5. 키는 생성 직후에만 전체를 볼 수 있으므로 즉시 복사합니다.
6. Starnion Settings > Models > OpenAI에 붙여넣고 저장합니다.

> OpenAI API는 유료입니다. 사용 전 [billing](https://platform.openai.com/billing)에서 결제 수단을 등록하세요.

---

## Anthropic Claude 설정

1. [Anthropic Console](https://console.anthropic.com/)에 로그인합니다.
2. 좌측 메뉴에서 **API Keys** 클릭.
3. **Create Key** 버튼 클릭 후 키 이름 입력.
4. 생성된 키를 복사합니다 (`sk-ant-...` 형식).
5. Starnion Settings > Models > Anthropic에 붙여넣고 저장합니다.

Claude는 특히 긴 문서 분석이나 복잡한 추론 작업에 강점이 있습니다.

---

## Custom 엔드포인트 설정

OpenAI API와 호환되는 서버(Ollama, LM Studio, vLLM 등)를 연결할 수 있습니다.

1. Settings > Models > Custom 선택.
2. **Base URL** 필드에 서버 주소를 입력합니다 (예: `http://localhost:11434/v1`).
3. **API Key**는 로컬 서버의 경우 임의 값을 입력해도 됩니다.
4. 사용할 모델명을 직접 입력합니다.

---

## 프로바이더 전환 가이드

어떤 모델을 언제 사용할지 고민된다면 아래를 참고하세요.

| 상황 | 권장 모델 |
|------|----------|
| 일상적인 대화, 간단한 질문 | Gemini 2.0 Flash (빠름, 저렴) |
| 코드 작성 및 디버깅 | GPT-4o 또는 Claude Sonnet |
| 긴 문서 분석 (100K+ 토큰) | Claude Opus 또는 Gemini 1.5 Pro |
| 비용 최소화 | Gemini 무료 티어 또는 GPT-4o-mini |
| 복잡한 수학/추론 | Claude Opus 또는 GPT-4o |

---

## API 키 검증

키를 저장하면 Gateway가 각 프로바이더 API에 경량 요청을 보내 유효성을 확인합니다.

- **Gemini**: `GET /v1beta/models?key=<api_key>`로 응답 확인
- **OpenAI**: `GET /v1/models` (Bearer 인증)으로 200 응답 확인
- **Anthropic**: `POST /v1/messages`에 최소 요청으로 401/403 여부 확인
- **Z.AI**: `GET /api/paas/v4/models` (Bearer 인증)으로 응답 확인

검증 결과는 즉시 UI에 표시됩니다. 검증에 실패하면 키가 저장되지 않습니다.

> API 키는 데이터베이스에 저장 시 앞 4자리와 뒤 4자리만 마스킹하여 UI에 표시됩니다 (예: `AIza...zXYZ`). 전체 키는 서버 측에서만 사용됩니다.

---

## 비용 모니터링

LLM API는 토큰 사용량에 따라 비용이 발생합니다. Starnion은 모든 API 호출의 토큰 사용량을 기록합니다.

- **Settings > Usage** 메뉴에서 일별/모델별 토큰 사용량을 확인할 수 있습니다.
- 입력 토큰(input)과 출력 토큰(output)이 구분되어 표시됩니다.
- 모델별 단가를 기반으로 예상 비용이 계산됩니다.

자세한 내용은 [분석 & 사용량](../features/analytics.md) 문서를 참고하세요.

---

## FAQ

**Q: API 키를 여러 개 설정할 수 있나요?**
A: 네, 프로바이더마다 하나의 키를 설정할 수 있습니다. 예를 들어 Gemini와 OpenAI 키를 동시에 등록하고 대화별로 선택할 수 있습니다.

**Q: API 키를 바꾸지 않고 활성 모델만 변경할 수 있나요?**
A: 가능합니다. API 키 필드를 비워두고 저장하면 기존 키는 유지되고 선택된 모델 목록만 업데이트됩니다.

**Q: Gemini 무료 한도를 초과하면 어떻게 되나요?**
A: API에서 429 오류가 반환되고 대화가 일시 중단됩니다. 다른 프로바이더로 전환하거나 잠시 후 다시 시도하세요.

**Q: 페르소나별로 다른 모델을 사용할 수 있나요?**
A: 네, 각 페르소나에 특정 프로바이더와 모델을 지정할 수 있습니다. Settings > Personas에서 설정하세요.
