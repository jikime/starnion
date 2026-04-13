package cron

import "testing"

func TestHumanizeCron(t *testing.T) {
	cases := []struct {
		name, expr, lang, want string
	}{
		// every N minutes
		{"every 5m ko", "*/5 * * * *", "", "5분마다"},
		{"every 5m en", "*/5 * * * *", "en", "Every 5 minutes"},
		{"every 5m ja", "*/5 * * * *", "ja", "5分ごと"},
		{"every 5m zh", "*/5 * * * *", "zh", "每5分钟"},

		// every N hours
		{"every 2h ko", "0 */2 * * *", "", "2시간마다"},
		{"every 2h en", "0 */2 * * *", "en", "Every 2 hours"},

		// daily at HH:MM
		{"daily ko", "30 8 * * *", "", "매일 08:30"},
		{"daily en", "30 8 * * *", "en", "Daily at 08:30"},
		{"daily ja", "30 8 * * *", "ja", "毎日 08時30分"},
		{"daily zh", "30 8 * * *", "zh", "每天 08:30"},

		// weekday at HH:MM
		{"mon 9am ko", "0 9 * * 1", "", "월요일 09:00"},
		{"mon 9am en", "0 9 * * 1", "en", "Mon at 09:00"},
		{"fri 17:30 en", "30 17 * * 5", "en", "Fri at 17:30"},

		// day of month
		{"monthly ko", "0 10 15 * *", "", "매월 15일 10:00"},
		{"monthly en", "0 10 15 * *", "en", "Day 15 of month at 10:00"},

		// passthrough when not recognised
		{"empty passthrough", "", "", ""},
		{"short passthrough", "bogus", "en", "bogus"},
		{"6-field passthrough", "0 0 * * * *", "en", "0 0 * * * *"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := HumanizeCron(tc.expr, tc.lang)
			if got != tc.want {
				t.Errorf("HumanizeCron(%q, %q) = %q, want %q", tc.expr, tc.lang, got, tc.want)
			}
		})
	}
}

func TestTwoFormatsLeadingZero(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{
		{0, "00"},
		{5, "05"},
		{9, "09"},
		{10, "10"},
		{59, "59"},
	}
	for _, tc := range cases {
		if got := two(tc.in); got != tc.want {
			t.Errorf("two(%d) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIsIntAndParseInt(t *testing.T) {
	if !isInt("42") {
		t.Errorf("isInt(42) must be true")
	}
	if isInt("") {
		t.Errorf("isInt(empty) must be false")
	}
	if isInt("1a") {
		t.Errorf("isInt(1a) must be false")
	}
	if parseInt("123") != 123 {
		t.Errorf("parseInt(123) must be 123")
	}
}

func TestCronWeekdayOutOfRange(t *testing.T) {
	// Out-of-range weekday returns empty string so callers can
	// gracefully drop the label instead of panicking on slice index.
	if cronWeekdayKR(-1) != "" || cronWeekdayKR(7) != "" {
		t.Errorf("expected empty string for out-of-range Korean weekday")
	}
	if cronWeekdayEN(10) != "" {
		t.Errorf("expected empty string for out-of-range English weekday")
	}
}

func TestIsJobEnabled_DisabledNilSafe(t *testing.T) {
	// Nil prefs must not panic when checking the opt-in/opt-out list.
	if isJobEnabled(nil, "anything") {
		t.Errorf("nil prefs should return false for isJobEnabled")
	}
	if isJobDisabled(nil, "anything") {
		t.Errorf("nil prefs should return false for isJobDisabled")
	}
}

func TestIsJobEnabled_ReadsSchedulerList(t *testing.T) {
	prefs := map[string]any{
		"scheduler": map[string]any{
			"enabled_jobs":  []any{"job_a", "job_b"},
			"disabled_jobs": []any{"job_c"},
		},
	}
	if !isJobEnabled(prefs, "job_a") {
		t.Errorf("job_a should be enabled")
	}
	if isJobEnabled(prefs, "job_c") {
		t.Errorf("job_c should not be in enabled_jobs")
	}
	if !isJobDisabled(prefs, "job_c") {
		t.Errorf("job_c should be disabled")
	}
	if isJobDisabled(prefs, "job_a") {
		t.Errorf("job_a should not be in disabled_jobs")
	}
}

func TestIsJobEnabled_MalformedPrefs(t *testing.T) {
	// Defensive: wrong nested type must not crash.
	cases := []map[string]any{
		{"scheduler": "not-a-map"},
		{"scheduler": map[string]any{"enabled_jobs": "not-a-list"}},
		{"scheduler": map[string]any{"enabled_jobs": []any{42, false}}}, // non-string elements
	}
	for i, prefs := range cases {
		if isJobEnabled(prefs, "job_x") {
			t.Errorf("case %d: malformed prefs should return false", i)
		}
	}
}
