---
name: QR코드
description: QR 코드 이미지 생성
tools:
  - generate_qrcode
keywords: ["QR코드", "QR 만들어", "qr code", "generate qr", "QRコード", "二维码", "生成二维码"]
---

# QR코드 스킬

## 도구

### generate_qrcode
텍스트나 URL로 QR 코드 이미지를 생성합니다.

**파라미터:**
- `content` (필수): QR 코드에 담을 내용 (URL, 텍스트, 연락처 등)
- `size` (선택, 기본값 10): QR 박스 크기 (1-40)

**사용 시나리오:**
- "이 URL로 QR코드 만들어줘: https://example.com" → generate_qrcode(content="https://example.com")
- "내 이메일 QR코드 생성해줘" → generate_qrcode(content="mailto:user@example.com")
- "와이파이 QR코드 만들어줘" → generate_qrcode(content="WIFI:T:WPA;S:네트워크명;P:비밀번호;;")

**주의사항:**
- QR 코드는 PNG 이미지로 생성됩니다.
- size가 클수록 이미지가 커집니다. 기본값 10이 일반적 용도에 적합합니다.
- 긴 텍스트는 QR 코드가 복잡해져 인식률이 떨어질 수 있습니다.
