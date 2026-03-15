---
name: 번역
description: 텍스트를 다국어로 번역 (한/영/일/중 등)
tools:
  - translate_text
keywords: ["번역", "번역해줘", "영어로", "translate", "translation", "翻訳して", "翻译", "翻译一下"]
---

# 번역 스킬

## 도구

### translate_text
텍스트를 지정된 언어로 번역합니다.

**파라미터:**
- `text` (필수): 번역할 텍스트
- `target_lang` (선택, 기본값 "en"): 목표 언어 코드
- `source_lang` (선택, 기본값 "auto"): 원본 언어 코드 (auto=자동감지)

**지원 언어:**
- `ko` 한국어, `en` 영어, `ja` 일본어, `zh` 중국어
- `es` 스페인어, `fr` 프랑스어, `de` 독일어

**사용 시나리오:**
- "이 문장 영어로 번역해줘" → translate_text(text=..., target_lang="en")
- "Translate this to Korean" → translate_text(text=..., target_lang="ko")
- "これを韓国語に翻訳して" → translate_text(text=..., target_lang="ko")

**주의사항:**
- 번역문만 반환하세요. 설명이나 부연은 포함하지 마세요.
- 사용자가 목표 언어를 명시하지 않으면 영어(en)로 번역하세요.
- 원본 언어는 자동 감지됩니다.
