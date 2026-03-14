---
title: 모델 설정
nav_order: 16
parent: 기능
grand_parent: 🇰🇷 한국어
---

# 모델 설정

## 개요

모델 설정은 Starnion에서 사용할 AI 모델과 프로바이더를 구성하는 설정 페이지입니다. 다양한 LLM 프로바이더의 API 키를 등록하고, 대화/이미지 생성/임베딩 등 용도별로 최적의 모델을 지정할 수 있습니다.

**주요 특징:**
- 다중 LLM 프로바이더 지원: Google Gemini, OpenAI, Anthropic Claude, GLM/Z.AI, Ollama
- API 키 관리: 프로바이더별 API 키 등록 및 검증
- 용도별 모델 할당: 채팅, 이미지 생성, 임베딩 등 기능별 모델 지정
- 고급 파라미터 설정: temperature, max_tokens 등 세부 조정
- 커스텀 엔드포인트: OpenAI 호환 API 지원 (Ollama, vLLM 등)

---

## 지원 프로바이더

| 프로바이더 | 대표 모델 | 특징 |
|-----------|----------|------|
| **Google Gemini** | Gemini 2.0 Flash, Gemini 1.5 Pro | 무료 티어 제공, 긴 컨텍스트 |
| **OpenAI** | GPT-4o, GPT-4o-mini | 범용 성능 우수, 다양한 모델 |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Haiku | 안전한 AI, 긴 컨텍스트 |
| **GLM/Z.AI** | GLM-4 | 고성능 추론 모델 |
| **Ollama** | Llama 3, Mistral 등 | 로컬 실행, 무료 |
| **커스텀** | (사용자 정의) | OpenAI 호환 엔드포인트 |

---

## API 키 등록

1. **기능 > 모델 설정** 메뉴로 이동합니다.
2. 사용할 프로바이더를 선택합니다.
3. **API 키**를 입력합니다.
4. **저장**을 클릭합니다.

저장 시 백엔드에서 자동으로 API 키 유효성을 검증합니다.

> API 키는 암호화되어 저장됩니다. 화면에는 앞 4자리와 뒤 4자리만 표시됩니다.

### 프로바이더별 API 키 발급

#### Google Gemini

1. [Google AI Studio](https://aistudio.google.com/) 접속
2. **Get API key** 클릭 → **Create API key**
3. 생성된 키 복사 (`AIza...` 형식)

**무료 한도:** 분당 15회, 일 1,500회 (2025년 기준)

#### OpenAI

1. [OpenAI Platform](https://platform.openai.com/) 로그인
2. 우상단 프로필 → **API keys** → **Create new secret key**
3. 키 복사 (`sk-proj-...` 형식)

#### Anthropic

1. [Anthropic Console](https://console.anthropic.com/) 로그인
2. 좌측 메뉴 **API Keys** → **Create Key**
3. 키 복사 (`sk-ant-...` 형식)

---

## 모델 할당

기능별로 다른 모델을 할당하여 비용과 성능을 최적화할 수 있습니다.

| 기능 | 권장 모델 |
|------|----------|
| **채팅** | Gemini 2.0 Flash, GPT-4o-mini |
| **리포트** | GPT-4o, Claude 3.5 Sonnet |
| **이미지 생성** | DALL-E 3 |
| **임베딩** | text-embedding-3-small, gemini-embedding-001 |

---

## 고급 파라미터

| 파라미터 | 설명 | 기본값 |
|---------|------|-------|
| **temperature** | 응답의 창의성/랜덤성 (0.0~2.0) | 0.7 |
| **max_tokens** | 응답 최대 토큰 수 | 4096 |
| **top_p** | 누적 확률 샘플링 (0.0~1.0) | 1.0 |

---

## 자주 묻는 질문

**Q. API 키를 여러 프로바이더에 등록해도 되나요?**
네. 여러 프로바이더의 API 키를 동시에 등록하고, 기능별로 다른 모델을 할당할 수 있습니다.

**Q. Ollama로 완전 무료로 사용할 수 있나요?**
네. Ollama를 로컬에 설치하고 커스텀 엔드포인트로 연결하면 외부 API 비용 없이 사용 가능합니다.

**Q. 모델을 변경하면 기존 대화에 영향이 있나요?**
아닙니다. 모델 변경은 이후 새로운 대화부터 적용됩니다.
