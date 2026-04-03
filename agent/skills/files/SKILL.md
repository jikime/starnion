---
name: files
display_name: 내 파일 (문서/이미지/오디오)
description: Manage, search, upload, generate, and analyze all user files — documents, images, and audio (내 파일, 파일 목록, 문서 검색, 이미지 생성, 이미지 분석, 음성 변환, TTS, 파일 저장, 문서 만들어줘, 파일 찾아줘, 업로드한 파일, 녹음, 오디오, 사진, 이미지) — unified file management replacing documents/image/audio skills
version: 1.0.0
emoji: "🗂️"
category: knowledge
enabled_by_default: true
requires_api_key: optional
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - python3 documents/scripts/documents.py
    - python3
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 내 파일
    - 파일
    - 문서
    - 이미지
    - 사진
    - 오디오
    - 음성
    - 파일 목록
    - 파일 찾아줘
    - 문서 검색
    - 이미지 생성
    - 이미지 분석
    - 음성 변환
    - 텍스트 변환
    - TTS
    - 녹음
    - 파일 저장
    - 문서 만들어
    - 보고서
    - 워드
    - 엑셀
    - PDF
    - PPT
    - 한글
    - HWP
    - 마크다운
    - generate document
    - generate image
    - transcribe
    - analyze image
    - files
    - document
    - image
    - audio
  when_to_use:
    - User wants to list, search, or manage their files
    - User uploads a file and wants it saved
    - User asks to generate a document (Word, PDF, Excel, PPT, Markdown, HWP)
    - User asks to generate an image from a prompt
    - User asks to analyze an image
    - User asks to transcribe audio to text
    - User asks to generate speech from text (TTS)
    - User references previously uploaded files
---

# 내 파일 (Unified File Management)

모든 파일(문서, 이미지, 오디오)을 통합 관리하는 스킬입니다.
파일 유형에 따라 아래 적절한 커맨드를 사용하세요.

Always pass `--user-id {user_id}` (extract from `[Context: user_id=...]`).

---

## 📄 문서 (Documents)

문서 업로드, 검색, 읽기, 생성에는 `python3 documents/scripts/documents.py`를 사용합니다.

### 문서 목록 조회
```bash
python3 documents/scripts/documents.py --user-id {user_id} list
```

### 문서 검색
```bash
python3 documents/scripts/documents.py --user-id {user_id} search \
  --query "{검색어}" \
  --limit 5
```

### 문서 내용 읽기
```bash
python3 documents/scripts/documents.py --user-id {user_id} read \
  --doc-id {file_id}
```

### 파일 첨부 저장
```bash
python3 documents/scripts/documents.py --user-id {user_id} save \
  --url "{file_url}" \
  --filename "{original_filename}"
```

### 문서 생성 (AI 작성 → MinIO 업로드)
```bash
printf '%s' "{markdown content}" | \
  python3 documents/scripts/documents.py --user-id {user_id} generate \
    --title "{document title}" \
    --format docx
```

형식 선택:
| 사용자 요청 | `--format` |
|------------|-----------|
| Word, 워드 | `docx` |
| PDF | `pdf` |
| Excel, 엑셀 | `xlsx` |
| PowerPoint, 발표자료 | `pptx` |
| 한글 XML | `hwpx` |
| 한글 바이너리 | `hwp` |
| Markdown | `md` |
| 텍스트 | `txt` |

---

## 🖼️ 이미지 (Images)

이미지 생성 및 분석에는 Gemini API가 필요합니다.

### 이미지 분석
```bash
python3 image/scripts/analyze.py \
  --user-id {user_id} \
  --file-url "{image_url}" \
  --query "{분석 질문}"
```

### 이미지 생성
```bash
python3 image/scripts/image.py \
  --user-id {user_id} \
  --prompt "{이미지 설명}" \
  --aspect-ratio {1:1|16:9|9:16|4:3|3:4}
```

지원 비율: `1:1` (정사각형), `16:9` (가로), `9:16` (세로), `4:3`, `3:4`

---

## 🎵 오디오 (Audio)

오디오 STT/TTS에는 OpenAI 또는 Groq API가 필요합니다.

### 음성 → 텍스트 (STT / Transcription)
```bash
python3 audio/scripts/audio.py transcribe \
  --user-id {user_id} \
  --file-url "{audio_url}" \
  --language ko
```

지원 형식: webm, mp3, mp4, m4a, ogg, wav, flac

### 텍스트 → 음성 (TTS)
```bash
python3 audio/scripts/audio.py tts \
  --user-id {user_id} \
  --text "{변환할 텍스트}" \
  --voice nova \
  --model tts-1
```

음성: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
모델: `tts-1` (빠름), `tts-1-hd` (고품질)

---

## 의사결정 가이드

| 사용자 요청 | 사용할 커맨드 |
|------------|-------------|
| 파일 목록 보여줘 | `documents list` |
| 파일에서 ~ 찾아줘 | `documents search` |
| 문서 내용 읽어줘 | `documents read` |
| 파일 첨부 저장 | `documents save` |
| 문서/보고서 만들어줘 | `documents generate` |
| 이미지 생성해줘 | `image generate` |
| 이미지 분석해줘 | `image analyze` |
| 음성 파일 텍스트로 변환 | `audio transcribe` |
| 텍스트를 음성으로 | `audio tts` |

---

## 파일 첨부 플로우

사용자가 파일을 첨부하면 (`[file:name:URL]` 또는 `[image:URL]`):
1. 즉시 요청에 활용 (텍스트 추출, 이미지 분석 등)
2. 응답 후 저장 제안: "이 파일을 내 파일에 저장할까요?"
3. 확인 시 → `documents save` 또는 적절한 커맨드로 저장
