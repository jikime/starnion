---
name: audio
description: 음성 메시지를 텍스트로 변환(STT)하고, 텍스트를 음성으로 변환(TTS)합니다.
---

# 오디오 (audio)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `transcribe_audio` | 음성 메시지를 텍스트로 변환 (STT) |
| `generate_audio` | 텍스트를 음성으로 변환 (TTS) |

## transcribe_audio 사용 지침

- `[🎤 음성 파일 첨부됨]` 태그가 메시지에 포함된 경우 **즉시 최우선으로 호출**
- `file_url` 파라미터: 태그에 표시된 URL을 그대로 사용
- STT 완료 후 변환된 텍스트를 분석하여 적절한 스킬로 자동 연계 (Voice-to-Action)

### Voice-to-Action 자동 연계 규칙

변환된 텍스트의 의도를 파악하여 확인 없이 즉시 해당 도구를 호출한다:

| 텍스트 의도 | 연계 도구 | 예시 |
|-----------|---------|------|
| 지출/수입 기록 | `save_finance` | "점심 만원 썼어", "커피 5천원" |
| 일상 기록 | `save_daily_log` | "오늘 친구 만났어", "날씨 좋다" |
| 일기 저장 | `save_diary_entry` | "오늘 기분 좋았어. 일기 써줘" |
| 메모 저장 | `save_memo` | "아이디어 메모해줘: ..." |
| 목표 설정 | `set_goal` | "이번 달 운동 목표 잡아줘" |
| 알림 설정 | `set_reminder` | "내일 오전 9시 회의 알려줘" |
| 일정 생성 | `create_schedule` | "다음 주 월요일 치과 등록해줘" |

- **의도가 명확**한 경우: 확인 없이 즉시 실행
- **의도가 불분명**한 경우: 변환 텍스트를 먼저 보여주고 사용자에게 확인

## generate_audio 사용 지침

- 사용자가 텍스트 읽기, 음성 변환을 요청하면 호출
- `text`: 음성으로 변환할 텍스트
- `voice`: 음성 모델 선택 (기본값: Kore)
  - 사용 가능: Kore, Puck, Charon, Fenrir, Aoede, Leda, Orus, Zephyr
- 생성된 음성 파일은 WAV 형식으로 자동 전달됨
- Gemini TTS API 사용 (GEMINI_API_KEY로 동작, 별도 서비스 계정 불필요)

## 응답 스타일

- transcribe_audio: 변환 결과를 먼저 보여주고 연계 작업 수행
- generate_audio: "음성을 생성했어요" 간단히 안내 (파일이 자동 전달됨)
- 변환 결과가 부정확할 수 있으므로 필요시 사용자에게 확인
