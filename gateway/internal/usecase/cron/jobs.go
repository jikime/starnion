package cron

// jobI18n is one language override for a built-in system job.
type jobI18n struct{ Name, Description string }

// jobTranslations[lang][jobID] is the non-Korean translation table
// for built-in system jobs. Korean is intentionally absent — the
// jobUIMeta map below already holds Korean names/descriptions.
var jobTranslations = map[string]map[string]jobI18n{
	"en": {
		"daily_summary":          {Name: "Daily Finance Summary", Description: "Summarizes today's expenses by category"},
		"weekly_report":          {Name: "Weekly Planner Review", Description: "Summarizes this week's goal completion and spending"},
		"monthly_closing":        {Name: "Monthly Finance Report", Description: "Reviews last month's income/expenses and savings rate"},
		"inactive_reminder":      {Name: "Note Reminder", Description: "Encourages you to write a note about your day"},
		"budget_warning":         {Name: "Budget Warning", Description: "Alerts you when you're close to exceeding your budget"},
		"connect_reminder":       {Name: "Connect Reminder", Description: "Weekly nudge to check your Connect page for people you haven't reached out to lately"},
		"planner_task_reminder":  {Name: "Today's Tasks", Description: "Shows today's due tasks and priority-A items"},
		"planner_goal_dday":      {Name: "Goal D-Day Alert", Description: "Shows goals due within 7 days"},
		"spending_anomaly":       {Name: "Spending Anomaly", Description: "Detects unusual spending patterns"},
		"anomaly_insights":       {Name: "Anomaly Insights", Description: "Comprehensive multi-dimensional spending anomaly analysis"},
		"pattern_analysis":       {Name: "Spending Pattern Analysis", Description: "Analyzes category spending increase patterns"},
		"pattern_insight":        {Name: "Weekly Insights", Description: "Sends weekly insights combining spending, notes, and goals"},
		"conversation_analysis":  {Name: "Re-engagement Alert", Description: "Sends a Telegram alert after 3+ days of inactivity"},
		"daily_weather":          {Name: "Daily Weather", Description: "Morning weather forecast and precipitation via wttr.in"},
		"daily_news":             {Name: "Today's News (Naver)", Description: "Sends today's top news via Naver Search"},
		"local_events":           {Name: "Local Events (Naver)", Description: "Sends local events and festivals via Naver Search"},
		"it_blog_digest":         {Name: "IT Blog Digest (Naver)", Description: "Sends today's IT blog posts via Naver Search"},
		"tavily_news":            {Name: "Today's Top News (Tavily)", Description: "Sends today's top news in your language via Tavily Search"},
		"google_calendar_digest": {Name: "This Week's Google Calendar", Description: "Sends this week's Google Calendar events every morning"},
		"google_gmail_digest":    {Name: "Recent Emails (Top 5)", Description: "Sends the 5 most recent Gmail inbox messages every morning"},
		"user_schedules":         {Name: "User Schedule Runner", Description: "Checks and runs user-created schedules every 15 minutes"},
		"memory_compaction":      {Name: "Memory Compaction", Description: "Cleans up old knowledge base entries"},
	},
	"ja": {
		"daily_summary":          {Name: "今日の財務サマリー", Description: "今日の支出をカテゴリ別にまとめます"},
		"weekly_report":          {Name: "週次プランナーレビュー", Description: "今週の目標達成率と支出状況をまとめます"},
		"monthly_closing":        {Name: "月次財務精算", Description: "先月の収支と貯蓄率をまとめます"},
		"inactive_reminder":      {Name: "ノートリマインダー", Description: "今日の出来事をノートに記録しましょう"},
		"budget_warning":         {Name: "予算警告", Description: "予算超過が近づいたときに警告します"},
		"connect_reminder":       {Name: "人脈管理リマインダー", Description: "週に一度、久しく連絡していない人脈を確認するようお知らせします"},
		"planner_task_reminder":  {Name: "今日のタスク", Description: "今日締め切りのタスクと優先度Aの項目をお知らせします"},
		"planner_goal_dday":      {Name: "目標D-Dayアラート", Description: "7日以内に締め切りの目標をお知らせします"},
		"spending_anomaly":       {Name: "異常支出検知", Description: "異常な支出パターンを検知します"},
		"anomaly_insights":       {Name: "異常支出インサイト", Description: "多次元的な支出異常を総合分析します"},
		"pattern_analysis":       {Name: "支出パターン分析", Description: "カテゴリ別支出の増加傾向を分析します"},
		"pattern_insight":        {Name: "週次インサイト", Description: "支出・ノート・目標を総合した週次インサイトを送信します"},
		"conversation_analysis":  {Name: "再訪問促進", Description: "3日以上会話がない場合にTelegramで通知します"},
		"daily_weather":          {Name: "今日の天気", Description: "wttr.inによる朝の天気予報と降水確率"},
		"daily_news":             {Name: "今日のニュース (Naver)", Description: "Naver検索で今日の主要ニュースをお届けします"},
		"local_events":           {Name: "地域イベント (Naver)", Description: "Naver検索で地域のイベントや祭りをお届けします"},
		"it_blog_digest":         {Name: "ITブログダイジェスト (Naver)", Description: "Naver検索で今日のIT関連ブログ記事をお届けします"},
		"tavily_news":            {Name: "今日のトップニュース (Tavily)", Description: "Tavily検索でお使いの言語に合ったニュースをお届けします"},
		"google_calendar_digest": {Name: "今週のGoogleカレンダー", Description: "Googleカレンダーの今週の予定を毎朝お届けします"},
		"google_gmail_digest":    {Name: "最近のメール (最新5件)", Description: "Gmailの受信トレイの最新5件を毎朝お届けします"},
		"user_schedules":         {Name: "ユーザースケジュール実行", Description: "15分ごとにユーザー作成のスケジュールを確認・実行します"},
		"memory_compaction":      {Name: "メモリ圧縮", Description: "古いナレッジベースのエントリを整理します"},
	},
	"zh": {
		"daily_summary":          {Name: "今日财务摘要", Description: "按类别汇总今日支出"},
		"weekly_report":          {Name: "每周计划回顾", Description: "汇总本周目标完成率和支出情况"},
		"monthly_closing":        {Name: "月度财务结算", Description: "回顾上月收支和储蓄率"},
		"inactive_reminder":      {Name: "记事提醒", Description: "提醒您记录今天的日记"},
		"budget_warning":         {Name: "预算警告", Description: "接近超出预算时发出警告"},
		"connect_reminder":       {Name: "人脉管理提醒", Description: "每周提醒一次,查看最近没联系的人脉"},
		"planner_task_reminder":  {Name: "今日任务", Description: "提示今日到期任务和优先级A的事项"},
		"planner_goal_dday":      {Name: "目标倒计时", Description: "提示7天内到期的目标"},
		"spending_anomaly":       {Name: "异常消费检测", Description: "检测异常消费模式"},
		"anomaly_insights":       {Name: "异常支出洞察", Description: "综合分析多维支出异常信号"},
		"pattern_analysis":       {Name: "消费模式分析", Description: "分析各类别支出增长趋势"},
		"pattern_insight":        {Name: "每周洞察", Description: "综合支出、记事和目标发送每周洞察"},
		"conversation_analysis":  {Name: "重访提醒", Description: "3天以上未对话时通过Telegram发送提醒"},
		"daily_weather":          {Name: "今日天气", Description: "通过wttr.in在早上发送天气预报和降水概率"},
		"daily_news":             {Name: "今日新闻 (Naver)", Description: "通过Naver搜索发送今日主要新闻"},
		"local_events":           {Name: "本地活动 (Naver)", Description: "通过Naver搜索发送本地活动和节庆信息"},
		"it_blog_digest":         {Name: "IT博客摘要 (Naver)", Description: "通过Naver搜索发送今日IT相关博客文章"},
		"tavily_news":            {Name: "今日头条 (Tavily)", Description: "通过Tavily搜索以您的语言发送今日头条"},
		"google_calendar_digest": {Name: "本周Google日历", Description: "每天早上发送Google日历本周日程"},
		"google_gmail_digest":    {Name: "最近邮件 (最新5封)", Description: "每天早上发送Gmail收件箱最新5封邮件"},
		"user_schedules":         {Name: "用户日程运行器", Description: "每15分钟检查并运行用户创建的日程"},
		"memory_compaction":      {Name: "内存压缩", Description: "清理过期的知识库条目"},
	},
}

// jobUIMeta holds UI-only metadata keyed by system-job ID. The cron
// expression + action type + default-enabled flag live in
// scheduler.BuiltinJobs; this map adds name/description/level so the
// two sources merge at request time (no SSOT violation).
type jobUIMeta struct {
	Name, Description, Level string
	CanDisable               bool
}

var jobMeta = map[string]jobUIMeta{
	"daily_summary":          {Name: "오늘의 재정 요약", Description: "오늘 지출 내역을 카테고리별로 요약합니다", Level: "rule", CanDisable: true},
	"weekly_report":          {Name: "주간 플래너 리뷰", Description: "이번 주 목표 달성률과 지출 현황을 요약합니다", Level: "rule", CanDisable: true},
	"monthly_closing":        {Name: "월간 재정 정산", Description: "전월 수입/지출 총정리 및 저축률을 알려드립니다", Level: "rule", CanDisable: true},
	"inactive_reminder":      {Name: "노트 리마인더", Description: "오늘 하루를 기록해보세요. 노트 작성을 유도합니다", Level: "rule", CanDisable: true},
	"budget_warning":         {Name: "예산 경고", Description: "예산 초과 임박 시 경고 알림을 전송합니다", Level: "rule", CanDisable: true},
	"connect_reminder":       {Name: "인맥 관리 리마인더", Description: "한 주에 한 번, 오랜만에 연락해야 할 인연이 있는지 인맥 페이지를 확인하도록 알려드립니다", Level: "rule", CanDisable: true},
	"planner_task_reminder":  {Name: "오늘의 할 일", Description: "오늘 마감인 작업과 우선순위 A 태스크를 알려드립니다", Level: "pattern", CanDisable: true},
	"planner_goal_dday":      {Name: "목표 D-Day 알림", Description: "마감 7일 이내 목표의 남은 날짜를 알려드립니다", Level: "pattern", CanDisable: true},
	"spending_anomaly":       {Name: "이상 소비 감지", Description: "비정상적인 소비 패턴을 감지합니다", Level: "pattern", CanDisable: true},
	"anomaly_insights":       {Name: "이상 지출 인사이트", Description: "다차원 지출 이상 신호를 종합 분석합니다", Level: "pattern", CanDisable: true},
	"pattern_analysis":       {Name: "소비 패턴 분석", Description: "카테고리 지출 증가 패턴을 분석합니다", Level: "pattern", CanDisable: true},
	"pattern_insight":        {Name: "주간 인사이트", Description: "지출·노트·목표를 종합한 주간 인사이트를 전송합니다", Level: "pattern", CanDisable: true},
	"conversation_analysis":  {Name: "재방문 유도", Description: "3일 이상 대화가 없을 때 텔레그램으로 알림을 보냅니다", Level: "pattern", CanDisable: true},
	"daily_weather":          {Name: "오늘의 날씨", Description: "wttr.in 으로 오늘 날씨와 강수확률을 아침에 알려드립니다", Level: "external", CanDisable: true},
	"daily_news":             {Name: "오늘의 뉴스", Description: "네이버 검색으로 오늘의 주요 뉴스를 전송합니다", Level: "external", CanDisable: true},
	"local_events":           {Name: "오늘의 지역 이벤트", Description: "네이버 지역 검색으로 오늘의 이벤트/행사를 전송합니다", Level: "external", CanDisable: true},
	"it_blog_digest":         {Name: "IT 블로그 다이제스트", Description: "네이버 블로그 검색으로 오늘의 IT 관련 글을 전송합니다", Level: "external", CanDisable: true},
	"tavily_news":            {Name: "오늘의 주요 뉴스 (Tavily)", Description: "Tavily 검색으로 오늘의 주요 뉴스를 타임존 언어에 맞춰 전송합니다", Level: "external", CanDisable: true},
	"google_calendar_digest": {Name: "이번 주 Google 일정", Description: "Google 캘린더에서 이번 주 일정을 매일 아침 전송합니다", Level: "external", CanDisable: true},
	"google_gmail_digest":    {Name: "최근 메일 5개", Description: "Gmail 받은편지함의 최근 메일 5개를 매일 아침 전송합니다", Level: "external", CanDisable: true},
	"user_schedules":         {Name: "사용자 일정 실행기", Description: "15분마다 사용자 생성 일정을 확인하고 실행합니다", Level: "runner", CanDisable: false},
	"memory_compaction":      {Name: "메모리 압축", Description: "오래된 지식베이스 항목을 정리합니다", Level: "maintenance", CanDisable: false},
}
