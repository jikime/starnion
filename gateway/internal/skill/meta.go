package skill

// SkillMeta holds display metadata for each skill.
type SkillMeta struct {
	Keywords []string
	Examples []string
}

// skillMetaMap is a static lookup of per-skill keywords and example prompts.
var skillMetaMap = map[string]SkillMeta{
	"finance": {
		Keywords: []string{"가계부", "지출", "수입", "결제", "expense", "income"},
		Examples: []string{
			"점심 12,000원",
			"커피 5천원 썼어",
			"이번 달 얼마 썼어?",
			"월급 300만원 들어왔어",
			"지난달 식비 합계 알려줘",
		},
	},
	"budget": {
		Keywords: []string{"예산", "한도", "budget", "spending limit"},
		Examples: []string{
			"식비 예산 30만원으로 설정해줘",
			"이번 달 예산 얼마 남았어?",
			"전체 지출 한도 50만원",
			"교통비 예산 변경해줘",
		},
	},
	"pattern": {
		Keywords: []string{"소비 패턴", "분석", "이상 소비", "pattern", "analysis"},
		Examples: []string{
			"내 소비 패턴 어때?",
			"이상한 지출 있어?",
			"요일별 소비 경향 알려줘",
			"반복 결제 뭐 있어?",
		},
	},
	"proactive": {
		Keywords: []string{"알림", "자동 알림", "예산 초과", "notification"},
		Examples: []string{
			"(자동 발송 — 직접 호출 불필요)",
			"예산 초과 시 자동 경고",
			"이상 소비 감지 시 자동 알림",
		},
	},
	"currency": {
		Keywords: []string{"환율", "달러", "원화", "유로", "exchange rate"},
		Examples: []string{
			"달러 환율 알려줘",
			"100달러 원화로 얼마야?",
			"50유로를 엔화로 바꿔줘",
			"만원이 달러로 얼마야?",
		},
	},
	"diary": {
		Keywords: []string{"일기", "감정", "오늘", "diary", "journal"},
		Examples: []string{
			"오늘 기분이 너무 안 좋아",
			"회의가 길었어 힘들었어",
			"오늘 친구 만났는데 정말 즐거웠어",
			"일기 보여줘",
		},
	},
	"memo": {
		Keywords: []string{"메모", "적어줘", "기록", "memo", "note"},
		Examples: []string{
			"우유 사야 해 메모해줘",
			"회의 내용 기록해줘",
			"내 메모 보여줘",
			"업무 태그 메모만 보여줘",
			"메모 삭제해줘",
		},
	},
	"goals": {
		Keywords: []string{"목표", "할일", "습관", "goal", "target"},
		Examples: []string{
			"이번 달 식비 30만원 이내로 목표 세워줘",
			"매일 1만보 걷기 습관 등록해줘",
			"내 목표 뭐가 있어?",
			"목표 달성했어!",
		},
	},
	"dday": {
		Keywords: []string{"디데이", "며칠 남았", "카운트다운", "d-day", "countdown"},
		Examples: []string{
			"크리스마스 디데이 설정해줘",
			"결혼기념일 매년 반복으로 등록해줘",
			"내 디데이 보여줘",
			"시험까지 며칠 남았어?",
		},
	},
	"reminder": {
		Keywords: []string{"알림", "리마인더", "알려줘", "remind", "alert"},
		Examples: []string{
			"내일 오전 9시에 회의 알려줘",
			"3월 5일 오후 3시에 치과 예약 알림 설정해줘",
			"30분 후에 약 먹으라고 알려줘",
		},
	},
	"schedule": {
		Keywords: []string{"일정", "정기 알림", "반복 알림", "schedule", "recurring"},
		Examples: []string{
			"매주 금요일 저녁 8시에 주간 지출 알려줘",
			"매일 아침 9시에 기상 알림 설정해줘",
			"알림 목록 보여줘",
			"이 알림 삭제해줘",
		},
	},
	"memory": {
		Keywords: []string{"검색", "기억", "찾아줘", "search", "recall"},
		Examples: []string{
			"지난주에 뭐 먹었더라?",
			"저번에 말한 거 기억나?",
			"3월에 기록한 일기 찾아줘",
			"엄마 생일 언제라고 했지?",
		},
	},
	"image": {
		Keywords: []string{"이미지", "사진", "영수증", "image", "photo"},
		Examples: []string{
			"이 이미지 분석해줘",
			"고양이 이미지 만들어줘",
			"영수증 사진 보내면 자동 기록",
			"배경을 바다로 바꿔줘",
		},
	},
	"audio": {
		Keywords: []string{"음성", "오디오", "텍스트 변환", "voice", "STT", "TTS"},
		Examples: []string{
			"이 음성 파일 텍스트로 변환해줘",
			"이 문장 읽어줘",
			"음성 메모 저장해줘",
		},
	},
	"video": {
		Keywords: []string{"비디오", "영상", "슬라이드쇼", "video", "clip"},
		Examples: []string{
			"이 영상 요약해줘",
			"우주 여행 슬라이드쇼 영상 만들어줘",
			"비디오 내용 분석해줘",
		},
	},
	"documents": {
		Keywords: []string{"문서", "PDF", "파일", "document", "parse"},
		Examples: []string{
			"이 계약서 요약해줘",
			"업로드한 파일에서 조항 3번 알려줘",
			"보고서 PDF로 만들어줘",
			"엑셀로 정리해줘",
		},
	},
	"qrcode": {
		Keywords: []string{"QR코드", "QR 만들어", "qr code", "generate qr"},
		Examples: []string{
			"이 URL로 QR코드 만들어줘",
			"와이파이 QR코드 만들어줘",
			"내 이메일 QR코드 생성해줘",
		},
	},
	"websearch": {
		Keywords: []string{"검색", "찾아봐", "최신 정보", "search", "look up"},
		Examples: []string{
			"오늘 뉴스 알려줘",
			"비트코인 현재 가격",
			"파이썬 3.13 새로운 기능 검색해줘",
			"이 링크 내용 가져와줘",
		},
	},
	"naver_search": {
		Keywords: []string{"네이버", "쇼핑", "뉴스", "블로그", "naver"},
		Examples: []string{
			"강남 맛집 네이버로 찾아줘",
			"아이폰 최저가 쇼핑 검색해줘",
			"오늘 네이버 뉴스 알려줘",
			"파이썬 관련 블로그 검색해줘",
		},
	},
	"weather": {
		Keywords: []string{"날씨", "기온", "비", "weather", "forecast"},
		Examples: []string{
			"오늘 날씨 어때?",
			"내일 서울 날씨",
			"주말에 우산 필요해?",
			"도쿄 이번 주 날씨 알려줘",
		},
	},
	"summarize": {
		Keywords: []string{"요약", "정리", "요약해줘", "summarize", "summary"},
		Examples: []string{
			"이 기사 요약해줘: https://...",
			"핵심만 3줄로 정리해줘",
			"이 글 포인트별로 정리해줘",
			"자세히 요약해줘",
		},
	},
	"calculator": {
		Keywords: []string{"계산", "수식", "수학", "calculate", "math"},
		Examples: []string{
			"2+3*4 계산해줘",
			"루트 144",
			"sin(pi/2) 값은?",
			"15% 팁 계산해줘",
			"복리 계산: 원금 100만원 연이율 5% 3년",
		},
	},
	"translate": {
		Keywords: []string{"번역", "영어로", "한국어로", "translate", "translation"},
		Examples: []string{
			"이 문장 영어로 번역해줘",
			"Translate this to Korean",
			"일본어로 번역해줘",
			"이 이메일 한국어로 바꿔줘",
		},
	},
	"timezone": {
		Keywords: []string{"세계시간", "시간대", "몇시야", "timezone", "world time"},
		Examples: []string{
			"뉴욕 지금 몇 시야?",
			"서울 14:30이면 런던은 몇 시야?",
			"도쿄 현재 시간 알려줘",
			"각 도시 시간대 비교해줘",
		},
	},
	"unitconv": {
		Keywords: []string{"단위변환", "km", "마일", "온도", "convert"},
		Examples: []string{
			"10km는 마일로 얼마야?",
			"화씨 100도는 섭씨로?",
			"30평은 몇 제곱미터?",
			"5파운드는 몇 킬로야?",
		},
	},
	"color": {
		Keywords: []string{"색상", "HEX", "RGB", "HSL", "color"},
		Examples: []string{
			"#FF5733 색상 정보 알려줘",
			"빨강색 RGB 값은?",
			"rgb(100,200,50) 헥스 코드는?",
			"coral 색상 코드 알려줘",
		},
	},
	"encode": {
		Keywords: []string{"인코딩", "디코딩", "base64", "encode", "decode"},
		Examples: []string{
			"Hello World를 Base64로 인코딩해줘",
			"SGVsbG8= 디코딩해줘",
			"한글 URL 인코딩해줘",
			"HTML 특수문자 이스케이프해줘",
		},
	},
	"hash": {
		Keywords: []string{"해시", "MD5", "SHA256", "hash"},
		Examples: []string{
			"이 텍스트 SHA256 해시 만들어줘",
			"Hello World MD5 해시값 알려줘",
			"SHA512로 해시 생성해줘",
		},
	},
	"wordcount": {
		Keywords: []string{"글자수", "단어수", "문자수", "word count"},
		Examples: []string{
			"이 글 글자수 세줘",
			"몇 단어인지 알려줘",
			"문장 수도 알려줘",
			"바이트 크기 분석해줘",
		},
	},
	"random": {
		Keywords: []string{"랜덤", "골라줘", "뭐먹을까", "주사위", "random", "pick"},
		Examples: []string{
			"짜장면, 짬뽕 중에 골라줘",
			"1~45에서 6개 뽑아줘",
			"동전 던져줘",
			"주사위 2개 굴려줘",
			"8자리 비밀번호 생성해줘",
		},
	},
	"ip": {
		Keywords: []string{"IP", "IP주소", "도메인", "ip address", "lookup"},
		Examples: []string{
			"8.8.8.8 어디야?",
			"내 공인 IP 알려줘",
			"google.com 서버 어디야?",
			"이 IP 위치 조회해줘",
		},
	},
	"horoscope": {
		Keywords: []string{"운세", "별자리", "오늘의 운세", "horoscope", "zodiac"},
		Examples: []string{
			"사자자리 오늘 운세 알려줘",
			"양자리 운세는?",
			"오늘 물고기자리 운세",
			"leo horoscope today",
		},
	},
	"google": {
		Keywords: []string{"구글", "캘린더", "드라이브", "gmail", "google"},
		Examples: []string{
			"구글 캘린더에 내일 오후 3시 병원 일정 추가해줘",
			"이번 주 일정 보여줘",
			"받은 메일 확인해줘",
			"구글 드라이브 파일 업로드해줘",
		},
	},
	"notion": {
		Keywords: []string{"노션", "페이지", "데이터베이스", "notion", "database"},
		Examples: []string{
			"내 노션에서 프로젝트 페이지 찾아줘",
			"Task DB에서 완료된 항목만 보여줘",
			"이 할일 상태를 완료로 바꿔줘",
			"독서 기록 노트에 내용 추가해줘",
		},
	},
	"github": {
		Keywords: []string{"깃허브", "저장소", "이슈", "PR", "github", "repo"},
		Examples: []string{
			"내 GitHub 저장소 목록 보여줘",
			"starnion 저장소 열린 이슈 보여줘",
			"버그 이슈 만들어줘",
			"PR #42 상세 내용 알려줘",
			"useState 관련 코드 찾아줘",
		},
	},
	"browser": {
		Keywords: []string{"브라우저", "URL", "웹사이트", "스크린샷", "browser"},
		Examples: []string{
			"네이버에서 오늘 날씨 검색해줘",
			"구글 지도 스크린샷 찍어줘",
			"이 웹페이지 로그인 버튼 클릭해줘",
			"https://example.com 열어줘",
		},
	},
	"briefing": {
		Keywords: []string{"브리핑", "요약", "부재중", "briefing", "catch up"},
		Examples: []string{
			"무슨 일 있었어?",
			"내가 없는 동안 뭐 있었어?",
			"오늘 브리핑 해줘",
			"캐치업 해줘",
		},
	},
	"usage": {
		Keywords: []string{"사용량", "비용", "토큰", "usage", "cost", "token"},
		Examples: []string{
			"이번 달 AI 비용 얼마야?",
			"오늘 몇 번 대화했어?",
			"어떤 모델을 가장 많이 썼어?",
			"지난 7일 일별 사용량 보여줘",
		},
	},
	"coding_agent": {
		Keywords: []string{"코딩", "구현", "리팩토링", "테스트", "coding", "implement"},
		Examples: []string{
			"Python으로 할일 관리 CLI 만들어줘",
			"이 코드 리팩토링해줘",
			"단위 테스트 추가해줘",
			"README 작성해줘",
			"auth 모듈 버그 수정해줘",
		},
	},
}

// GetMeta returns keywords and examples for a skill ID.
// Returns empty slices if the skill is not found.
func GetMeta(skillID string) (keywords []string, examples []string) {
	if m, ok := skillMetaMap[skillID]; ok {
		return m.Keywords, m.Examples
	}
	return []string{}, []string{}
}
