---
name: audio
display_name: 음성 변환 / 음성 생성
description: "STT: Transcribe audio files to text using OpenAI or Groq. TTS: Convert text to speech MP3 using OpenAI. Use for: 음성 파일, 녹음 전사, 받아쓰기, 오디오 변환, mp3/wav/m4a transcription, speech to text, 텍스트를 음성으로, 읽어줘, tts, text to speech, 음성 파일 생성"
version: 3.0.0
emoji: "🎙️"
category: utility
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: true
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 음성
    - 녹음
    - 전사
    - 받아쓰기
    - 오디오
    - 음성파일
    - 음성생성
    - 읽어줘
    - 변환
    - mp3
    - wav
    - m4a
    - transcribe
    - speech
    - audio
    - voice
    - recording
    - stt
    - tts
    - text-to-speech
  when_to_use:
    - User uploads an audio or voice recording file
    - User asks to transcribe speech to text
    - User wants to convert audio content to written text
    - User mentions an audio file (mp3, wav, m4a, etc.)
    - User asks to read text aloud or generate a voice file
    - User wants to convert text to an MP3 audio file
    - User says "읽어줘", "음성으로 변환", "tts", "목소리로 만들어줘"
---

# Audio — STT & TTS

Use `python3 audio/scripts/audio.py` for:
- **STT** (Speech-to-Text): transcribe audio files → OpenAI `gpt-4o-mini-transcribe` or Groq `whisper-large-v3-turbo`
- **TTS** (Text-to-Speech): generate MP3 from text → OpenAI `tts-1` / `tts-1-hd`

Always pass `--user-id {user_id}`.

## Prerequisites

- **STT**: OpenAI or Groq API key in Settings → 모델 → 프로바이더
- **TTS**: OpenAI API key only (Groq does not support TTS)
- Environment: `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- Optional: `MINIO_BUCKET` (default `starnion-files`), `MINIO_USE_SSL` (default `false`)

---

## STT — Transcribe audio to text

```bash
python3 audio/scripts/audio.py \
  --user-id {user_id} transcribe \
  --file-url "{file_url}" \
  --language ko
```

**file_url**: `/api/files/<key>` (MinIO path) or full `https://` URL

**Supported formats:** webm, mp3, mp4, m4a, ogg, wav, flac

**Language codes:** `ko`, `en`, `ja`, `zh`, etc.

**Output:** prints transcript text after `Result:` — use directly in your response.

### STT Examples

**User:** "방금 보낸 음성 메시지 텍스트로 바꿔줘"
```bash
python3 audio/scripts/audio.py \
  --user-id abc123 transcribe \
  --file-url "/api/files/users/abc123/uploads/voice_memo.webm" \
  --language ko
```

---

## TTS — Convert text to speech (MP3)

```bash
python3 audio/scripts/audio.py \
  --user-id {user_id} tts \
  --text "읽을 텍스트를 여기에 입력하세요" \
  --voice nova \
  --model tts-1
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--text` | (required) | Text to synthesize (max 4096 chars) |
| `--voice` | `nova` | `alloy` / `echo` / `fable` / `onyx` / `nova` / `shimmer` |
| `--model` | `tts-1` | `tts-1` (fast) or `tts-1-hd` (higher quality) |

**Output:** prints `/api/files/users/{user_id}/tts/{filename}.mp3` — present this URL to the user as a playable audio link.

### TTS Examples

**User:** "이 문장을 음성 파일로 만들어줘: 안녕하세요, 반갑습니다."
```bash
python3 audio/scripts/audio.py \
  --user-id abc123 tts \
  --text "안녕하세요, 반갑습니다." \
  --voice nova \
  --model tts-1
```

**User:** "영어로 읽어줘: Hello, how are you today?"
```bash
python3 audio/scripts/audio.py \
  --user-id abc123 tts \
  --text "Hello, how are you today?" \
  --voice alloy \
  --model tts-1
```

**User:** "고품질 음성으로 생성해줘"
```bash
python3 audio/scripts/audio.py \
  --user-id abc123 tts \
  --text "..." \
  --voice nova \
  --model tts-1-hd
```

## Notes

- TTS requires OpenAI key; STT supports both OpenAI and Groq
- TTS text is truncated at 4096 characters
- Large audio files (>25MB) may be rejected by STT API — ask user to trim if needed
- Voice options: `nova` (warm female), `alloy` (neutral), `onyx` (deep male), `shimmer` (expressive female)
