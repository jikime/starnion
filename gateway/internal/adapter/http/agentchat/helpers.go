// Package agentchat hosts the chat/ws/stream + telegram bot pipeline
// as a single handler sub-package. The four subsystems share
// resolve-persona / resolve-skill-env / user-prefs helpers (now in
// infrastructure/chatctx) and a small set of local utilities
// defined in this file.
//
// The CA split (repo / usecase / handler) was intentionally NOT
// applied to this group because the webhook + websocket pipelines
// are tightly-coupled stateful flows that don't cleanly factor
// into repo/usecase layers without a significant rewrite. The
// package move out of internal/adapter/handler gives the H1 goal
// (handler package size reduction) the same benefit as a full
// slice would.
package agentchat

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/infrastructure/mimeutil"
)

// unauthorized returns a canonical 401 JSON response.
func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// detectFileType is a thin alias over mimeutil.DetectFileType so
// existing call sites in telegram.go can keep the short name while
// the single implementation lives in the shared infrastructure
// package (dedup with http/files's copy).
func detectFileType(mimeType, filename string) string {
	return mimeutil.DetectFileType(mimeType, filename)
}
