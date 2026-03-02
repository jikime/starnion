---
skill_id: encode
version: "1.0"
tools:
  - encode_decode
---

# 인코딩 스킬

## 도구

### encode_decode
텍스트를 Base64, URL, HTML 형식으로 인코딩 또는 디코딩합니다.

**파라미터:**
- `text` (필수): 인코딩/디코딩할 텍스트
- `format` (선택, 기본값 "base64"): 형식
  - `base64`: Base64 인코딩/디코딩
  - `url`: URL 인코딩/디코딩 (percent-encoding)
  - `html`: HTML 엔티티 인코딩/디코딩
- `action` (선택, 기본값 "encode"): 동작
  - `encode`: 인코딩
  - `decode`: 디코딩

**사용 시나리오:**
- "Hello World를 Base64로 인코딩해줘" → encode_decode(text="Hello World", format="base64", action="encode")
- "SGVsbG8= 디코딩해줘" → encode_decode(text="SGVsbG8=", format="base64", action="decode")
- "한글 URL 인코딩해줘" → encode_decode(text="한글", format="url", action="encode")
- "%ED%95%9C%EA%B8%80 URL 디코딩해줘" → encode_decode(text="%ED%95%9C%EA%B8%80", format="url", action="decode")
- "HTML 태그 이스케이프해줘" → encode_decode(text="<script>alert('xss')</script>", format="html", action="encode")

**주의사항:**
- 최대 50,000자까지 처리 가능합니다.
- Base64 디코딩 시 유효한 Base64 문자열이어야 합니다.
