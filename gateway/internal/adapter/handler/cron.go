package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// ScheduleWaker signals the scheduler to re-arm its event-driven timer.
// Implemented by *scheduler.Scheduler; may be nil before the scheduler starts.
type ScheduleWaker interface {
	Wake()
}

// JobTriggerer forces a single builtin job to fire immediately for a given user.
// Implemented by *scheduler.Scheduler.
type JobTriggerer interface {
	TriggerJob(ctx context.Context, jobID, userID string) (msg string, sent bool, err error)
}

type CronHandler struct {
	db        *database.DB
	config    *config.Config
	logger    *zap.Logger
	sched     ScheduleWaker // optional; nil-safe
	triggerer JobTriggerer  // optional; nil-safe
}

func NewCronHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *CronHandler {
	return &CronHandler{db: db, config: cfg, logger: logger}
}

// SetScheduler wires the event-driven scheduler into the cron handler so that
// create/update/delete operations immediately re-arm the user schedule timer.
func (h *CronHandler) SetScheduler(w ScheduleWaker) {
	h.sched = w
	if jt, ok := w.(JobTriggerer); ok {
		h.triggerer = jt
	}
}

func (h *CronHandler) wake() {
	if h.sched != nil {
		h.sched.Wake()
	}
}

// ── System Jobs ────────────────────────────────────────────────────────────────

type systemJobResponse struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Schedule      string `json:"schedule"`
	HumanSchedule string `json:"human_schedule"`
	Level         string `json:"level"`
	Enabled       bool   `json:"enabled"`
	CanDisable    bool   `json:"can_disable"`
}

// humanizeCronLang converts a cron expression to a human-readable string in the given language (ko/en/ja/zh).
func humanizeCronLang(expr, lang string) string {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return expr
	}
	minF, hourF, domF, _, dowF := parts[0], parts[1], parts[2], parts[3], parts[4]

	// */N * * * * — every N minutes
	if strings.HasPrefix(minF, "*/") && hourF == "*" && domF == "*" && dowF == "*" {
		n := strings.TrimPrefix(minF, "*/")
		switch lang {
		case "en":
			return "every " + n + " minutes"
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
		n := strings.TrimPrefix(hourF, "*/")
		switch lang {
		case "en":
			return "every " + n + " hours"
		case "ja":
			return n + "時間ごと"
		case "zh":
			return "每" + n + "小时"
		default:
			return n + "시간마다"
		}
	}
	// 0 H * * DOW — weekly on specific day
	if minF == "0" && domF == "*" && dowF != "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			if d, errD := strconv.Atoi(dowF); errD == nil {
				switch lang {
				case "en":
					return "every " + cronWeekdayEN(d) + " at " + cronHourEN(h)
				case "ja":
					return "毎週" + cronWeekdayJA(d) + " " + cronHourJA(h)
				case "zh":
					return "每周" + cronWeekdayZH(d) + cronHourZH(h)
				default:
					return "매주 " + cronWeekdayKR(d) + " " + cronHourKR(h)
				}
			}
		}
	}
	// 0 H D * * — monthly on day D
	if minF == "0" && dowF == "*" && domF != "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			if d, errD := strconv.Atoi(domF); errD == nil {
				switch lang {
				case "en":
					return fmt.Sprintf("monthly on the %d at %s", d, cronHourEN(h))
				case "ja":
					return fmt.Sprintf("毎月%d日 %s", d, cronHourJA(h))
				case "zh":
					return fmt.Sprintf("每月%d日%s", d, cronHourZH(h))
				default:
					return fmt.Sprintf("매월 %d일 %s", d, cronHourKR(h))
				}
			}
		}
	}
	// 0 H * * * — daily at H
	if minF == "0" && domF == "*" && dowF == "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			switch lang {
			case "en":
				return "daily at " + cronHourEN(h)
			case "ja":
				return "毎日 " + cronHourJA(h)
			case "zh":
				return "每天" + cronHourZH(h)
			default:
				return "매일 " + cronHourKR(h)
			}
		}
	}
	// M H * * * — daily at H:M
	if domF == "*" && dowF == "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			if m, errM := strconv.Atoi(minF); errM == nil {
				switch lang {
				case "en":
					return fmt.Sprintf("daily at %s %d min", cronHourEN(h), m)
				case "ja":
					return fmt.Sprintf("毎日 %s%d分", cronHourJA(h), m)
				case "zh":
					return fmt.Sprintf("每天%s%d分", cronHourZH(h), m)
				default:
					return fmt.Sprintf("매일 %s %d분", cronHourKR(h), m)
				}
			}
		}
	}
	return expr
}

func cronHourKR(h int) string {
	switch {
	case h == 0:
		return "오전 12시"
	case h < 12:
		return fmt.Sprintf("오전 %d시", h)
	case h == 12:
		return "오후 12시"
	default:
		return fmt.Sprintf("오후 %d시", h-12)
	}
}

func cronHourEN(h int) string {
	switch {
	case h == 0:
		return "12:00 AM"
	case h < 12:
		return fmt.Sprintf("%d:00 AM", h)
	case h == 12:
		return "12:00 PM"
	default:
		return fmt.Sprintf("%d:00 PM", h-12)
	}
}

func cronHourJA(h int) string {
	switch {
	case h < 12:
		return fmt.Sprintf("午前%d時", h)
	case h == 12:
		return "午後12時"
	default:
		return fmt.Sprintf("午後%d時", h-12)
	}
}

func cronHourZH(h int) string {
	switch {
	case h < 12:
		return fmt.Sprintf("上午%d点", h)
	case h == 12:
		return "下午12点"
	default:
		return fmt.Sprintf("下午%d点", h-12)
	}
}

func cronWeekdayKR(d int) string {
	days := []string{"일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"}
	if d >= 0 && d < len(days) {
		return days[d]
	}
	return strconv.Itoa(d) + "요일"
}

func cronWeekdayEN(d int) string {
	days := []string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}
	if d >= 0 && d < len(days) {
		return days[d]
	}
	return strconv.Itoa(d)
}

func cronWeekdayJA(d int) string {
	days := []string{"日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"}
	if d >= 0 && d < len(days) {
		return days[d]
	}
	return strconv.Itoa(d) + "曜日"
}

func cronWeekdayZH(d int) string {
	days := []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	if d >= 0 && d < len(days) {
		return days[d]
	}
	return "周" + strconv.Itoa(d)
}

// jobI18n holds translated name and description for a single job.
type jobI18n struct{ Name, Description string }

// jobTranslations[lang][jobID] — non-Korean translations for system jobs.
var jobTranslations = map[string]map[string]jobI18n{
	"en": {
		"daily_summary":         {Name: "Daily Finance Summary", Description: "Summarizes today's expenses by category"},
		"weekly_report":         {Name: "Weekly Planner Review", Description: "Summarizes this week's goal completion and spending"},
		"monthly_closing":       {Name: "Monthly Finance Report", Description: "Reviews last month's income/expenses and savings rate"},
		"inactive_reminder":     {Name: "Note Reminder", Description: "Encourages you to write a note about your day"},
		"budget_warning":        {Name: "Budget Warning", Description: "Alerts you when you're close to exceeding your budget"},
		"planner_task_reminder": {Name: "Today's Tasks", Description: "Shows today's due tasks and priority-A items"},
		"planner_goal_dday":     {Name: "Goal D-Day Alert", Description: "Shows goals due within 7 days"},
		"spending_anomaly":      {Name: "Spending Anomaly", Description: "Detects unusual spending patterns"},
		"anomaly_insights":      {Name: "Anomaly Insights", Description: "Comprehensive multi-dimensional spending anomaly analysis"},
		"pattern_analysis":      {Name: "Spending Pattern Analysis", Description: "Analyzes category spending increase patterns"},
		"pattern_insight":       {Name: "Weekly Insights", Description: "Sends weekly insights combining spending, notes, and goals"},
		"conversation_analysis": {Name: "Re-engagement Alert", Description: "Sends a Telegram alert after 3+ days of inactivity"},
		"daily_weather":         {Name: "Daily Weather", Description: "Morning weather forecast and precipitation via wttr.in"},
		"daily_news":            {Name: "Today's News (Naver)", Description: "Sends today's top news via Naver Search"},
		"local_events":          {Name: "Local Events (Naver)", Description: "Sends local events and festivals via Naver Search"},
		"it_blog_digest":        {Name: "IT Blog Digest (Naver)", Description: "Sends today's IT blog posts via Naver Search"},
		"tavily_news":              {Name: "Today's Top News (Tavily)", Description: "Sends today's top news in your language via Tavily Search"},
		"google_calendar_digest":   {Name: "This Week's Google Calendar", Description: "Sends this week's Google Calendar events every morning"},
		"google_gmail_digest":      {Name: "Recent Emails (Top 5)", Description: "Sends the 5 most recent Gmail inbox messages every morning"},
		"user_schedules":           {Name: "User Schedule Runner", Description: "Checks and runs user-created schedules every 15 minutes"},
		"memory_compaction":     {Name: "Memory Compaction", Description: "Cleans up old knowledge base entries"},
	},
	"ja": {
		"daily_summary":         {Name: "今日の財務サマリー", Description: "今日の支出をカテゴリ別にまとめます"},
		"weekly_report":         {Name: "週次プランナーレビュー", Description: "今週の目標達成率と支出状況をまとめます"},
		"monthly_closing":       {Name: "月次財務精算", Description: "先月の収支と貯蓄率をまとめます"},
		"inactive_reminder":     {Name: "ノートリマインダー", Description: "今日の出来事をノートに記録しましょう"},
		"budget_warning":        {Name: "予算警告", Description: "予算超過が近づいたときに警告します"},
		"planner_task_reminder": {Name: "今日のタスク", Description: "今日締め切りのタスクと優先度Aの項目をお知らせします"},
		"planner_goal_dday":     {Name: "目標D-Dayアラート", Description: "7日以内に締め切りの目標をお知らせします"},
		"spending_anomaly":      {Name: "異常支出検知", Description: "異常な支出パターンを検知します"},
		"anomaly_insights":      {Name: "異常支出インサイト", Description: "多次元的な支出異常を総合分析します"},
		"pattern_analysis":      {Name: "支出パターン分析", Description: "カテゴリ別支出の増加傾向を分析します"},
		"pattern_insight":       {Name: "週次インサイト", Description: "支出・ノート・目標を総合した週次インサイトを送信します"},
		"conversation_analysis": {Name: "再訪問促進", Description: "3日以上会話がない場合にTelegramで通知します"},
		"daily_weather":         {Name: "今日の天気", Description: "wttr.inによる朝の天気予報と降水確率"},
		"daily_news":            {Name: "今日のニュース (Naver)", Description: "Naver検索で今日の主要ニュースをお届けします"},
		"local_events":          {Name: "地域イベント (Naver)", Description: "Naver検索で地域のイベントや祭りをお届けします"},
		"it_blog_digest":        {Name: "ITブログダイジェスト (Naver)", Description: "Naver検索で今日のIT関連ブログ記事をお届けします"},
		"tavily_news":              {Name: "今日のトップニュース (Tavily)", Description: "Tavily検索でお使いの言語に合ったニュースをお届けします"},
		"google_calendar_digest":   {Name: "今週のGoogleカレンダー", Description: "Googleカレンダーの今週の予定を毎朝お届けします"},
		"google_gmail_digest":      {Name: "最近のメール (最新5件)", Description: "Gmailの受信トレイの最新5件を毎朝お届けします"},
		"user_schedules":           {Name: "ユーザースケジュール実行", Description: "15分ごとにユーザー作成のスケジュールを確認・実行します"},
		"memory_compaction":     {Name: "メモリ圧縮", Description: "古いナレッジベースのエントリを整理します"},
	},
	"zh": {
		"daily_summary":         {Name: "今日财务摘要", Description: "按类别汇总今日支出"},
		"weekly_report":         {Name: "每周计划回顾", Description: "汇总本周目标完成率和支出情况"},
		"monthly_closing":       {Name: "月度财务结算", Description: "回顾上月收支和储蓄率"},
		"inactive_reminder":     {Name: "记事提醒", Description: "提醒您记录今天的日记"},
		"budget_warning":        {Name: "预算警告", Description: "接近超出预算时发出警告"},
		"planner_task_reminder": {Name: "今日任务", Description: "提示今日到期任务和优先级A的事项"},
		"planner_goal_dday":     {Name: "目标倒计时", Description: "提示7天内到期的目标"},
		"spending_anomaly":      {Name: "异常消费检测", Description: "检测异常消费模式"},
		"anomaly_insights":      {Name: "异常支出洞察", Description: "综合分析多维支出异常信号"},
		"pattern_analysis":      {Name: "消费模式分析", Description: "分析各类别支出增长趋势"},
		"pattern_insight":       {Name: "每周洞察", Description: "综合支出、记事和目标发送每周洞察"},
		"conversation_analysis": {Name: "重访提醒", Description: "3天以上未对话时通过Telegram发送提醒"},
		"daily_weather":         {Name: "今日天气", Description: "通过wttr.in在早上发送天气预报和降水概率"},
		"daily_news":            {Name: "今日新闻 (Naver)", Description: "通过Naver搜索发送今日主要新闻"},
		"local_events":          {Name: "本地活动 (Naver)", Description: "通过Naver搜索发送本地活动和节庆信息"},
		"it_blog_digest":        {Name: "IT博客摘要 (Naver)", Description: "通过Naver搜索发送今日IT相关博客文章"},
		"tavily_news":              {Name: "今日头条 (Tavily)", Description: "通过Tavily搜索以您的语言发送今日头条"},
		"google_calendar_digest":   {Name: "本周Google日历", Description: "每天早上发送Google日历本周日程"},
		"google_gmail_digest":      {Name: "最近邮件 (最新5封)", Description: "每天早上发送Gmail收件箱最新5封邮件"},
		"user_schedules":           {Name: "用户日程运行器", Description: "每15分钟检查并运行用户创建的日程"},
		"memory_compaction":     {Name: "内存压缩", Description: "清理过期的知识库条目"},
	},
}

var builtinSystemJobs = []systemJobResponse{
	// Level 1: Rule-Based
	{ID: "daily_summary", Name: "오늘의 재정 요약", Description: "오늘 지출 내역을 카테고리별로 요약합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "weekly_report", Name: "주간 플래너 리뷰", Description: "이번 주 목표 달성률과 지출 현황을 요약합니다", Schedule: "0 20 * * 0", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "monthly_closing", Name: "월간 재정 정산", Description: "전월 수입/지출 총정리 및 저축률을 알려드립니다", Schedule: "0 21 1 * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "inactive_reminder", Name: "노트 리마인더", Description: "오늘 하루를 기록해보세요. 노트 작성을 유도합니다", Schedule: "0 20 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "budget_warning", Name: "예산 경고", Description: "예산 초과 임박 시 경고 알림을 전송합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true, CanDisable: true},
	// Level 2: Pattern-Learning
	{ID: "planner_task_reminder", Name: "오늘의 할 일", Description: "오늘 마감인 작업과 우선순위 A 태스크를 알려드립니다", Schedule: "0 9 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "planner_goal_dday", Name: "목표 D-Day 알림", Description: "마감 7일 이내 목표의 남은 날짜를 알려드립니다", Schedule: "0 8 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "spending_anomaly", Name: "이상 소비 감지", Description: "비정상적인 소비 패턴을 감지합니다", Schedule: "0 */3 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "anomaly_insights", Name: "이상 지출 인사이트", Description: "다차원 지출 이상 신호를 종합 분석합니다", Schedule: "0 9 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "pattern_analysis", Name: "소비 패턴 분석", Description: "카테고리 지출 증가 패턴을 분석합니다", Schedule: "0 6 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "pattern_insight", Name: "주간 인사이트", Description: "지출·노트·목표를 종합한 주간 인사이트를 전송합니다", Schedule: "0 14 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "conversation_analysis", Name: "재방문 유도", Description: "3일 이상 대화가 없을 때 텔레그램으로 알림을 보냅니다", Schedule: "0 10 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	// Level 3: External Content
	{ID: "daily_weather", Name: "오늘의 날씨", Description: "wttr.in 으로 오늘 날씨와 강수확률을 아침에 알려드립니다", Schedule: "0 6 * * *", Level: "external", Enabled: true, CanDisable: true},
	// Level 3b: Naver Search API
	{ID: "daily_news", Name: "오늘의 뉴스", Description: "네이버 검색으로 오늘의 주요 뉴스를 전송합니다", Schedule: "0 7 * * *", Level: "external", Enabled: false, CanDisable: true},
	{ID: "local_events", Name: "오늘의 지역 이벤트", Description: "네이버 지역 검색으로 오늘의 이벤트/행사를 전송합니다", Schedule: "0 12 * * *", Level: "external", Enabled: false, CanDisable: true},
	{ID: "it_blog_digest", Name: "IT 블로그 다이제스트", Description: "네이버 블로그 검색으로 오늘의 IT 관련 글을 전송합니다", Schedule: "0 18 * * *", Level: "external", Enabled: false, CanDisable: true},
	// Level 3c: Tavily Search API
	{ID: "tavily_news", Name: "오늘의 주요 뉴스 (Tavily)", Description: "Tavily 검색으로 오늘의 주요 뉴스를 타임존 언어에 맞춰 전송합니다", Schedule: "30 8 * * *", Level: "external", Enabled: false, CanDisable: true},
	// Level 3d: Google Workspace
	{ID: "google_calendar_digest", Name: "이번 주 Google 일정", Description: "Google 캘린더에서 이번 주 일정을 매일 아침 전송합니다", Schedule: "0 8 * * *", Level: "external", Enabled: false, CanDisable: true},
	{ID: "google_gmail_digest", Name: "최근 메일 5개", Description: "Gmail 받은편지함의 최근 메일 5개를 매일 아침 전송합니다", Schedule: "0 8 * * *", Level: "external", Enabled: false, CanDisable: true},
	// Level 4: Runner
	{ID: "user_schedules", Name: "사용자 일정 실행기", Description: "15분마다 사용자 생성 일정을 확인하고 실행합니다", Schedule: "*/15 * * * *", Level: "runner", Enabled: true},
	// Level 5: Maintenance
	{ID: "memory_compaction", Name: "메모리 압축", Description: "오래된 지식베이스 항목을 정리합니다", Schedule: "0 5 * * 1", Level: "maintenance", Enabled: true},
}

// GET /api/v1/cron/system
func (h *CronHandler) ListSystemJobs(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var prefsJSON sql.NullString
	_ = h.db.QueryRowContext(c.Request().Context(),
		`SELECT preferences FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON)

	var prefs map[string]any
	if prefsJSON.Valid && prefsJSON.String != "" {
		_ = json.Unmarshal([]byte(prefsJSON.String), &prefs)
	}

	lang := c.QueryParam("lang")
	if lang == "" {
		lang = "ko"
		if l, ok := prefs["language"].(string); ok && l != "" {
			lang = l
		}
	}
	translations := jobTranslations[lang] // nil for "ko" — fall back to builtin names

	result := make([]systemJobResponse, len(builtinSystemJobs))
	for i, job := range builtinSystemJobs {
		result[i] = job
		result[i].HumanSchedule = humanizeCronLang(job.Schedule, lang)
		if t, ok := translations[job.ID]; ok {
			result[i].Name = t.Name
			result[i].Description = t.Description
		}
		if job.CanDisable {
			if job.Enabled {
				// Default ON: disabled only if user opted out
				result[i].Enabled = !isJobDisabled(prefs, job.ID)
			} else {
				// Default OFF: enabled only if user opted in
				result[i].Enabled = isJobEnabled(prefs, job.ID)
			}
		}
	}
	return c.JSON(http.StatusOK, result)
}

// POST /api/v1/cron/system/:id/toggle
func (h *CronHandler) ToggleSystemJob(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	jobID := c.Param("id")

	var target *systemJobResponse
	for i := range builtinSystemJobs {
		if builtinSystemJobs[i].ID == jobID {
			target = &builtinSystemJobs[i]
			break
		}
	}
	if target == nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "job not found"})
	}
	if !target.CanDisable {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "this job cannot be toggled"})
	}

	ctx := c.Request().Context()
	var prefsJSON sql.NullString
	if err := h.db.QueryRowContext(ctx,
		`SELECT preferences FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load preferences"})
	}

	var prefs map[string]any
	if prefsJSON.Valid && prefsJSON.String != "" {
		_ = json.Unmarshal([]byte(prefsJSON.String), &prefs)
	}
	if prefs == nil {
		prefs = make(map[string]any)
	}

	schedulerRaw, _ := prefs["scheduler"]
	scheduler, _ := schedulerRaw.(map[string]any)
	if scheduler == nil {
		scheduler = make(map[string]any)
	}

	// Default-ON jobs use disabled_jobs (opt-out); default-OFF jobs use enabled_jobs (opt-in).
	listKey := "disabled_jobs"
	if !target.Enabled {
		listKey = "enabled_jobs"
	}

	listRaw, _ := scheduler[listKey]
	var current []string
	if arr, ok := listRaw.([]any); ok {
		for _, d := range arr {
			if s, ok := d.(string); ok {
				current = append(current, s)
			}
		}
	}

	found := false
	next := make([]string, 0, len(current))
	for _, d := range current {
		if d == jobID {
			found = true
		} else {
			next = append(next, d)
		}
	}
	// enabled result: for disabled_jobs — not found means enabled; for enabled_jobs — found means enabled
	enabled := true
	if listKey == "disabled_jobs" {
		if !found {
			next = append(next, jobID)
			enabled = false
		}
	} else {
		if !found {
			next = append(next, jobID)
			enabled = true
		} else {
			enabled = false
		}
	}

	scheduler[listKey] = next
	prefs["scheduler"] = scheduler

	newPrefsJSON, _ := json.Marshal(prefs)
	if _, err := h.db.ExecContext(ctx,
		`UPDATE users SET preferences = $1 WHERE id = $2`, string(newPrefsJSON), userID,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]any{"id": jobID, "enabled": enabled})
}

// POST /api/v1/cron/system/:id/trigger
// Forces a single builtin job to fire immediately for the current user.
// Intended for testing and debugging only.
func (h *CronHandler) TriggerSystemJob(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	jobID := c.Param("id")

	// Validate job exists
	found := false
	for _, j := range builtinSystemJobs {
		if j.ID == jobID {
			found = true
			break
		}
	}
	if !found {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "job not found"})
	}
	if h.triggerer == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "scheduler not available"})
	}

	msg, sent, err := h.triggerer.TriggerJob(c.Request().Context(), jobID, userID.String())
	if err != nil {
		h.logger.Warn("TriggerSystemJob: execution error", zap.String("job", jobID), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	// Determine whether the job is also enabled for automatic scheduled runs.
	// For defaultEnabled=false jobs, the user must have toggled it ON via enabled_jobs.
	var prefsJSON sql.NullString
	_ = h.db.QueryRowContext(c.Request().Context(),
		`SELECT preferences FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON)
	var prefs map[string]any
	if prefsJSON.Valid {
		_ = json.Unmarshal([]byte(prefsJSON.String), &prefs)
	}
	scheduled := true
	for _, j := range builtinSystemJobs {
		if j.ID == jobID && !j.Enabled {
			scheduled = isJobEnabled(prefs, jobID)
			break
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":        jobID,
		"sent":      sent,
		"message":   msg,
		"scheduled": scheduled,
	})
}

// isJobEnabled checks whether jobID is present in preferences.scheduler.enabled_jobs.
// Used for default-OFF jobs that require explicit opt-in.
func isJobEnabled(prefs map[string]any, jobID string) bool {
	if prefs == nil {
		return false
	}
	schedulerRaw, ok := prefs["scheduler"]
	if !ok {
		return false
	}
	scheduler, ok := schedulerRaw.(map[string]any)
	if !ok {
		return false
	}
	enabledRaw, ok := scheduler["enabled_jobs"]
	if !ok {
		return false
	}
	enabled, ok := enabledRaw.([]any)
	if !ok {
		return false
	}
	for _, d := range enabled {
		if s, ok := d.(string); ok && s == jobID {
			return true
		}
	}
	return false
}

func isJobDisabled(prefs map[string]any, jobID string) bool {
	if prefs == nil {
		return false
	}
	schedulerRaw, ok := prefs["scheduler"]
	if !ok {
		return false
	}
	scheduler, ok := schedulerRaw.(map[string]any)
	if !ok {
		return false
	}
	disabledRaw, ok := scheduler["disabled_jobs"]
	if !ok {
		return false
	}
	disabled, ok := disabledRaw.([]any)
	if !ok {
		return false
	}
	for _, d := range disabled {
		if s, ok := d.(string); ok && s == jobID {
			return true
		}
	}
	return false
}

// ── User Schedules (stored in knowledge_base as JSON) ─────────────────────────

type schedTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
	Timezone  string `json:"timezone,omitempty"` // IANA timezone, e.g. "Asia/Seoul"
}

type scheduleData struct {
	Title      string    `json:"title"`
	Type       string    `json:"type"`
	ReportType string    `json:"report_type"`
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	TaskPrompt string    `json:"task_prompt,omitempty"` // AI task prompt — if set, agent runs this instead of static message
	LastOutput string    `json:"last_output,omitempty"` // last AI-generated result
	DeliverTo  string    `json:"deliver_to,omitempty"`  // delivery channel: "telegram" | "" (store only)
	LastSent   string    `json:"last_sent"`
	CreatedAt  string    `json:"created_at"`
}

type scheduleResponse struct {
	ID         string    `json:"id"`
	KBRowID    int64     `json:"kb_row_id"`
	Title      string    `json:"title"`
	Type       string    `json:"type"`
	ReportType string    `json:"report_type"`
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	TaskPrompt string    `json:"task_prompt,omitempty"`
	LastOutput string    `json:"last_output,omitempty"`
	DeliverTo  string    `json:"deliver_to,omitempty"`
	LastSent   string    `json:"last_sent"`
	CreatedAt  string    `json:"created_at"`
}

// GET /api/v1/cron/schedules
func (h *CronHandler) ListUserSchedules(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, key, value FROM knowledge_base
		 WHERE user_id = $1 AND key LIKE 'schedule:%'
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list schedules"})
	}
	defer rows.Close()

	result := []scheduleResponse{}
	for rows.Next() {
		var rowID int64
		var key, value string
		if err := rows.Scan(&rowID, &key, &value); err != nil {
			continue
		}
		var data scheduleData
		if err := json.Unmarshal([]byte(value), &data); err != nil {
			continue
		}
		schedID := strings.TrimPrefix(key, "schedule:")
		result = append(result, scheduleResponse{
			ID:         schedID,
			KBRowID:    rowID,
			Title:      data.Title,
			Type:       data.Type,
			ReportType: data.ReportType,
			Schedule:   data.Schedule,
			Status:     data.Status,
			Message:    data.Message,
			TaskPrompt: data.TaskPrompt,
			LastOutput: data.LastOutput,
			DeliverTo:  data.DeliverTo,
			LastSent:   data.LastSent,
			CreatedAt:  data.CreatedAt,
		})
	}
	return c.JSON(http.StatusOK, result)
}

// POST /api/v1/cron/schedules
func (h *CronHandler) CreateUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title      string    `json:"title"`
		Type       string    `json:"type"`
		ReportType string    `json:"report_type"`
		Schedule   schedTime `json:"schedule"`
		Message    string    `json:"message"`
		TaskPrompt string    `json:"task_prompt"`
		DeliverTo  string    `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}
	if len(req.Message) > 1000 {
		req.Message = req.Message[:1000]
	}
	if len(req.TaskPrompt) > 2000 {
		req.TaskPrompt = req.TaskPrompt[:2000]
	}
	if req.DeliverTo != "" && req.DeliverTo != "telegram" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "deliver_to must be 'telegram' or empty"})
	}
	if req.Schedule.Timezone != "" {
		if _, err := time.LoadLocation(req.Schedule.Timezone); err != nil {
			req.Schedule.Timezone = "UTC"
		}
	}
	if req.Type == "" {
		req.Type = "recurring"
	}
	if req.ReportType == "" {
		req.ReportType = "custom_reminder"
	}

	schedID := uuid.New().String()
	key := "schedule:" + schedID
	data := scheduleData{
		Title:      req.Title,
		Type:       req.Type,
		ReportType: req.ReportType,
		Schedule:   req.Schedule,
		Status:     "active",
		Message:    req.Message,
		TaskPrompt: req.TaskPrompt,
		DeliverTo:  req.DeliverTo,
		CreatedAt:  time.Now().Format(time.RFC3339),
	}

	value, _ := json.Marshal(data)
	var rowID int64
	if err := h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		userID, key, string(value),
	).Scan(&rowID); err != nil {
		h.logger.Error("cron: create schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	h.wake()
	return c.JSON(http.StatusOK, scheduleResponse{
		ID: schedID, KBRowID: rowID,
		Title: data.Title, Type: data.Type, ReportType: data.ReportType,
		Schedule: data.Schedule, Status: data.Status, Message: data.Message,
		TaskPrompt: data.TaskPrompt, DeliverTo: data.DeliverTo,
		CreatedAt: data.CreatedAt,
	})
}

// POST /api/v1/internal/cron-schedule
// Internal endpoint — called by the agent (no JWT; protected by X-Internal-Secret).
func (h *CronHandler) InternalCreateSchedule(c echo.Context) error {
	var req struct {
		UserID     string    `json:"user_id"`
		Title      string    `json:"title"`
		TaskPrompt string    `json:"task_prompt"`
		Schedule   schedTime `json:"schedule"`
		DeliverTo  string    `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and title are required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}
	if len(req.TaskPrompt) > 2000 {
		req.TaskPrompt = req.TaskPrompt[:2000]
	}
	if req.DeliverTo != "" && req.DeliverTo != "telegram" {
		req.DeliverTo = ""
	}

	schedID := uuid.New().String()
	key := "schedule:" + schedID
	data := scheduleData{
		Title:      req.Title,
		Type:       "recurring",
		ReportType: "custom_reminder",
		Schedule:   req.Schedule,
		Status:     "active",
		TaskPrompt: req.TaskPrompt,
		DeliverTo:  req.DeliverTo,
		CreatedAt:  time.Now().Format(time.RFC3339),
	}

	value, _ := json.Marshal(data)
	var rowID int64
	if err := h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		req.UserID, key, string(value),
	).Scan(&rowID); err != nil {
		h.logger.Error("cron: internal create schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	h.wake()
	return c.JSON(http.StatusCreated, map[string]any{
		"id": schedID, "kb_row_id": rowID,
		"title": data.Title, "created_at": data.CreatedAt,
	})
}

// PUT /api/v1/cron/schedules/:id
func (h *CronHandler) UpdateUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	schedID := c.Param("id")
	if _, err := uuid.Parse(schedID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid schedule id"})
	}
	var req struct {
		Title      string    `json:"title"`
		Type       string    `json:"type"`
		ReportType string    `json:"report_type"`
		Schedule   schedTime `json:"schedule"`
		Message    string    `json:"message"`
		Status     string    `json:"status"`
		TaskPrompt string    `json:"task_prompt"`
		DeliverTo  string    `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if len(req.TaskPrompt) > 2000 {
		req.TaskPrompt = req.TaskPrompt[:2000]
	}
	if req.DeliverTo != "" && req.DeliverTo != "telegram" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "deliver_to must be 'telegram' or empty"})
	}
	if req.Schedule.Timezone != "" {
		if _, err := time.LoadLocation(req.Schedule.Timezone); err != nil {
			req.Schedule.Timezone = "UTC"
		}
	}
	if req.Status != "" && req.Status != "active" && req.Status != "paused" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "status must be 'active' or 'paused'"})
	}

	ctx := c.Request().Context()
	key := "schedule:" + schedID

	var rawValue string
	if err := h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	).Scan(&rawValue); err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "fetch failed"})
	}

	var existing scheduleData
	_ = json.Unmarshal([]byte(rawValue), &existing)

	if req.Title != "" {
		existing.Title = req.Title
	}
	if req.Type != "" {
		existing.Type = req.Type
	}
	if req.ReportType != "" {
		existing.ReportType = req.ReportType
	}
	if req.Status != "" {
		existing.Status = req.Status
	}
	existing.Message = req.Message
	existing.Schedule = req.Schedule
	existing.TaskPrompt = req.TaskPrompt
	existing.DeliverTo = req.DeliverTo

	newValue, _ := json.Marshal(existing)
	if _, err := h.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		string(newValue), userID, key,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	h.wake()
	return c.JSON(http.StatusOK, map[string]any{"id": schedID, "status": existing.Status})
}

// DELETE /api/v1/cron/schedules/:id
func (h *CronHandler) DeleteUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	schedID := c.Param("id")
	if _, err := uuid.Parse(schedID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid schedule id"})
	}
	key := "schedule:" + schedID
	res, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
	}
	h.wake()
	return c.JSON(http.StatusOK, map[string]string{"id": schedID})
}

// POST /api/v1/cron/schedules/:id/toggle
func (h *CronHandler) ToggleUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	schedID := c.Param("id")
	if _, err := uuid.Parse(schedID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid schedule id"})
	}
	key := "schedule:" + schedID
	ctx := c.Request().Context()

	var rawValue string
	if err := h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	).Scan(&rawValue); err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "fetch failed"})
	}

	var data scheduleData
	if err := json.Unmarshal([]byte(rawValue), &data); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "parse failed"})
	}

	if data.Status == "active" {
		data.Status = "paused"
	} else {
		data.Status = "active"
	}

	newValue, _ := json.Marshal(data)
	if _, err := h.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		string(newValue), userID, key,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "toggle failed"})
	}

	h.wake()
	return c.JSON(http.StatusOK, map[string]string{"id": schedID, "status": data.Status})
}
