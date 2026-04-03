package handler

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"go.uber.org/zap"
)

type ReportsHandler struct {
	db          *database.DB
	config      *config.Config
	agentClient *agentgrpc.AgentClient
	logger      *zap.Logger
}

func NewReportsHandler(db *database.DB, cfg *config.Config, agentClient *agentgrpc.AgentClient, logger *zap.Logger) *ReportsHandler {
	return &ReportsHandler{db: db, config: cfg, agentClient: agentClient, logger: logger}
}

// GET /api/v1/reports?type=...&page=1&limit=20
func (h *ReportsHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit
	ctx := c.Request().Context()

	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close() error
	}

	reportType := c.QueryParam("type")
	if reportType != "" {
		rows, err = h.db.QueryContext(ctx,
			`SELECT id, report_type, title, content, created_at FROM reports
			 WHERE user_id = $1 AND report_type = $2
			 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
			userID, reportType, limit, offset,
		)
	} else {
		rows, err = h.db.QueryContext(ctx,
			`SELECT id, report_type, title, content, created_at FROM reports
			 WHERE user_id = $1
			 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			userID, limit, offset,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch reports"})
	}
	defer rows.Close()

	var reports []map[string]any
	for rows.Next() {
		var id int64
		var rType, title, content string
		var createdAt time.Time
		if rows.Scan(&id, &rType, &title, &content, &createdAt) != nil {
			continue
		}
		reports = append(reports, map[string]any{
			"id":          id,
			"report_type": rType,
			"title":       title,
			"content":     content,
			"created_at":  createdAt,
		})
	}
	if reports == nil {
		reports = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM reports WHERE user_id = $1`, userID).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{"reports": reports, "total": total, "page": page, "limit": limit})
}

// GET /api/v1/reports/:id
func (h *ReportsHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id int64
	var rType, title, content string
	var createdAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, report_type, title, content, created_at FROM reports WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&id, &rType, &title, &content, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "report not found"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id": id, "report_type": rType, "title": title, "content": content, "created_at": createdAt,
	})
}

// DELETE /api/v1/reports/:id
func (h *ReportsHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	result, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM reports WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete report"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "report not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /api/v1/reports/generate
// Supported report_type values: "weekly", "monthly", "diary", "goals", "finance", "summary"
// Uses the agent (Claude) for AI generation by default.
// Falls back to a basic text summary when the agent is unavailable.
func (h *ReportsHandler) Generate(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		ReportType string `json:"report_type"`
		Title      string `json:"title"`
		Period     string `json:"period"` // e.g. "2026-03" for monthly
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.ReportType == "" {
		req.ReportType = "weekly"
	}
	validReportTypes := map[string]bool{
		"weekly": true, "monthly": true, "diary": true,
		"goals": true, "finance": true, "summary": true,
	}
	if !validReportTypes[req.ReportType] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid report_type"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}

	ctx := c.Request().Context()

	// ── Collect context data for the report ───────────────────────────────
	sb := &strings.Builder{}
	today := time.Now().Format("2006-01-02")

	switch req.ReportType {
	case "weekly", "summary":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT entry_date, content FROM diary_entries
			 WHERE user_id = $1 AND entry_date >= CURRENT_DATE - INTERVAL '7 days'
			 ORDER BY entry_date DESC LIMIT 10`,
			userID,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 최근 7일 일기")
			for rows.Next() {
				var date, content string
				if rows.Scan(&date, &content) == nil {
					if len(content) > 300 {
						content = content[:300] + "..."
					}
					fmt.Fprintf(sb, "- [%s] %s\n", date, content)
				}
			}
		}
		gRows, _ := h.db.QueryContext(ctx,
			`SELECT title, progress FROM goals WHERE user_id = $1 AND status = 'active' LIMIT 5`,
			userID,
		)
		if gRows != nil {
			defer gRows.Close()
			fmt.Fprintln(sb, "\n## 진행 중인 목표")
			for gRows.Next() {
				var title string
				var progress float64
				if gRows.Scan(&title, &progress) == nil {
					fmt.Fprintf(sb, "- %s: %.0f%%\n", title, progress)
				}
			}
		}

	case "monthly":
		period := req.Period
		if period == "" {
			period = time.Now().Format("2006-01")
		}
		rows, _ := h.db.QueryContext(ctx,
			`SELECT entry_date, content FROM diary_entries
			 WHERE user_id = $1 AND TO_CHAR(entry_date, 'YYYY-MM') = $2
			 ORDER BY entry_date DESC`,
			userID, period,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintf(sb, "## %s 월간 일기 요약\n", period)
			for rows.Next() {
				var date, content string
				if rows.Scan(&date, &content) == nil {
					if len(content) > 200 {
						content = content[:200] + "..."
					}
					fmt.Fprintf(sb, "- [%s] %s\n", date, content)
				}
			}
		}

	case "finance":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT category, SUM(amount) AS total, COUNT(*) AS cnt
			 FROM finances
			 WHERE user_id = $1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
			 GROUP BY category ORDER BY total DESC`,
			userID,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 이번 달 지출 내역")
			for rows.Next() {
				var cat string
				var total int64
				var cnt int
				if rows.Scan(&cat, &total, &cnt) == nil {
					fmt.Fprintf(sb, "- %s: %d원 (%d건)\n", cat, total, cnt)
				}
			}
		}

	case "goals":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT title, progress, status FROM goals WHERE user_id = $1 ORDER BY progress DESC`,
			userID,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 목표 현황")
			for rows.Next() {
				var title, status string
				var progress float64
				if rows.Scan(&title, &progress, &status) == nil {
					fmt.Fprintf(sb, "- [%s] %s: %.0f%%\n", status, title, progress)
				}
			}
		}

	case "diary":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT entry_date, content FROM diary_entries
			 WHERE user_id = $1 AND entry_date >= CURRENT_DATE - INTERVAL '30 days'
			 ORDER BY entry_date DESC LIMIT 20`,
			userID,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 최근 30일 일기")
			for rows.Next() {
				var date, content string
				if rows.Scan(&date, &content) == nil {
					if len(content) > 300 {
						content = content[:300] + "..."
					}
					fmt.Fprintf(sb, "- [%s] %s\n", date, content)
				}
			}
		}
	}

	rawData := sb.String()
	if rawData == "" {
		rawData = "데이터가 없습니다."
	}

	// ── Build report title ─────────────────────────────────────────────────
	if req.Title == "" {
		titleMap := map[string]string{
			"weekly":  "주간 리포트 — " + today,
			"monthly": "월간 리포트",
			"diary":   "일기 분석 리포트",
			"goals":   "목표 달성 리포트",
			"finance": "재정 리포트",
			"summary": "종합 요약 리포트 — " + today,
		}
		if t, ok := titleMap[req.ReportType]; ok {
			req.Title = t
		} else {
			req.Title = req.ReportType + " 리포트"
		}
	}

	// ── Resolve model for report generation ───────────────────────────────────
	// Map report type → model_assignments use_case:
	//   diary/goals/finance → their own use_case
	//   summary/weekly/monthly → 'report'
	reportUseCase := req.ReportType
	if reportUseCase != "diary" && reportUseCase != "goals" && reportUseCase != "finance" {
		reportUseCase = "report"
	}
	reportModel := h.config.ModelDefaults.Report
	switch reportUseCase {
	case "diary":
		reportModel = h.config.ModelDefaults.Diary
	case "goals":
		reportModel = h.config.ModelDefaults.Goals
	case "finance":
		reportModel = h.config.ModelDefaults.Finance
	}
	if assigned := resolveAssignedModel(ctx, h.db, userID, reportUseCase); assigned != "" {
		reportModel = assigned
	}

	// ── Generate with Claude via agent (primary) ───────────────────────────
	// Falls back to Gemini if agent is unavailable, then to raw data.
	var content string
	aiGenerated := false

	if h.agentClient != nil {
		safeData := strings.ToValidUTF8(rawData, "")
		prompt := fmt.Sprintf(
			`다음 데이터를 바탕으로 한국어로 친절하고 통찰력 있는 %s을 작성해주세요.
형식: 마크다운, 2-3 문단, 핵심 인사이트와 앞으로의 제안 포함.

%s`, req.Title, safeData)

		generated, genErr := h.agentClient.Generate(ctx, prompt, reportModel)
		if genErr == nil && generated != "" {
			content = generated
			aiGenerated = true
		} else {
			h.logger.Warn("agent report generation failed, trying Gemini fallback", zap.Error(genErr))
		}
	}

	// ── Gemini fallback (if agent unavailable and user has Gemini key) ─────
	if !aiGenerated {
		apiKey, gemErr := getGeminiAPIKey(ctx, h.db, userID.String(), h.config.EncryptionKey)
		if gemErr == nil && apiKey != "" {
			prompt := fmt.Sprintf(
				`다음 데이터를 바탕으로 한국어로 친절하고 통찰력 있는 %s을 작성해주세요.
형식: 마크다운, 2-3 문단, 핵심 인사이트와 앞으로의 제안 포함.

%s`, req.Title, rawData)
			generated, genErr := generateText(ctx, apiKey, prompt)
			if genErr == nil {
				content = generated
				aiGenerated = true
			} else {
				h.logger.Warn("Gemini report generation failed", zap.Error(genErr))
			}
		}
	}

	// ── Raw data fallback ──────────────────────────────────────────────────
	if !aiGenerated {
		content = rawData
	}

	// ── Persist ────────────────────────────────────────────────────────────
	var id int64
	err = h.db.QueryRowContext(ctx,
		`INSERT INTO reports (user_id, report_type, title, content) VALUES ($1, $2, $3, $4) RETURNING id`,
		userID, req.ReportType, req.Title, content,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save report"})
	}
	return c.JSON(http.StatusCreated, map[string]any{
		"id": id, "report_type": req.ReportType, "title": req.Title,
		"status": "generated", "ai_generated": aiGenerated,
	})
}

// GenerateForScheduler is called by the background scheduler (no HTTP context).
// It generates a report for the given user and inserts a notification when done.
// userID must be a valid UUID string. reportType is one of: summary, weekly, monthly, diary, goals, finance.
func (h *ReportsHandler) GenerateForScheduler(ctx context.Context, userID string, reportType string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID %q: %w", userID, err)
	}

	today := time.Now().Format("2006-01-02")
	titleMap := map[string]string{
		"weekly":  "주간 리포트 — " + today,
		"monthly": "월간 리포트 — " + time.Now().Format("2006-01"),
		"diary":   "일기 분석 리포트",
		"goals":   "목표 달성 리포트",
		"finance": "재정 리포트",
		"summary": "종합 요약 리포트 — " + today,
	}
	title, ok := titleMap[reportType]
	if !ok {
		title = reportType + " 리포트"
	}

	// ── Collect context data ────────────────────────────────────────────────
	sb := &strings.Builder{}

	switch reportType {
	case "weekly", "summary":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT entry_date, content FROM diary_entries
			 WHERE user_id = $1 AND entry_date >= CURRENT_DATE - INTERVAL '7 days'
			 ORDER BY entry_date DESC LIMIT 10`,
			uid,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 최근 7일 일기")
			for rows.Next() {
				var date, content string
				if rows.Scan(&date, &content) == nil {
					if len(content) > 300 {
						content = content[:300] + "..."
					}
					fmt.Fprintf(sb, "- [%s] %s\n", date, content)
				}
			}
		}
		gRows, _ := h.db.QueryContext(ctx,
			`SELECT title, progress FROM goals WHERE user_id = $1 AND status = 'active' LIMIT 5`,
			uid,
		)
		if gRows != nil {
			defer gRows.Close()
			fmt.Fprintln(sb, "\n## 진행 중인 목표")
			for gRows.Next() {
				var t string
				var progress float64
				if gRows.Scan(&t, &progress) == nil {
					fmt.Fprintf(sb, "- %s: %.0f%%\n", t, progress)
				}
			}
		}

	case "monthly":
		period := time.Now().Format("2006-01")
		rows, _ := h.db.QueryContext(ctx,
			`SELECT entry_date, content FROM diary_entries
			 WHERE user_id = $1 AND TO_CHAR(entry_date, 'YYYY-MM') = $2
			 ORDER BY entry_date DESC`,
			uid, period,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintf(sb, "## %s 월간 일기 요약\n", period)
			for rows.Next() {
				var date, content string
				if rows.Scan(&date, &content) == nil {
					if len(content) > 200 {
						content = content[:200] + "..."
					}
					fmt.Fprintf(sb, "- [%s] %s\n", date, content)
				}
			}
		}

	case "finance":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT category, SUM(amount) AS total, COUNT(*) AS cnt
			 FROM finances
			 WHERE user_id = $1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
			 GROUP BY category ORDER BY total DESC`,
			uid,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 이번 달 지출 내역")
			for rows.Next() {
				var cat string
				var total int64
				var cnt int
				if rows.Scan(&cat, &total, &cnt) == nil {
					fmt.Fprintf(sb, "- %s: %d원 (%d건)\n", cat, total, cnt)
				}
			}
		}

	case "goals":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT title, progress, status FROM goals WHERE user_id = $1 ORDER BY progress DESC`,
			uid,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 목표 현황")
			for rows.Next() {
				var t, status string
				var progress float64
				if rows.Scan(&t, &progress, &status) == nil {
					fmt.Fprintf(sb, "- [%s] %s: %.0f%%\n", status, t, progress)
				}
			}
		}

	case "diary":
		rows, _ := h.db.QueryContext(ctx,
			`SELECT entry_date, content FROM diary_entries
			 WHERE user_id = $1 AND entry_date >= CURRENT_DATE - INTERVAL '30 days'
			 ORDER BY entry_date DESC LIMIT 20`,
			uid,
		)
		if rows != nil {
			defer rows.Close()
			fmt.Fprintln(sb, "## 최근 30일 일기")
			for rows.Next() {
				var date, content string
				if rows.Scan(&date, &content) == nil {
					if len(content) > 300 {
						content = content[:300] + "..."
					}
					fmt.Fprintf(sb, "- [%s] %s\n", date, content)
				}
			}
		}
	}

	rawData := sb.String()
	if rawData == "" {
		rawData = "데이터가 없습니다."
	}

	// ── Resolve model ───────────────────────────────────────────────────────
	// Map report type → model_assignments use_case (same logic as Generate handler).
	schedUseCase := reportType
	if schedUseCase != "diary" && schedUseCase != "goals" && schedUseCase != "finance" {
		schedUseCase = "report"
	}
	reportModel := h.config.ModelDefaults.Report
	switch schedUseCase {
	case "diary":
		reportModel = h.config.ModelDefaults.Diary
	case "goals":
		reportModel = h.config.ModelDefaults.Goals
	case "finance":
		reportModel = h.config.ModelDefaults.Finance
	}
	if assigned := resolveAssignedModel(ctx, h.db, uid, schedUseCase); assigned != "" {
		reportModel = assigned
	}

	// ── Generate content ────────────────────────────────────────────────────
	var content string
	aiGenerated := false

	if h.agentClient != nil {
		safeData := strings.ToValidUTF8(rawData, "")
		prompt := fmt.Sprintf(
			`다음 데이터를 바탕으로 한국어로 친절하고 통찰력 있는 %s을 작성해주세요.
형식: 마크다운, 2-3 문단, 핵심 인사이트와 앞으로의 제안 포함.

%s`, title, safeData)
		if generated, genErr := h.agentClient.Generate(ctx, prompt, reportModel); genErr == nil && generated != "" {
			content = generated
			aiGenerated = true
		} else {
			h.logger.Warn("scheduler: agent report generation failed", zap.Error(genErr))
		}
	}

	if !aiGenerated {
		apiKey, gemErr := getGeminiAPIKey(ctx, h.db, uid.String(), h.config.EncryptionKey)
		if gemErr == nil && apiKey != "" {
			prompt := fmt.Sprintf(
				`다음 데이터를 바탕으로 한국어로 친절하고 통찰력 있는 %s을 작성해주세요.
형식: 마크다운, 2-3 문단, 핵심 인사이트와 앞으로의 제안 포함.

%s`, title, rawData)
			if generated, genErr := generateText(ctx, apiKey, prompt); genErr == nil {
				content = generated
				aiGenerated = true
			} else {
				h.logger.Warn("scheduler: Gemini report generation failed", zap.Error(genErr))
			}
		}
	}

	if !aiGenerated {
		content = rawData
	}

	// ── Persist report ──────────────────────────────────────────────────────
	var reportID int64
	if err := h.db.QueryRowContext(ctx,
		`INSERT INTO reports (user_id, report_type, title, content) VALUES ($1, $2, $3, $4) RETURNING id`,
		uid, reportType, title, content,
	).Scan(&reportID); err != nil {
		return fmt.Errorf("save report: %w", err)
	}

	// ── Notify user ─────────────────────────────────────────────────────────
	notifMsg := fmt.Sprintf("새로운 %s이 생성되었습니다.", title)
	h.db.ExecContext(ctx,
		`INSERT INTO notifications (user_id, type, message) VALUES ($1, 'report_ready', $2)`,
		uid, notifMsg,
	)

	h.logger.Info("scheduler: report generated",
		zap.String("user_id", userID),
		zap.String("report_type", reportType),
		zap.Int64("report_id", reportID),
		zap.Bool("ai_generated", aiGenerated))

	return nil
}
