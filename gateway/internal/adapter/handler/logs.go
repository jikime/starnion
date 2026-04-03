package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/infrastructure/logbuffer"
)

// LogsHandler serves the unified log hub over HTTP (snapshot + SSE stream + agent push).
type LogsHandler struct {
	hub *logbuffer.Hub
}

func NewLogsHandler(hub *logbuffer.Hub) *LogsHandler {
	return &LogsHandler{hub: hub}
}

// GET /api/v1/logs/app — returns a snapshot of recent log entries as JSON.
// Query params: limit (int, default 200), search (string), source ("gateway"|"agent"), level (string)
func (h *LogsHandler) GetSnapshot(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	entries := h.hub.Snapshot(limit)
	filtered := filterEntries(entries, c.QueryParam("search"), c.QueryParam("source"), c.QueryParam("level"))

	// Build stats and source list.
	stats := struct {
		Info  int `json:"info"`
		Warn  int `json:"warn"`
		Error int `json:"error"`
	}{}
	sourceSet := map[string]struct{}{}
	for _, e := range filtered {
		switch strings.ToLower(e.Level) {
		case "info":
			stats.Info++
		case "warn", "warning":
			stats.Warn++
		case "error", "fatal":
			stats.Error++
		}
		if e.Source != "" {
			sourceSet[e.Source] = struct{}{}
		}
	}
	sources := make([]string, 0, len(sourceSet))
	for s := range sourceSet {
		sources = append(sources, s)
	}

	// Map to the LogEntry shape the UI expects.
	out := make([]map[string]any, len(filtered))
	for i, e := range filtered {
		out[i] = map[string]any{
			"time":    e.Time.Format(time.RFC3339Nano),
			"time_ms": e.Time.UnixMilli(),
			"level":   e.Level,
			"message": e.Message,
			"source":  e.Source,
			"raw":     fmt.Sprintf("[%s] %s", e.Source, e.Message),
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"entries": out,
		"total":   len(out),
		"stats":   stats,
		"sources": sources,
	})
}

// GET /api/v1/logs/stream — SSE endpoint: sends snapshot then live entries.
func (h *LogsHandler) Stream(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	w := c.Response()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flush := func() {
		if f, ok := w.Writer.(http.Flusher); ok {
			f.Flush()
		}
	}

	sendEntry := func(e logbuffer.Entry) {
		data, _ := json.Marshal(map[string]any{
			"time":    e.Time.Format(time.RFC3339Nano),
			"time_ms": e.Time.UnixMilli(),
			"level":   e.Level,
			"message": e.Message,
			"source":  e.Source,
			"raw":     fmt.Sprintf("[%s] %s", e.Source, e.Message),
		})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flush()
	}

	// Send snapshot first.
	for _, e := range h.hub.Snapshot(limit) {
		sendEntry(e)
	}

	// Subscribe to live entries.
	ch := h.hub.Subscribe()
	defer h.hub.Unsubscribe(ch)

	ctx := c.Request().Context()
	for {
		select {
		case <-ctx.Done():
			return nil
		case e, ok := <-ch:
			if !ok {
				return nil
			}
			sendEntry(e)
		}
	}
}

// POST /api/v1/internal/logs — receives log entries pushed from the agent process.
// No JWT auth — internal use only (called by agent's logForwarder).
func (h *LogsHandler) Push(c echo.Context) error {
	var body struct {
		Level   string `json:"level"`
		Message string `json:"message"`
		Source  string `json:"source"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if body.Source == "" {
		body.Source = "agent"
	}

	// Normalise and validate level.
	validLevels := map[string]bool{"debug": true, "info": true, "warn": true, "warning": true, "error": true, "fatal": true}
	body.Level = strings.ToLower(body.Level)
	if !validLevels[body.Level] {
		body.Level = "info"
	}

	// Cap message length to prevent memory abuse.
	const maxMessageLen = 4096
	if len(body.Message) > maxMessageLen {
		body.Message = body.Message[:maxMessageLen]
	}

	h.hub.Write(logbuffer.Entry{
		Time:    time.Now(),
		Level:   body.Level,
		Message: body.Message,
		Source:  body.Source,
	})
	return c.JSON(http.StatusOK, map[string]string{"ok": "1"})
}

// filterEntries applies search/source/level filters.
func filterEntries(entries []logbuffer.Entry, search, source, level string) []logbuffer.Entry {
	if search == "" && source == "" && level == "" {
		return entries
	}
	out := make([]logbuffer.Entry, 0, len(entries))
	searchLow := strings.ToLower(search)
	for _, e := range entries {
		if source != "" && !strings.EqualFold(e.Source, source) {
			continue
		}
		if level != "" && !strings.EqualFold(e.Level, level) {
			continue
		}
		if searchLow != "" && !strings.Contains(strings.ToLower(e.Message), searchLow) {
			continue
		}
		out = append(out, e)
	}
	return out
}
