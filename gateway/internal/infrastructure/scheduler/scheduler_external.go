package scheduler

// scheduler_external.go — external API fetchers used by smart_notify jobs.
//
// Split from scheduler.go (which ballooned to 2271 LOC) so the core
// dispatch loop + job definitions are not hidden among 750 LOC of
// Naver/Tavily/Google/wttr.in HTTP glue. No behaviour change: every
// function was moved verbatim from its previous location and all
// callers remain in the same `scheduler` package.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/newstarnion/gateway/internal/crypto"
	"go.uber.org/zap"
)

// ── Weather Job ───────────────────────────────────────────────────────────────
type wttrResponse struct {
	CurrentCondition []struct {
		WeatherCode   string `json:"weatherCode"`
		TempC         string `json:"temp_C"`
		FeelsLikeC    string `json:"FeelsLikeC"`
		Humidity      string `json:"humidity"`
		WindspeedKmph string `json:"windspeedKmph"`
	} `json:"current_condition"`
	NearestArea []struct {
		AreaName []struct {
			Value string `json:"value"`
		} `json:"areaName"`
	} `json:"nearest_area"`
	Weather []struct {
		MaxTempC string `json:"maxtempC"`
		MinTempC string `json:"mintempC"`
		Hourly   []struct {
			WeatherCode  string `json:"weatherCode"`
			ChanceOfRain string `json:"chanceofrain"`
		} `json:"hourly"`
	} `json:"weather"`
}

// wttrWeatherDesc maps wttr.in weather codes to Korean descriptions + emoji.
func wttrWeatherDesc(code int) string {
	switch {
	case code == 113:
		return "맑음 ☀️"
	case code == 116:
		return "구름 조금 ⛅"
	case code == 119, code == 122:
		return "흐림 ☁️"
	case code == 143, code == 248, code == 260:
		return "안개 🌫️"
	case code == 200, code == 386, code == 389, code == 392, code == 395:
		return "천둥번개 ⛈️"
	case code >= 227 && code <= 230:
		return "눈보라 ❄️"
	case code >= 293 && code <= 308:
		return "비 🌧️"
	case code == 176, code == 353, code == 356, code == 359:
		return "소나기 🌦️"
	case code >= 179 && code <= 185, code >= 311 && code <= 320, code >= 362 && code <= 377:
		return "진눈깨비 🌨️"
	case code >= 323 && code <= 338, code >= 368 && code <= 371:
		return "눈 🌨️"
	case code == 350:
		return "우박 ❄️"
	case code >= 263 && code <= 284:
		return "이슬비 🌦️"
	default:
		return "알 수 없음 🌈"
	}
}

// cityFromTimezone derives a city name from an IANA timezone string.
// "Asia/Seoul"         → "Seoul"
// "America/New_York"   → "New York"
// "America/Los_Angeles"→ "Los Angeles"
func cityFromTimezone(tz string) string {
	parts := strings.SplitN(tz, "/", 2)
	if len(parts) == 2 && parts[1] != "" {
		return strings.ReplaceAll(parts[1], "_", " ")
	}
	return "Seoul"
}

// smartDailyWeather fetches today's weather via wttr.in and sends a morning
// summary (매일 오전 6시).
// Location priority: preferences->>'location' > timezone-derived city > Seoul.
// Sends at most once per day.
func (s *Scheduler) smartDailyWeather(ctx context.Context, userID string) (string, bool) {
	if s.alreadySentToday(ctx, userID, "daily_weather") {
		return "", true
	}

	// Resolve location:
	//  1. preferences->>'location'  (explicit city set by user)
	//  2. city derived from preferences->>'timezone'
	//  3. fallback "Seoul"
	var locationPref, timezone pgtype.Text
	s.db.Pool().QueryRow(ctx,
		`SELECT preferences->>'location', COALESCE(preferences->>'timezone', 'Asia/Seoul')
		 FROM users WHERE id = $1::uuid`,
		userID,
	).Scan(&locationPref, &timezone)

	location := "Seoul"
	if locationPref.Valid && strings.TrimSpace(locationPref.String) != "" {
		location = strings.TrimSpace(locationPref.String)
	} else if timezone.Valid && timezone.String != "" {
		location = cityFromTimezone(timezone.String)
	}

	// Call wttr.in JSON API (no key required).
	apiURL := fmt.Sprintf("https://wttr.in/%s?format=j1", url.QueryEscape(location))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		s.logger.Warn("scheduler: weather request build failed", zap.Error(err))
		return "", true
	}
	req.Header.Set("User-Agent", "starnion-weather/1.0")

	resp, err := doExternalHTTP(ctx, req, 10*time.Second)
	if err != nil {
		s.logger.Warn("scheduler: weather fetch failed", zap.Error(err))
		return "", true
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", true
	}

	// wttr.in sometimes wraps data under "data" key.
	var outer map[string]json.RawMessage
	var wttr wttrResponse
	if json.Unmarshal(body, &outer) == nil {
		if raw, ok := outer["data"]; ok {
			json.Unmarshal(raw, &wttr) //nolint:errcheck
		} else {
			json.Unmarshal(body, &wttr) //nolint:errcheck
		}
	}

	if len(wttr.CurrentCondition) == 0 {
		s.logger.Warn("scheduler: weather response empty", zap.String("location", location))
		return "", true
	}

	cur := wttr.CurrentCondition[0]
	code, _ := strconv.Atoi(cur.WeatherCode)
	desc := wttrWeatherDesc(code)

	// Display name from nearest_area if available.
	displayName := location
	if len(wttr.NearestArea) > 0 && len(wttr.NearestArea[0].AreaName) > 0 {
		displayName = wttr.NearestArea[0].AreaName[0].Value
	}

	msg := fmt.Sprintf("[오늘 날씨] %s - %s\n기온: %s°C (체감 %s°C), 습도: %s%%",
		displayName, desc, cur.TempC, cur.FeelsLikeC, cur.Humidity)

	// Today's forecast if available.
	if len(wttr.Weather) > 0 {
		today := wttr.Weather[0]
		maxRain := 0
		for _, h := range today.Hourly {
			if r, err := strconv.Atoi(h.ChanceOfRain); err == nil && r > maxRain {
				maxRain = r
			}
		}
		msg += fmt.Sprintf("\n예보: 최저 %s°C ~ 최고 %s°C, 강수확률 %d%%",
			today.MinTempC, today.MaxTempC, maxRain)
		if maxRain >= 40 {
			msg += "\n우산을 챙기세요! ☂️"
		}
	}

	return msg, false
}

// ── Naver Search Jobs ─────────────────────────────────────────────────────────

// naverSearchItem mirrors the Naver Search API response item.
type naverSearchItem struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Link        string `json:"link"`
}

// naverCredsForUser returns (clientID, clientSecret) for the given user.
// Priority: per-user integration_keys (decrypted) → global server config.
// Returns ("", "") when neither is configured.
func (s *Scheduler) naverCredsForUser(ctx context.Context, userID string) (string, string) {
	var raw string
	if err := s.db.Pool().QueryRow(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1::uuid AND provider = 'naver_search' LIMIT 1`,
		userID,
	).Scan(&raw); err == nil && raw != "" {
		plain := raw
		if s.encryptionKey != "" {
			if dec, err := crypto.Decrypt(raw, s.encryptionKey); err == nil && dec != "" {
				plain = dec
			}
		}
		if idx := strings.Index(plain, ":"); idx > 0 {
			return plain[:idx], plain[idx+1:]
		}
		return plain, ""
	}
	// Fall back to global credentials (server-level config)
	return s.naverClientID, s.naverClientSecret
}

// naverSearch calls the Naver Search API (news, blog, local, …) and returns up to
// `display` items. clientID and clientSecret must be non-empty.
func (s *Scheduler) naverSearch(ctx context.Context, clientID, clientSecret, apiType, query string, display int) ([]naverSearchItem, error) {
	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("naver search credentials not configured")
	}
	apiURL := fmt.Sprintf(
		"https://openapi.naver.com/v1/search/%s.json?query=%s&display=%d&sort=date",
		apiType, url.QueryEscape(query), display,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Naver-Client-Id", clientID)
	req.Header.Set("X-Naver-Client-Secret", clientSecret)

	resp, err := doExternalHTTP(ctx, req, 10*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("naver search: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var result struct {
		Items []naverSearchItem `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result.Items, nil
}

// stripHTML removes HTML tags from Naver Search API title/description strings.
func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// smartDailyNews fetches today's top news via Naver Search API (매일 오전 7시).
// Sends at most once per day.
func (s *Scheduler) smartDailyNews(ctx context.Context, userID string) (string, bool) {
	if s.alreadySentToday(ctx, userID, "daily_news") {
		return "", true
	}

	clientID, clientSecret := s.naverCredsForUser(ctx, userID)
	items, err := s.naverSearch(ctx, clientID, clientSecret, "news", "오늘 주요 뉴스", 5)
	if err != nil {
		s.logger.Warn("scheduler: naver news search failed", zap.Error(err))
		return "", true
	}
	if len(items) == 0 {
		return "", true
	}

	var lines []string
	lines = append(lines, "[오늘의 뉴스]")
	for i, item := range items {
		if i >= 5 {
			break
		}
		lines = append(lines, fmt.Sprintf("%d. %s", i+1, stripHTML(item.Title)))
	}
	return strings.Join(lines, "\n"), false
}

// smartLocalEvents fetches today's local events/activities via Naver local search (매일 오후 12시).
// Sends at most once per day.
func (s *Scheduler) smartLocalEvents(ctx context.Context, userID string) (string, bool) {
	if s.alreadySentToday(ctx, userID, "local_events") {
		return "", true
	}

	clientID, clientSecret := s.naverCredsForUser(ctx, userID)
	// Naver local API searches businesses/places; use news API for event listings.
	items, err := s.naverSearch(ctx, clientID, clientSecret, "news", "지역 이벤트 행사 축제", 5)
	if err != nil {
		s.logger.Warn("scheduler: naver local events search failed", zap.Error(err))
		return "", true
	}
	if len(items) == 0 {
		return "", true
	}

	var lines []string
	lines = append(lines, "[오늘의 지역 이벤트]")
	for i, item := range items {
		if i >= 5 {
			break
		}
		lines = append(lines, fmt.Sprintf("%d. %s", i+1, stripHTML(item.Title)))
	}
	return strings.Join(lines, "\n"), false
}

// smartItBlogDigest fetches today's IT blog posts via Naver blog search (매일 오후 6시).
// Sends at most once per day.
func (s *Scheduler) smartItBlogDigest(ctx context.Context, userID string) (string, bool) {
	if s.alreadySentToday(ctx, userID, "it_blog_digest") {
		return "", true
	}

	clientID, clientSecret := s.naverCredsForUser(ctx, userID)
	items, err := s.naverSearch(ctx, clientID, clientSecret, "blog", "IT 기술 트렌드", 5)
	if err != nil {
		s.logger.Warn("scheduler: naver blog search failed", zap.Error(err))
		return "", true
	}
	if len(items) == 0 {
		return "", true
	}

	var lines []string
	lines = append(lines, "[오늘의 IT 블로그]")
	for i, item := range items {
		if i >= 5 {
			break
		}
		lines = append(lines, fmt.Sprintf("%d. %s", i+1, stripHTML(item.Title)))
	}
	return strings.Join(lines, "\n"), false
}

// ── Tavily IT News Job ────────────────────────────────────────────────────────

// tavilyAPIKey returns the user's Tavily API key from integration_keys (decrypted).
// Returns "" when not configured.
func (s *Scheduler) tavilyAPIKey(ctx context.Context, userID string) string {
	var raw string
	if err := s.db.Pool().QueryRow(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1::uuid AND provider = 'tavily' LIMIT 1`,
		userID,
	).Scan(&raw); err != nil || raw == "" {
		return ""
	}
	if s.encryptionKey != "" {
		if dec, err := crypto.Decrypt(raw, s.encryptionKey); err == nil && dec != "" {
			return dec
		}
	}
	return raw
}

// tavilyNewsQueryForLang returns a localised "today's major news" query string and
// a human-readable header based on the user's language preference code (ko/en/ja/zh).
func tavilyNewsQueryForLang(lang string) (query, header string) {
	switch lang {
	case "ko":
		return "오늘의 주요 뉴스", "[오늘의 주요 뉴스]"
	case "ja":
		return "今日の主要ニュース", "[今日の主要ニュース]"
	case "zh":
		return "今日重要新闻", "[今日重要新闻]"
	default: // "en" and any future codes
		return "today's top news", "[Today's Top News]"
	}
}

// smartTavilyNews fetches today's major news via Tavily Search API (매일 오전 8시 30분).
// Skips if the user has no Tavily API key configured. Sends at most once per day.
func (s *Scheduler) smartTavilyNews(ctx context.Context, userID string) (string, bool) {
	apiKey := s.tavilyAPIKey(ctx, userID)
	if apiKey == "" {
		return "", true // no key configured → skip silently
	}

	if s.alreadySentToday(ctx, userID, "tavily_news") {
		return "", true
	}

	// Determine query language from user's language preference
	var lang string
	s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(preferences->>'language', 'ko') FROM users WHERE id = $1::uuid`,
		userID,
	).Scan(&lang)
	query, header := tavilyNewsQueryForLang(lang)

	// Call Tavily
	payload := map[string]any{
		"query":          query,
		"max_results":    5,
		"search_depth":   "basic",
		"topic":          "news",
		"time_range":     "day",
		"include_answer": false,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.tavily.com/search", strings.NewReader(string(body)))
	if err != nil {
		s.logger.Warn("scheduler: tavily it news request failed", zap.Error(err))
		return "", true
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := doExternalHTTP(ctx, req, 15*time.Second)
	if err != nil {
		s.logger.Warn("scheduler: tavily it news request failed", zap.Error(err))
		return "", true
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		s.logger.Warn("scheduler: tavily it news HTTP error", zap.Int("status", resp.StatusCode))
		return "", true
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", true
	}
	var result struct {
		Results []struct {
			Title string `json:"title"`
			URL   string `json:"url"`
		} `json:"results"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil || len(result.Results) == 0 {
		return "", true
	}

	lines := []string{header}
	for i, r := range result.Results {
		if i >= 5 {
			break
		}
		lines = append(lines, fmt.Sprintf("%d. %s", i+1, r.Title))
	}
	return strings.Join(lines, "\n"), false
}

// ── Google Workspace ──────────────────────────────────────────────────────────

// getGoogleAccessToken retrieves a valid (non-expired) Google access token for
// the given user. It decrypts the stored token and refreshes it if expired.
// Returns "" when no Google token exists for the user.
func (s *Scheduler) getGoogleAccessToken(ctx context.Context, userID string) string {
	var encAccess, encRefresh, tokenURI string
	var expiresAt time.Time
	err := s.db.Pool().QueryRow(ctx,
		`SELECT access_token, refresh_token, token_uri, expires_at
		   FROM google_tokens WHERE user_id = $1::uuid`,
		userID,
	).Scan(&encAccess, &encRefresh, &tokenURI, &expiresAt)
	if err != nil {
		return "" // no token stored
	}

	// Decrypt access token
	accessToken := encAccess
	if s.encryptionKey != "" {
		if dec, err := crypto.Decrypt(encAccess, s.encryptionKey); err == nil && dec != "" {
			accessToken = dec
		}
	}

	// Still valid? Return immediately.
	if time.Now().Add(30 * time.Second).Before(expiresAt) {
		return accessToken
	}

	// Token expired — refresh using refresh_token
	if s.googleClientID == "" || s.googleClientSecret == "" {
		return accessToken // can't refresh without client creds, try anyway
	}
	refreshToken := encRefresh
	if s.encryptionKey != "" {
		if dec, err := crypto.Decrypt(encRefresh, s.encryptionKey); err == nil && dec != "" {
			refreshToken = dec
		}
	}
	if tokenURI == "" {
		tokenURI = "https://oauth2.googleapis.com/token"
	}

	formBody := url.Values{
		"client_id":     {s.googleClientID},
		"client_secret": {s.googleClientSecret},
		"refresh_token": {refreshToken},
		"grant_type":    {"refresh_token"},
	}.Encode()
	tokenReq, _ := http.NewRequest(http.MethodPost, tokenURI, strings.NewReader(formBody))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := doExternalHTTP(ctx, tokenReq, 10*time.Second)
	if err != nil || resp.StatusCode != http.StatusOK {
		return accessToken // return old token, let Google API handle the error
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil || tokenResp.AccessToken == "" {
		return accessToken
	}

	// Persist refreshed token (best-effort, encrypted)
	newAccess := tokenResp.AccessToken
	newExpiry := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	encNew := newAccess
	if s.encryptionKey != "" {
		if enc, err := crypto.Encrypt(newAccess, s.encryptionKey); err == nil {
			encNew = enc
		}
	}
	_, _ = s.db.Pool().Exec(ctx,
		`UPDATE google_tokens SET access_token = $1, expires_at = $2, updated_at = NOW()
		   WHERE user_id = $3::uuid`,
		encNew, newExpiry, userID,
	)
	return newAccess
}

// getUserLang returns the user's preferred UI language (ko/en/ja/zh).
func (s *Scheduler) getUserLang(ctx context.Context, userID string) string {
	var lang string
	_ = s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(preferences->>'language', 'ko') FROM users WHERE id = $1::uuid`,
		userID,
	).Scan(&lang)
	if lang == "" {
		lang = "ko"
	}
	return lang
}

// smartGoogleCalendarDigest sends this week's Google Calendar events.
func (s *Scheduler) smartGoogleCalendarDigest(ctx context.Context, userID string) (string, bool) {
	token := s.getGoogleAccessToken(ctx, userID)
	if token == "" {
		return "", true // Google not connected
	}

	if s.alreadySentToday(ctx, userID, "google_calendar_digest") {
		return "", true
	}

	lang := s.getUserLang(ctx, userID)

	// This week: Monday 00:00 → Sunday 23:59 (UTC)
	now := time.Now().UTC()
	weekday := int(now.Weekday()) // 0=Sun
	if weekday == 0 {
		weekday = 7
	}
	monday := now.AddDate(0, 0, -(weekday - 1))
	monday = time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
	sunday := monday.AddDate(0, 0, 6)
	sunday = time.Date(sunday.Year(), sunday.Month(), sunday.Day(), 23, 59, 59, 0, time.UTC)

	calURL := "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
		"?timeMin=" + url.QueryEscape(monday.Format(time.RFC3339)) +
		"&timeMax=" + url.QueryEscape(sunday.Format(time.RFC3339)) +
		"&singleEvents=true&orderBy=startTime&maxResults=20"

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, calURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := doExternalHTTP(ctx, req, 15*time.Second)
	if err != nil {
		s.logger.Warn("scheduler: google calendar request failed", zap.Error(err))
		return "", true
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		s.logger.Warn("scheduler: google calendar HTTP error", zap.Int("status", resp.StatusCode))
		return "", true
	}

	var calResp struct {
		Items []struct {
			Summary string `json:"summary"`
			Start   struct {
				DateTime string `json:"dateTime"`
				Date     string `json:"date"`
			} `json:"start"`
		} `json:"items"`
	}
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &calResp); err != nil {
		return "", true
	}
	if len(calResp.Items) == 0 {
		return "", true // no events this week → skip
	}

	var header string
	switch lang {
	case "en":
		header = "📅 This Week's Schedule"
	case "ja":
		header = "📅 今週のスケジュール"
	case "zh":
		header = "📅 本周日程"
	default:
		header = "📅 이번 주 일정"
	}

	lines := []string{header}
	for _, ev := range calResp.Items {
		when := ev.Start.DateTime
		if when == "" {
			when = ev.Start.Date
		}
		// Format datetime nicely: 2006-01-02T15:04:05Z07:00 → "1/2 15:04"
		t, err := time.Parse(time.RFC3339, when)
		if err == nil {
			switch lang {
			case "en":
				when = t.Format("1/2 3:04 PM")
			case "ja", "zh":
				when = fmt.Sprintf("%d/%d %02d:%02d", t.Month(), t.Day(), t.Hour(), t.Minute())
			default:
				when = fmt.Sprintf("%d/%d %02d:%02d", t.Month(), t.Day(), t.Hour(), t.Minute())
			}
		} else if len(when) == 10 { // date-only: "2006-01-02"
			dt, err2 := time.Parse("2006-01-02", when)
			if err2 == nil {
				when = fmt.Sprintf("%d/%d", dt.Month(), dt.Day())
			}
		}
		lines = append(lines, fmt.Sprintf("• %s %s", when, ev.Summary))
	}
	return strings.Join(lines, "\n"), false
}

// smartGoogleGmailDigest sends the 5 most recent Gmail messages.
func (s *Scheduler) smartGoogleGmailDigest(ctx context.Context, userID string) (string, bool) {
	token := s.getGoogleAccessToken(ctx, userID)
	if token == "" {
		return "", true
	}

	if s.alreadySentToday(ctx, userID, "google_gmail_digest") {
		return "", true
	}

	lang := s.getUserLang(ctx, userID)

	// 1. Fetch message list
	listURL := "https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=5&labelIds=INBOX"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, listURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := doExternalHTTP(ctx, req, 15*time.Second)
	if err != nil {
		s.logger.Warn("scheduler: gmail list request failed", zap.Error(err))
		return "", true
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		s.logger.Warn("scheduler: gmail list HTTP error", zap.Int("status", resp.StatusCode))
		return "", true
	}

	var listResp struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &listResp); err != nil || len(listResp.Messages) == 0 {
		return "", true
	}

	// 2. Fetch subject + sender for each message IN PARALLEL.
	//
	// Gmail's `messages.list` only returns ID stubs — subject/sender
	// require a second fetch per message. The loop used to be
	// sequential, paying the full round-trip per message, which
	// dominated the scheduler tick latency for users with Gmail
	// enabled (5 messages × 15s timeout = up to 75s worst case).
	// Fan-out across a bounded goroutine pool collapses the cost
	// into a single round-trip window while the per-request
	// `doExternalHTTP` timeout bounds the tail. Gmail's official
	// batch API (`POST /batch/gmail/v1`) would achieve the same
	// effect in one request, but its multipart/mixed MIME envelope
	// is significantly more complex to assemble than this 30-line
	// fan-out — and the savings are identical from the caller's
	// perspective because Gmail enforces the same overall quota.
	type mailItem struct {
		idx     int // preserve list order
		from    string
		subject string
	}
	type fetchResult struct {
		item mailItem
		ok   bool
	}
	results := make(chan fetchResult, len(listResp.Messages))
	var fetchWG sync.WaitGroup
	for i, msg := range listResp.Messages {
		fetchWG.Add(1)
		go func(idx int, msgID string) {
			defer fetchWG.Done()
			msgURL := "https://www.googleapis.com/gmail/v1/users/me/messages/" + msgID +
				"?format=metadata&metadataHeaders=From&metadataHeaders=Subject"
			mReq, _ := http.NewRequest(http.MethodGet, msgURL, nil)
			mReq.Header.Set("Authorization", "Bearer "+token)
			mResp, err := doExternalHTTP(ctx, mReq, 15*time.Second)
			if err != nil || mResp.StatusCode != http.StatusOK {
				if mResp != nil {
					mResp.Body.Close()
				}
				results <- fetchResult{ok: false}
				return
			}
			defer mResp.Body.Close()

			var msgDetail struct {
				Payload struct {
					Headers []struct {
						Name  string `json:"name"`
						Value string `json:"value"`
					} `json:"headers"`
				} `json:"payload"`
			}
			mBody, _ := io.ReadAll(mResp.Body)
			if err := json.Unmarshal(mBody, &msgDetail); err != nil {
				results <- fetchResult{ok: false}
				return
			}
			var from, subject string
			for _, h := range msgDetail.Payload.Headers {
				switch h.Name {
				case "From":
					from = h.Value
				case "Subject":
					subject = h.Value
				}
			}
			// Trim long sender display names: "John Doe <john@example.com>" → "John Doe"
			if idx := strings.Index(from, " <"); idx > 0 {
				from = from[:idx]
			}
			if subject == "" {
				subject = "(no subject)"
			}
			results <- fetchResult{item: mailItem{idx: idx, from: from, subject: subject}, ok: true}
		}(i, msg.ID)
	}
	fetchWG.Wait()
	close(results)

	// Collect successful fetches and restore list order (the fan-out
	// goroutines finish in non-deterministic order).
	buf := make([]mailItem, len(listResp.Messages))
	var count int
	for r := range results {
		if r.ok {
			buf[r.item.idx] = r.item
			count++
		}
	}
	items := make([]mailItem, 0, count)
	for _, m := range buf {
		if m.from != "" || m.subject != "" {
			items = append(items, m)
		}
	}

	if len(items) == 0 {
		return "", true
	}

	var header string
	switch lang {
	case "en":
		header = "📬 Recent Emails (Top 5)"
	case "ja":
		header = "📬 最近のメール (最新5件)"
	case "zh":
		header = "📬 最近邮件 (最新5封)"
	default:
		header = "📬 최근 메일 5개"
	}

	lines := []string{header}
	for i, item := range items {
		lines = append(lines, fmt.Sprintf("%d. [%s] %s", i+1, item.from, item.subject))
	}
	return strings.Join(lines, "\n"), false
}

// formatKRW formats an integer as a comma-separated Korean Won amount (e.g. 1,234,567).
func formatKRW(amount int64) string {
	s := strconv.FormatInt(amount, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return b.String()
}
