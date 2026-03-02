---
skill_id: horoscope
version: "1.0"
tools:
  - get_horoscope
---

# 운세 스킬

## 도구

### get_horoscope
오늘의 별자리 운세를 조회합니다.

**파라미터:**
- `sign` (필수): 별자리 이름 (한글 또는 영문)

**지원 별자리:**
- ♈ 양자리 (aries) 3/21-4/19
- ♉ 황소자리 (taurus) 4/20-5/20
- ♊ 쌍둥이자리 (gemini) 5/21-6/20
- ♋ 게자리 (cancer) 6/21-7/22
- ♌ 사자자리 (leo) 7/23-8/22
- ♍ 처녀자리 (virgo) 8/23-9/22
- ♎ 천칭자리 (libra) 9/23-10/22
- ♏ 전갈자리 (scorpio) 10/23-11/21
- ♐ 사수자리 (sagittarius) 11/22-12/21
- ♑ 염소자리 (capricorn) 12/22-1/19
- ♒ 물병자리 (aquarius) 1/20-2/18
- ♓ 물고기자리 (pisces) 2/19-3/20

**사용 시나리오:**
- "사자자리 오늘 운세 알려줘" → get_horoscope(sign="사자자리")
- "양자리 운세" → get_horoscope(sign="양자리")
- "leo horoscope" → get_horoscope(sign="leo")
- "오늘 물고기자리 운세는?" → get_horoscope(sign="물고기자리")

**주의사항:**
- 운세는 영어로 제공됩니다 (외부 API 기반).
- 네트워크 오류 시 재시도해 주세요.
