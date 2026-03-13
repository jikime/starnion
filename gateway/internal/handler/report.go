package handler

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"time"

	starnionv1 "github.com/jikime/starnion/gateway/gen/starnion/v1"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ReportHandler handles report listing and on-demand generation.
type ReportHandler struct {
	db         *sql.DB
	grpcClient starnionv1.AgentServiceClient
}

func NewReportHandler(db *sql.DB, grpcConn *grpc.ClientConn) *ReportHandler {
	return &ReportHandler{
		db:         db,
		grpcClient: starnionv1.NewAgentServiceClient(grpcConn),
	}
}

type reportItem struct {
	ID         int64  `json:"id"`
	ReportType string `json:"report_type"`
	Title      string `json:"title"`
	Content    string `json:"content,omitempty"`
	CreatedAt  string `json:"created_at"`
}

// ListReports GET /reports?user_id=&type=&limit=20&offset=0
func (h *ReportHandler) ListReports(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	reportType := c.QueryParam("type")
	limit := 20
	offset := 0
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := c.QueryParam("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	var rows *sql.Rows
	var err error
	if reportType != "" {
		rows, err = h.db.QueryContext(ctx, `
			SELECT id, report_type, title, created_at
			FROM reports
			WHERE user_id = $1 AND report_type = $2
			ORDER BY created_at DESC
			LIMIT $3 OFFSET $4
		`, userID, reportType, limit, offset)
	} else {
		rows, err = h.db.QueryContext(ctx, `
			SELECT id, report_type, title, created_at
			FROM reports
			WHERE user_id = $1
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3
		`, userID, limit, offset)
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("list reports failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []reportItem{}
	for rows.Next() {
		var item reportItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.ReportType, &item.Title, &createdAt); err != nil {
			continue
		}
		item.CreatedAt = createdAt.In(kstLoc()).Format("2006-01-02 15:04")
		items = append(items, item)
	}
	return c.JSON(http.StatusOK, items)
}

// GetReport GET /reports/:id?user_id=
func (h *ReportHandler) GetReport(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	var item reportItem
	var createdAt time.Time
	err = h.db.QueryRowContext(ctx, `
		SELECT id, report_type, title, content, created_at
		FROM reports WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&item.ID, &item.ReportType, &item.Title, &item.Content, &createdAt)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	item.CreatedAt = createdAt.In(kstLoc()).Format("2006-01-02 15:04")
	return c.JSON(http.StatusOK, item)
}

// GenerateReport POST /reports/generate { "report_type": "weekly" }
func (h *ReportHandler) GenerateReport(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		ReportType string `json:"report_type"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.ReportType == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "report_type is required"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 120*time.Second)
	defer cancel()

	resp, err := h.grpcClient.GenerateReport(ctx, &starnionv1.ReportRequest{
		UserId:     userID,
		ReportType: req.ReportType,
	})
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("type", req.ReportType).Msg("generate report failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "report generation failed"})
	}
	if resp.Content == "" {
		return c.JSON(http.StatusOK, map[string]string{"status": "empty", "message": "생성된 리포트 내용이 없습니다"})
	}

	loc := kstLoc()
	title := buildReportTitle(req.ReportType, loc)

	saveCtx, saveCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer saveCancel()

	var id int64
	err = h.db.QueryRowContext(saveCtx, `
		INSERT INTO reports (user_id, report_type, title, content)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, userID, req.ReportType, title, resp.Content).Scan(&id)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("save report failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}

	now := time.Now().In(loc)
	return c.JSON(http.StatusOK, reportItem{
		ID:         id,
		ReportType: req.ReportType,
		Title:      title,
		Content:    resp.Content,
		CreatedAt:  now.Format("2006-01-02 15:04"),
	})
}

// buildReportTitle generates a localized Korean title for a report.
func buildReportTitle(reportType string, loc *time.Location) string {
	now := time.Now().In(loc)
	switch reportType {
	case "daily":
		return fmt.Sprintf("%d년 %s %s 일간 요약", now.Year(), now.Format("01월"), now.Format("02일"))
	case "weekly":
		_, week := now.ISOWeek()
		return fmt.Sprintf("%d년 %s %d주차 주간 리포트", now.Year(), now.Format("01월"), week)
	case "monthly":
		return fmt.Sprintf("%d년 %s 월간 리포트", now.Year(), now.Format("01월"))
	case "anomaly":
		return now.Format("2006-01-02") + " 소비 이상 감지"
	case "pattern":
		return now.Format("2006-01-02") + " 패턴 인사이트"
	case "goal":
		return now.Format("2006-01-02") + " 목표 달성 현황"
	default:
		return now.Format("2006-01-02") + " " + reportType
	}
}

func kstLoc() *time.Location {
	loc, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		return time.UTC
	}
	return loc
}
