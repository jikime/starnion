// Package settings hosts the HTTP adapter for the settings domain
// (providers, model_pricing, model_assignments). Tenth handler sub-
// package to migrate out of internal/adapter/handler.
package settings

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	settingsusecase "github.com/newstarnion/gateway/internal/usecase/settings"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *settingsusecase.UseCase
	cfg    *config.Config
	logger *zap.Logger
}

func NewHandler(uc *settingsusecase.UseCase, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, cfg: cfg, logger: logger}
}

// Register mounts every settings route. system/defaults is public
// (no JWT middleware) and is registered via RegisterPublic by the
// main router so we stick to the Register convention here for the
// protected routes.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/providers", h.listProviders)
	protected.POST("/providers", h.upsertProvider)
	protected.GET("/providers/:provider", h.getProvider)
	protected.DELETE("/providers/:provider", h.deleteProvider)
	protected.POST("/providers/validate", h.validateProvider)
	protected.POST("/providers/custom/models", h.listCustomModels)

	protected.GET("/model-pricing", h.listModelPricing)
	protected.POST("/model-pricing", h.upsertModelPricing)
	protected.DELETE("/model-pricing/:model", h.deleteModelPricing)

	protected.GET("/model-assignments", h.listModelAssignments)
	protected.POST("/model-assignments", h.upsertModelAssignment)
	protected.DELETE("/model-assignments/:use_case", h.deleteModelAssignment)
}

// RegisterPublic mounts the one route that does not require a JWT
// (the settings UI needs to render before the user logs in).
func (h *Handler) RegisterPublic(api *echo.Group) {
	api.GET("/system/defaults", h.getSystemDefaults)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── Providers ──────────────────────────────────────────────────────

func (h *Handler) listProviders(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	views, err := h.uc.ListProviders(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("settings list providers failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch providers"})
	}
	out := make([]map[string]any, 0, len(views))
	for _, v := range views {
		out = append(out, map[string]any{
			"id":            v.ID,
			"provider":      v.Provider,
			"hasKey":        v.HasKey,
			"apiKeyMasked":  v.APIKeyMasked,
			"baseUrl":       v.BaseURL,
			"enabledModels": v.EnabledModels,
			"endpointType":  v.EndpointType,
			"created_at":    v.CreatedAt,
			"updated_at":    v.UpdatedAt,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{"providers": out})
}

func (h *Handler) upsertProvider(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Provider      string   `json:"provider"`
		APIKey        string   `json:"apiKey"`
		BaseURL       string   `json:"baseUrl"`
		EnabledModels []string `json:"enabledModels"`
		EndpointType  string   `json:"endpointType"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.UpsertProvider(c.Request().Context(), userID, settingsusecase.UpsertProviderCommand{
		Provider:      req.Provider,
		APIKey:        req.APIKey,
		BaseURL:       req.BaseURL,
		EnabledModels: req.EnabledModels,
		EndpointType:  req.EndpointType,
	})
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("settings upsert provider failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save provider"})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": id, "provider": req.Provider, "status": "saved"})
}

func (h *Handler) getProvider(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	provider := c.Param("provider")
	meta, err := h.uc.GetProvider(c.Request().Context(), userID, provider)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "provider not found"})
		}
		h.logger.Warn("settings get provider failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch provider"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id":            meta.ID,
		"provider":      provider,
		"baseUrl":       meta.BaseURL,
		"enabledModels": meta.EnabledModels,
		"endpointType":  meta.EndpointType,
		"created_at":    meta.CreatedAt,
		"updated_at":    meta.UpdatedAt,
	})
}

func (h *Handler) deleteProvider(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteProvider(c.Request().Context(), userID, c.Param("provider")); err != nil {
		h.logger.Warn("settings delete provider failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete provider"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) validateProvider(c echo.Context) error {
	var req struct {
		Provider string `json:"provider"`
		APIKey   string `json:"apiKey"`
		BaseURL  string `json:"baseUrl"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	// Stub: a proper validator would hit the provider's /v1/models (or
	// equivalent). Today the UI only uses this to confirm the form is
	// well-formed, so returning {valid:true} matches legacy behaviour.
	return c.JSON(http.StatusOK, map[string]any{"valid": true, "provider": req.Provider})
}

// ── Model pricing ──────────────────────────────────────────────────

func (h *Handler) listModelPricing(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListModelPricing(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("settings list pricing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch model pricing"})
	}
	out := make([]map[string]any, 0, len(rows))
	for _, p := range rows {
		out = append(out, map[string]any{
			"model":           p.Model,
			"provider":        p.Provider,
			"input_usd":       p.InputUSD,
			"output_usd":      p.OutputUSD,
			"cache_input_usd": p.CacheInputUSD,
			"updated_at":      p.UpdatedAt,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{"pricing": out})
}

func (h *Handler) upsertModelPricing(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Model         string  `json:"model"`
		Provider      string  `json:"provider"`
		InputUSD      float64 `json:"input_usd"`
		OutputUSD     float64 `json:"output_usd"`
		CacheInputUSD float64 `json:"cache_input_usd"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.uc.UpsertModelPricing(c.Request().Context(), userID, settingsusecase.UpsertPricingCommand{
		Model:         req.Model,
		Provider:      req.Provider,
		InputUSD:      req.InputUSD,
		OutputUSD:     req.OutputUSD,
		CacheInputUSD: req.CacheInputUSD,
	}); err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("settings upsert pricing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save pricing"})
	}
	return c.JSON(http.StatusOK, map[string]any{"model": req.Model, "status": "saved"})
}

func (h *Handler) deleteModelPricing(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteModelPricing(c.Request().Context(), userID, c.Param("model")); err != nil {
		h.logger.Warn("settings delete pricing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete pricing"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ── Model assignments ──────────────────────────────────────────────

func (h *Handler) listModelAssignments(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListModelAssignments(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("settings list assignments failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch assignments"})
	}
	out := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		out = append(out, map[string]any{
			"id":         a.ID,
			"use_case":   a.UseCase,
			"provider":   a.Provider,
			"model":      a.Model,
			"updated_at": a.UpdatedAt,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{"assignments": out})
}

func (h *Handler) upsertModelAssignment(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		UseCase  string `json:"use_case"`
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.UpsertModelAssignment(c.Request().Context(), userID, settingsusecase.UpsertAssignmentCommand{
		UseCase:  req.UseCase,
		Provider: req.Provider,
		Model:    req.Model,
	})
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("settings upsert assignment failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save assignment"})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": id, "use_case": req.UseCase, "status": "saved"})
}

func (h *Handler) deleteModelAssignment(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteModelAssignment(c.Request().Context(), userID, c.Param("use_case")); err != nil {
		h.logger.Warn("settings delete assignment failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete assignment"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ── System defaults (public) ───────────────────────────────────────

func (h *Handler) getSystemDefaults(c echo.Context) error {
	d := h.cfg.ModelDefaults
	return c.JSON(http.StatusOK, map[string]string{
		"chat":    d.Chat,
		"report":  d.Report,
		"diary":   d.Diary,
		"goals":   d.Goals,
		"finance": d.Finance,
	})
}

// ── Custom-models proxy (pass-through to provider /v1/models) ──────
//
// This endpoint does not touch the database and has no business
// rules — it proxies a GET to the configured base URL and returns
// the model list. It lives in the HTTP adapter because introducing
// a CustomModelsUseCase would just wrap a net/http.Client.

func (h *Handler) listCustomModels(c echo.Context) error {
	var req struct {
		BaseURL      string `json:"base_url"`
		EndpointType string `json:"endpoint_type"`
		APIKey       string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.BaseURL) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "base_url is required"})
	}

	// SSRF defense: validate the user-supplied base_url before making
	// any outbound HTTP request. Block schemes other than http(s),
	// loopback/private/link-local/metadata IPs, and unresolvable hosts.
	if err := validateExternalURL(req.BaseURL); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	client := &http.Client{Timeout: 10 * time.Second}
	base := strings.TrimRight(req.BaseURL, "/")
	var models []string
	switch req.EndpointType {
	case "ollama":
		resp, err := client.Get(base + "/api/tags")
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]string{"error": "cannot reach endpoint"})
		}
		defer resp.Body.Close()
		var data struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Models {
				models = append(models, m.Name)
			}
		}
	default:
		httpReq, _ := http.NewRequest(http.MethodGet, base+"/v1/models", nil)
		if req.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
		}
		resp, err := client.Do(httpReq)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]string{"error": "cannot reach endpoint"})
		}
		defer resp.Body.Close()
		var data struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Data {
				models = append(models, m.ID)
			}
		}
	}
	if models == nil {
		models = []string{}
	}
	return c.JSON(http.StatusOK, map[string]any{"models": models})
}

// validateExternalURL ensures the URL is a public HTTP(S) endpoint,
// blocking SSRF vectors: non-HTTP schemes, loopback, private-network
// (RFC 1918), link-local, and cloud metadata IPs.
func validateExternalURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return errors.New("invalid URL")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return errors.New("only http and https URLs are allowed")
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("URL must include a hostname")
	}
	// Resolve hostname to IPs and check each.
	ips, err := net.LookupHost(host)
	if err != nil {
		return errors.New("cannot resolve hostname")
	}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			return errors.New("invalid IP for hostname")
		}
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
			ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return errors.New("URL must not point to a private or loopback address")
		}
		// Block AWS/GCP/Azure metadata endpoints (169.254.169.254).
		if ip.Equal(net.ParseIP("169.254.169.254")) {
			return errors.New("URL must not point to a cloud metadata endpoint")
		}
	}
	return nil
}
