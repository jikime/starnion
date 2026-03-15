---
name: 해시
description: MD5, SHA256 등 해시값 생성
tools:
  - generate_hash
keywords: ["해시", "MD5", "SHA", "hash", "md5", "sha256", "ハッシュ", "哈希", "散列"]
---

# 해시 스킬

## 도구

### generate_hash
텍스트의 해시값을 생성합니다.

**파라미터:**
- `text` (필수): 해시할 텍스트
- `algorithm` (선택, 기본값 "sha256"): 해시 알고리즘
  - `md5`: MD5 (128bit)
  - `sha1`: SHA-1 (160bit)
  - `sha256`: SHA-256 (256bit)
  - `sha512`: SHA-512 (512bit)

**사용 시나리오:**
- "Hello World 해시값 알려줘" → generate_hash(text="Hello World")
- "이 텍스트 MD5 해시 생성해줘" → generate_hash(text="...", algorithm="md5")
- "SHA512로 해시 만들어줘" → generate_hash(text="...", algorithm="sha512")

**주의사항:**
- 최대 100,000자까지 처리 가능합니다.
- MD5, SHA1은 보안 용도로 사용하지 마세요 (무결성 검증용).
- 기본 알고리즘은 SHA-256입니다.
