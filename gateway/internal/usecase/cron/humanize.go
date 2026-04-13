package cron

import (
	"strings"
)

// HumanizeCron converts a cron expression to a human-readable string
// in the given language (ko/en/ja/zh). Only the five common patterns
// the built-in job catalogue uses are handled; unrecognised shapes
// pass through verbatim.
func HumanizeCron(expr, lang string) string {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return expr
	}
	minF, hourF, domF, _, dowF := parts[0], parts[1], parts[2], parts[3], parts[4]

	// */N * * * * — every N minutes
	if strings.HasPrefix(minF, "*/") && hourF == "*" && domF == "*" && dowF == "*" {
		n := minF[2:]
		switch lang {
		case "en":
			return "Every " + n + " minutes"
		case "ja":
			return n + "分ごと"
		case "zh":
			return "每" + n + "分钟"
		default:
			return n + "분마다"
		}
	}
	// 0 */N * * * — every N hours
	if minF == "0" && strings.HasPrefix(hourF, "*/") && domF == "*" && dowF == "*" {
		n := hourF[2:]
		switch lang {
		case "en":
			return "Every " + n + " hours"
		case "ja":
			return n + "時間ごと"
		case "zh":
			return "每" + n + "小时"
		default:
			return n + "시간마다"
		}
	}
	// M H * * D — weekday at HH:MM
	if isInt(minF) && isInt(hourF) && domF == "*" && dowF != "*" && !strings.Contains(dowF, ",") && !strings.Contains(dowF, "/") {
		h := parseInt(hourF)
		m := parseInt(minF)
		d := parseInt(dowF)
		switch lang {
		case "en":
			return cronWeekdayEN(d) + " at " + two(h) + ":" + two(m)
		case "ja":
			return cronWeekdayJA(d) + two(h) + "時" + two(m) + "分"
		case "zh":
			return cronWeekdayZH(d) + two(h) + ":" + two(m)
		default:
			return cronWeekdayKR(d) + " " + two(h) + ":" + two(m)
		}
	}
	// M H D * * — specific day of month at HH:MM
	if isInt(minF) && isInt(hourF) && isInt(domF) && dowF == "*" {
		h := parseInt(hourF)
		m := parseInt(minF)
		d := parseInt(domF)
		switch lang {
		case "en":
			return "Day " + two(d) + " of month at " + two(h) + ":" + two(m)
		case "ja":
			return "毎月" + two(d) + "日" + two(h) + "時" + two(m) + "分"
		case "zh":
			return "每月" + two(d) + "日 " + two(h) + ":" + two(m)
		default:
			return "매월 " + two(d) + "일 " + two(h) + ":" + two(m)
		}
	}
	// M H * * * — daily at HH:MM
	if isInt(minF) && isInt(hourF) && domF == "*" && dowF == "*" {
		h := parseInt(hourF)
		m := parseInt(minF)
		switch lang {
		case "en":
			return "Daily at " + two(h) + ":" + two(m)
		case "ja":
			return "毎日 " + two(h) + "時" + two(m) + "分"
		case "zh":
			return "每天 " + two(h) + ":" + two(m)
		default:
			return "매일 " + two(h) + ":" + two(m)
		}
	}
	return expr
}

func isInt(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseInt(s string) int {
	n := 0
	for _, r := range s {
		n = n*10 + int(r-'0')
	}
	return n
}

func two(n int) string {
	if n < 10 {
		return "0" + string(rune('0'+n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}

// ── Weekday labels per language ─────────────────────────────────────

func cronWeekdayKR(d int) string {
	days := []string{"일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"}
	if d < 0 || d > 6 {
		return ""
	}
	return days[d]
}

func cronWeekdayEN(d int) string {
	days := []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	if d < 0 || d > 6 {
		return ""
	}
	return days[d]
}

func cronWeekdayJA(d int) string {
	days := []string{"日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"}
	if d < 0 || d > 6 {
		return ""
	}
	return days[d]
}

func cronWeekdayZH(d int) string {
	days := []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	if d < 0 || d > 6 {
		return ""
	}
	return days[d]
}
