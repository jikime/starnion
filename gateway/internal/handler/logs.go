package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/jikime/starnion/gateway/internal/logbuf"
)

// LogsHandler serves log entries via REST and SSE.
type LogsHandler struct {
	buf          *logbuf.Buffer
	agentBaseURL string // e.g. "http://agent:8082"
}

// NewLogsHandler creates a new LogsHandler.
func NewLogsHandler(buf *logbuf.Buffer, agentBaseURL string) *LogsHandler {
	return &LogsHandler{buf: buf, agentBaseURL: agentBaseURL}
}

// List returns recent log entries as JSON.
// GET /api/v1/logs?limit=200&level=error&source=handler&search=cron
func (h *LogsHandler) List(c echo.Context) error {
	limit := 500
	if v := c.QueryParam("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 2000 {
			limit = n
		}
	}

	entries := h.buf.Recent(limit)

	levelFilter := strings.ToLower(c.QueryParam("level"))
	sourceFilter := strings.ToLower(c.QueryParam("source"))
	searchFilter := strings.ToLower(c.QueryParam("search"))

	if levelFilter != "" || sourceFilter != "" || searchFilter != "" {
		filtered := entries[:0]
		for _, e := range entries {
			if levelFilter != "" && e.Level != levelFilter {
				continue
			}
			if sourceFilter != "" && !strings.Contains(strings.ToLower(e.Source), sourceFilter) {
				continue
			}
			if searchFilter != "" &&
				!strings.Contains(strings.ToLower(e.Message), searchFilter) &&
				!strings.Contains(strings.ToLower(e.Raw), searchFilter) {
				continue
			}
			filtered = append(filtered, e)
		}
		entries = filtered
	}

	// Build stats.
	stats := map[string]int{"info": 0, "warn": 0, "error": 0}
	sources := map[string]struct{}{}
	for _, e := range entries {
		if _, ok := stats[e.Level]; ok {
			stats[e.Level]++
		}
		if e.Source != "" {
			sources[e.Source] = struct{}{}
		}
	}
	srcList := make([]string, 0, len(sources))
	for s := range sources {
		srcList = append(srcList, s)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"entries": entries,
		"total":   len(entries),
		"stats":   stats,
		"sources": srcList,
	})
}

// Stream sends new log entries as Server-Sent Events.
// GET /api/v1/logs/stream
func (h *LogsHandler) Stream(c echo.Context) error {
	w := c.Response()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.Writer.(http.Flusher)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "streaming not supported")
	}

	// Send last 100 entries as initial snapshot.
	for _, entry := range h.buf.Recent(100) {
		data, _ := json.Marshal(entry)
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	flusher.Flush()

	ch := h.buf.Subscribe()
	defer h.buf.Unsubscribe(ch)

	ctx := c.Request().Context()
	keepAlive := time.NewTicker(20 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case entry, ok := <-ch:
			if !ok {
				return nil
			}
			data, _ := json.Marshal(entry)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-keepAlive.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// AgentLogsProxy fetches logs from the Python agent HTTP server and returns them.
// GET /api/v1/logs/agent?limit=200&level=...&search=...
func (h *LogsHandler) AgentLogsProxy(c echo.Context) error {
	base := h.agentBaseURL
	if base == "" {
		base = "http://localhost:8082"
	}
	agentLogURL := base + "/logs"

	// Forward query params.
	if q := c.QueryString(); q != "" {
		agentLogURL += "?" + q
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(agentLogURL)
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error": "agent log server unavailable",
		})
	}
	defer resp.Body.Close()

	var payload any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "invalid response from agent"})
	}

	return c.JSON(http.StatusOK, payload)
}
