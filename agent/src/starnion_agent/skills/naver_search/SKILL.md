---
name: 네이버 검색
description: 네이버 Open API로 쇼핑, 블로그, 뉴스, 책, 백과사전, 카페글, 지식iN, 지역, 웹문서, 전문자료를 검색합니다.
keywords: ["네이버", "네이버 검색", "쇼핑", "뉴스", "블로그", "naver", "ネイバー", "韩国搜索"]
---

# 네이버 검색 스킬 (Naver Search)

네이버 Open API를 통해 10가지 유형의 콘텐츠를 검색합니다.

## 도구

### `naver_search`

| 파라미터 | 설명 | 기본값 | 최대값 |
|----------|------|--------|--------|
| `query` | 검색 키워드 (UTF-8) | (필수) | - |
| `search_type` | 검색 유형 (아래 표 참조) | `webkr` | - |
| `display` | 한 번에 표시할 결과 개수 | `5` | `100` |
| `start` | 검색 시작 위치 (페이지네이션) | `1` | `1000` |
| `sort` | 정렬 방식 | `sim` | - |

## 사용 원칙

- 사용자가 **"네이버"를 명시**하거나 **한국 정보·뉴스·쇼핑·맛집** 등을 요청하면 `web_search` 대신 **반드시 `naver_search`를 사용**한다.
- 뉴스 검색 시: `search_type="news"` (`web_search` 사용 금지)
- 쇼핑 검색 시: `search_type="shop"` (`web_search` 사용 금지)
- 네이버 웹문서·한국어 웹 검색 시: `search_type="webkr"` (`web_search` 사용 금지)
- 블로그·카페·지식iN·지역·책·백과사전·전문자료 검색 시도 동일하게 `naver_search` 사용

## 검색 유형 선택 가이드

| 상황 | search_type | 설명 |
|------|-------------|------|
| 일반 웹 정보 검색 | `webkr` | 웹문서 (기본값) |
| 최신 뉴스·이슈 | `news` | 뉴스 기사 |
| 블로그 후기·경험담 | `blog` | 블로그 포스트 |
| 상품 가격 비교·구매 | `shop` | 쇼핑 (최저가/최고가 포함) |
| 책·출판물 정보 | `book` | 도서 정보 (ISBN, 출판사, 저자) |
| 사전적 개념 정의 | `encyc` | 백과사전 |
| 커뮤니티 반응·의견 | `cafearticle` | 카페글 |
| 질문-답변 형식 | `kin` | 지식iN |
| 주변 가게·장소 찾기 | `local` | 지역 (주소, 전화번호 포함) |
| 학술 논문·자료 | `doc` | 전문자료 |

## 정렬 방식

| sort 값 | 설명 | LLM 적용 기준 |
|---------|------|--------------|
| `sim` | 정확도순 (기본) | 일반 검색 |
| `date` | 날짜순 (최신) | "최신", "오늘", "최근", "어제" 키워드 |
| `asc` | 가격 오름차순 | "저렴한", "싼", "최저가" (쇼핑 전용) |
| `dsc` | 가격 내림차순 | "비싼", "고가", "프리미엄" (쇼핑 전용) |

## 페이지네이션

다음 페이지 조회 시 `start=이전_display+1` 로 설정:
```
# 1페이지 (1~10번)
naver_search(query="파이썬", display=10, start=1)

# 2페이지 (11~20번)
naver_search(query="파이썬", display=10, start=11)
```

## 사용 예시

```
# 최신 AI 뉴스
naver_search(query="AI 인공지능", search_type="news", sort="date")

# 아이폰 최저가 쇼핑 검색
naver_search(query="아이폰 16", search_type="shop", sort="asc", display=10)

# 강남 맛집 지역 검색
naver_search(query="강남 맛집", search_type="local")

# 파이썬 관련 블로그 후기
naver_search(query="파이썬 입문", search_type="blog", sort="date")

# 양자역학 백과사전 검색
naver_search(query="양자역학", search_type="encyc")
```

## 연동 설정

네이버 검색 API를 사용하려면 **설정 → 연동** 메뉴에서 네이버 Client ID와 Client Secret을 등록해야 합니다.

- 발급처: [네이버 개발자 센터](https://developers.naver.com)
- 필요 권한: 검색 API

연동이 없으면 도구 호출 시 안내 메시지를 반환합니다.

## 확장 방법

새로운 검색 유형 추가 시 `tools.py`에서:
1. `_SEARCH_TYPES` 딕셔너리에 `endpoint_key: "한글 레이블"` 추가
2. `_format_<type>_items(items, total, query) -> str` 함수 작성
3. `_FORMATTERS` 딕셔너리에 등록

별도의 도구 등록 없이 자동으로 `naver_search` 도구에서 지원됩니다.
