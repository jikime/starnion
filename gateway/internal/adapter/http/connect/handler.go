// Package connect hosts the HTTP adapter for the Connect (인맥) feature.
// Endpoints (UC-101..UC-110):
//
//	GET    /api/v1/connections
//	POST   /api/v1/connections
//	GET    /api/v1/connections/:id
//	PATCH  /api/v1/connections/:id
//	DELETE /api/v1/connections/:id
//	POST   /api/v1/connections/scan-business-card
//	POST   /api/v1/connections/:id/business-card
//	PUT    /api/v1/connections/:id/social-profiles
//	PUT    /api/v1/connections/:id/context-notes
//	POST   /api/v1/connections/:id/touch
//
// The handler translates JSON payloads into usecase DTOs (the `**string`
// double-pointer dance on PATCH is required so the wire distinguishes
// `"email": null` — "unset this" — from `"email"` being absent — "leave
// it alone"). Validation lives in the usecase; the handler just maps
// domain errors to HTTP status codes.
package connect

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	connectusecase "github.com/newstarnion/gateway/internal/usecase/connect"
	"go.uber.org/zap"
)

// contextNotesRawLimit is the max raw body size accepted by the
// PUT /context-notes endpoint. BR-CONTEXT-1 caps the *validated*
// string at 4096 chars; the 16 KiB raw cap protects the decoder
// from pathological payloads (multi-byte runes, whitespace spam).
const contextNotesRawLimit = 16 * 1024

// Handler is the HTTP adapter over the connect usecase.
type Handler struct {
	uc     *connectusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *connectusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

// Register mounts the connect routes under the JWT-protected group.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/connections", h.list)
	protected.POST("/connections", h.create)
	protected.POST("/connections/scan-business-card", h.scanBusinessCard)
	protected.GET("/connections/:id", h.get)
	protected.PATCH("/connections/:id", h.update)
	protected.DELETE("/connections/:id", h.delete)
	protected.POST("/connections/:id/business-card", h.attachBusinessCard)
	protected.PUT("/connections/:id/social-profiles", h.updateSocialProfiles)
	protected.PUT("/connections/:id/context-notes", h.updateContextNotes)
	protected.POST("/connections/:id/touch", h.touch)
}

// ── JSON resource shapes ──────────────────────────────────────────

// connectionResource is the wire shape returned by every endpoint.
// Pointer fields marshal to `null` when unset; `tags` and
// `social_profiles` are never nil so the client never has to
// special-case null for collection fields.
type connectionResource struct {
	ID                     uuid.UUID              `json:"id"`
	UserID                 uuid.UUID              `json:"user_id"`
	Name                   string                 `json:"name"`
	Role                   *string                `json:"role"`
	Company                *string                `json:"company"`
	Category               string                 `json:"category"`
	Email                  *string                `json:"email"`
	Phone                  *string                `json:"phone"`
	Birthday               *string                `json:"birthday"`
	MeetingLocation        *string                `json:"meeting_location"`
	GroupKey               *string                `json:"group_key"`
	Tags                   []string               `json:"tags"`
	ContextNotes           string                 `json:"context_notes"`
	LastContactAt          *time.Time             `json:"last_contact_at"`
	ContactFrequencyTarget int                    `json:"contact_frequency_target"`
	ConnectionScore        float64                `json:"connection_score"`
	BusinessCard           *entity.BusinessCard   `json:"business_card"`
	SocialProfiles         entity.SocialProfiles  `json:"social_profiles"`
	CreatedAt              time.Time              `json:"created_at"`
	UpdatedAt              time.Time              `json:"updated_at"`
}

func toResource(c entity.Connection) connectionResource {
	var birthday *string
	if c.Birthday != nil {
		s := c.Birthday.Format("2006-01-02")
		birthday = &s
	}
	tags := c.Tags
	if tags == nil {
		tags = []string{}
	}
	social := c.SocialProfiles
	if social == nil {
		social = entity.SocialProfiles{}
	}
	return connectionResource{
		ID:                     c.ID,
		UserID:                 c.UserID,
		Name:                   c.Name,
		Role:                   c.Role,
		Company:                c.Company,
		Category:               string(c.Category),
		Email:                  c.Email,
		Phone:                  c.Phone,
		Birthday:               birthday,
		MeetingLocation:        c.MeetingLocation,
		GroupKey:               c.GroupKey,
		Tags:                   tags,
		ContextNotes:           c.ContextNotes,
		LastContactAt:          c.LastContactAt,
		ContactFrequencyTarget: c.ContactFrequencyTarget,
		ConnectionScore:        c.ConnectionScore,
		BusinessCard:           c.BusinessCard,
		SocialProfiles:         social,
		CreatedAt:              c.CreatedAt,
		UpdatedAt:              c.UpdatedAt,
	}
}

// ── List (UC-104) ─────────────────────────────────────────────────

func (h *Handler) list(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	offset, _ := strconv.Atoi(c.QueryParam("offset"))

	res, err := h.uc.List(c.Request().Context(), userID, connectusecase.ListParams{
		CategoriesCSV: c.QueryParam("category"),
		Sort:          c.QueryParam("sort"),
		Query:         c.QueryParam("q"),
		Limit:         limit,
		Offset:        offset,
	})
	if err != nil {
		return h.mapError(c, err, "connect list failed")
	}

	items := make([]connectionResource, 0, len(res.Items))
	for _, it := range res.Items {
		items = append(items, toResource(it))
	}
	return c.JSON(http.StatusOK, echo.Map{
		"items":  items,
		"total":  res.Total,
		"limit":  res.Limit,
		"offset": res.Offset,
	})
}

// ── Create (UC-101) ───────────────────────────────────────────────

// createRequest matches the POST body. Optional fields are pointers
// so their absence is distinguishable from an empty string / zero.
type createRequest struct {
	Name                   string              `json:"name"`
	Role                   *string             `json:"role"`
	Company                *string             `json:"company"`
	Category               *string             `json:"category"`
	Email                  *string             `json:"email"`
	Phone                  *string             `json:"phone"`
	Birthday               *string             `json:"birthday"` // YYYY-MM-DD
	MeetingLocation        *string             `json:"meeting_location"`
	Tags                   []string            `json:"tags"`
	ContextNotes           *string             `json:"context_notes"`
	ContactFrequencyTarget *int                `json:"contact_frequency_target"`
	SocialProfiles         map[string]*string  `json:"social_profiles"`
}

func (h *Handler) create(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req createRequest
	if err := c.Bind(&req); err != nil {
		return badRequest(c, "invalid_json", "invalid request body")
	}

	in := connectusecase.CreateInput{
		Name:                   req.Name,
		Role:                   req.Role,
		Company:                req.Company,
		Category:               req.Category,
		Email:                  req.Email,
		Phone:                  req.Phone,
		MeetingLocation:        req.MeetingLocation,
		Tags:                   req.Tags,
		ContextNotes:           req.ContextNotes,
		ContactFrequencyTarget: req.ContactFrequencyTarget,
		SocialProfiles:         req.SocialProfiles,
	}
	if req.Birthday != nil && *req.Birthday != "" {
		t, perr := time.Parse("2006-01-02", *req.Birthday)
		if perr != nil {
			return badRequestField(c, "birthday", "invalid_birthday", "birthday must be YYYY-MM-DD")
		}
		in.Birthday = &t
	}

	created, err := h.uc.Create(c.Request().Context(), userID, in)
	if err != nil {
		return h.mapError(c, err, "connect create failed")
	}
	return c.JSON(http.StatusCreated, toResource(created))
}

// ── Get (UC-103) ──────────────────────────────────────────────────

func (h *Handler) get(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	row, err := h.uc.Get(c.Request().Context(), userID, id)
	if err != nil {
		return h.mapError(c, err, "connect get failed")
	}
	return c.JSON(http.StatusOK, toResource(row))
}

// ── Update (UC-102) ───────────────────────────────────────────────

// updateRequest uses json.RawMessage for nullable-scalar fields so
// the handler can distinguish `"email": null` from `"email"` being
// absent. Collection fields (tags, social_profiles) don't need the
// double-pointer trick: absent `social_profiles` leaves state alone;
// `{}` is a no-op merge.
type updateRequest struct {
	Name                   *string            `json:"name"`
	Role                   json.RawMessage    `json:"role"`
	Company                json.RawMessage    `json:"company"`
	Category               *string            `json:"category"`
	Email                  json.RawMessage    `json:"email"`
	Phone                  json.RawMessage    `json:"phone"`
	Birthday               json.RawMessage    `json:"birthday"`
	MeetingLocation        json.RawMessage    `json:"meeting_location"`
	Tags                   *[]string          `json:"tags"`
	ContextNotes           *string            `json:"context_notes"`
	ContactFrequencyTarget *int               `json:"contact_frequency_target"`
	SocialProfiles         map[string]*string `json:"social_profiles"`
	// ConnectionScore is accepted then silently dropped (BR-SCORE-1);
	// we bind it to a throwaway so strict decoders don't reject it.
	ConnectionScore json.RawMessage `json:"connection_score"`
}

func (h *Handler) update(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	var req updateRequest
	if err := c.Bind(&req); err != nil {
		return badRequest(c, "invalid_json", "invalid request body")
	}

	patch := connectusecase.UpdatePatch{
		Name:                   req.Name,
		Category:               req.Category,
		Tags:                   req.Tags,
		ContextNotes:           req.ContextNotes,
		ContactFrequencyTarget: req.ContactFrequencyTarget,
		SocialProfilesPatch:    req.SocialProfiles,
	}
	if p, err := decodeNullableString(req.Role); err != nil {
		return badRequestField(c, "role", "invalid_string", "role must be string or null")
	} else if p != nil {
		patch.Role = p
	}
	if p, err := decodeNullableString(req.Company); err != nil {
		return badRequestField(c, "company", "invalid_string", "company must be string or null")
	} else if p != nil {
		patch.Company = p
	}
	if p, err := decodeNullableString(req.Email); err != nil {
		return badRequestField(c, "email", "invalid_string", "email must be string or null")
	} else if p != nil {
		patch.Email = p
	}
	if p, err := decodeNullableString(req.Phone); err != nil {
		return badRequestField(c, "phone", "invalid_string", "phone must be string or null")
	} else if p != nil {
		patch.Phone = p
	}
	if p, err := decodeNullableString(req.MeetingLocation); err != nil {
		return badRequestField(c, "meeting_location", "invalid_string", "meeting_location must be string or null")
	} else if p != nil {
		patch.MeetingLocation = p
	}
	if p, err := decodeNullableDate(req.Birthday); err != nil {
		return badRequestField(c, "birthday", "invalid_birthday", "birthday must be YYYY-MM-DD or null")
	} else if p != nil {
		patch.Birthday = p
	}

	updated, err := h.uc.Update(c.Request().Context(), userID, id, patch)
	if err != nil {
		return h.mapError(c, err, "connect update failed")
	}
	return c.JSON(http.StatusOK, toResource(updated))
}

// ── Delete (UC-105) ───────────────────────────────────────────────

func (h *Handler) delete(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	if err := h.uc.Delete(c.Request().Context(), userID, id); err != nil {
		return h.mapError(c, err, "connect delete failed")
	}
	return c.NoContent(http.StatusNoContent)
}

// ── ScanBusinessCard (UC-106) ────────────────────────────────────

// scanBusinessCardRequest does NOT expose social_profiles (BR-SOCIAL-3
// — the OCR skill is not allowed to populate that column). Any
// `social_profiles` key the agent sends is silently ignored because
// it isn't in this struct.
type scanBusinessCardRequest struct {
	Name            string              `json:"name"`
	Role            *string             `json:"role"`
	Company         *string             `json:"company"`
	Email           *string             `json:"email"`
	Phone           *string             `json:"phone"`
	MeetingLocation *string             `json:"meeting_location"`
	Tags            []string            `json:"tags"`
	BusinessCard    entity.BusinessCard `json:"business_card"`
}

func (h *Handler) scanBusinessCard(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req scanBusinessCardRequest
	if err := c.Bind(&req); err != nil {
		return badRequest(c, "invalid_json", "invalid request body")
	}
	created, err := h.uc.ScanBusinessCard(c.Request().Context(), userID, connectusecase.ScanInput{
		Name:            req.Name,
		Role:            req.Role,
		Company:         req.Company,
		Email:           req.Email,
		Phone:           req.Phone,
		MeetingLocation: req.MeetingLocation,
		Tags:            req.Tags,
		BusinessCard:    req.BusinessCard,
	})
	if err != nil {
		return h.mapError(c, err, "connect scan business_card failed")
	}
	return c.JSON(http.StatusCreated, toResource(created))
}

// ── AttachBusinessCard (UC-110 attach path) ──────────────────────

func (h *Handler) attachBusinessCard(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	var bc entity.BusinessCard
	if err := c.Bind(&bc); err != nil {
		return badRequest(c, "invalid_json", "invalid request body")
	}
	updated, err := h.uc.AttachBusinessCard(c.Request().Context(), userID, id, bc)
	if err != nil {
		return h.mapError(c, err, "connect attach business_card failed")
	}
	return c.JSON(http.StatusOK, toResource(updated))
}

// ── UpdateSocialProfiles (UC-107) ────────────────────────────────

func (h *Handler) updateSocialProfiles(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	// Raw-decode so `"facebook": null` round-trips as a nil pointer
	// (merge-patch delete) instead of being dropped by the JSON decoder.
	var patch map[string]*string
	if err := c.Bind(&patch); err != nil {
		return badRequest(c, "invalid_json", "body must be a JSON object of {platform: url|null}")
	}
	updated, err := h.uc.UpdateSocialProfiles(c.Request().Context(), userID, id, patch)
	if err != nil {
		return h.mapError(c, err, "connect update social_profiles failed")
	}
	return c.JSON(http.StatusOK, toResource(updated))
}

// ── UpdateContextNotes (UC-108) ──────────────────────────────────

func (h *Handler) updateContextNotes(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	// Raw-body cap: 16 KiB. Prevents a pathological payload of
	// whitespace/combining marks from blowing up the decoder before
	// the rune-count check in the usecase can reject it.
	body, err := io.ReadAll(io.LimitReader(c.Request().Body, contextNotesRawLimit+1))
	if err != nil {
		return badRequest(c, "invalid_body", "failed to read body")
	}
	if len(body) > contextNotesRawLimit {
		return c.JSON(http.StatusRequestEntityTooLarge, echo.Map{
			"error": echo.Map{"code": "body_too_large", "message": "request body exceeds 16 KiB"},
		})
	}
	var req struct {
		ContextNotes string `json:"context_notes"`
	}
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&req); err != nil {
		return badRequest(c, "invalid_json", "invalid request body")
	}
	updated, err := h.uc.UpdateContextNotes(c.Request().Context(), userID, id, req.ContextNotes)
	if err != nil {
		return h.mapError(c, err, "connect update context_notes failed")
	}
	return c.JSON(http.StatusOK, toResource(updated))
}

// ── Touch / RecordManualContact (UC-109) ─────────────────────────

type touchRequest struct {
	OccurredAt  *time.Time `json:"occurred_at"`
	Note        string     `json:"note"`
	DurationMin int        `json:"duration_min"`
}

func (h *Handler) touch(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := parseIDParam(c)
	if err != nil {
		return badRequestField(c, "id", "invalid_id", "id must be a uuid")
	}
	var req touchRequest
	if err := c.Bind(&req); err != nil {
		return badRequest(c, "invalid_json", "invalid request body")
	}
	var occurred time.Time
	if req.OccurredAt != nil {
		occurred = *req.OccurredAt
	}
	updated, err := h.uc.RecordManualContact(c.Request().Context(), userID, id, occurred, req.Note, req.DurationMin)
	if err != nil {
		return h.mapError(c, err, "connect touch failed")
	}
	return c.JSON(http.StatusOK, toResource(updated))
}

// ── helpers ───────────────────────────────────────────────────────

func parseIDParam(c echo.Context) (uuid.UUID, error) {
	return uuid.Parse(c.Param("id"))
}

// decodeNullableString maps a json.RawMessage carrying a string-or-null
// field into the **string used by UpdatePatch. Returns:
//
//	(nil, nil)   — field absent
//	(**nil, nil) — field present and null   (inner *string == nil)
//	(**&s, nil)  — field present with value (inner *string == &s)
//
// The caller only stores the outer `**string` into the patch when it
// is non-nil, so "absent" and "null" stay distinct all the way down.
func decodeNullableString(raw json.RawMessage) (**string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		var p *string // inner nil → delete
		return &p, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	p := &s
	return &p, nil
}

// decodeNullableDate mirrors decodeNullableString but for YYYY-MM-DD.
// Returns a **time.Time so the patch can distinguish null from absent.
func decodeNullableDate(raw json.RawMessage) (**time.Time, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		var p *time.Time
		return &p, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, err
	}
	p := &t
	return &p, nil
}

// mapError translates usecase errors to HTTP responses. FieldError
// (and anything else that satisfies errors.Is(..., ErrInvalidArgument))
// → 400 with `{error: {code, field, message}}`. ErrNotFound → 404.
// Anything else → 500 with a logged message.
func (h *Handler) mapError(c echo.Context, err error, logMsg string) error {
	if errors.Is(err, domain.ErrNotFound) {
		return c.JSON(http.StatusNotFound, echo.Map{
			"error": echo.Map{"code": "not_found", "message": "resource not found"},
		})
	}
	var fe *connectusecase.FieldError
	if errors.As(err, &fe) {
		body := echo.Map{"code": fe.Code, "message": fe.Message}
		if fe.Field != "" {
			body["field"] = fe.Field
		}
		return c.JSON(http.StatusBadRequest, echo.Map{"error": body})
	}
	if errors.Is(err, domain.ErrInvalidArgument) {
		return c.JSON(http.StatusBadRequest, echo.Map{
			"error": echo.Map{"code": "invalid_argument", "message": err.Error()},
		})
	}
	if errors.Is(err, domain.ErrConflict) {
		return c.JSON(http.StatusConflict, echo.Map{
			"error": echo.Map{"code": "conflict", "message": err.Error()},
		})
	}
	h.logger.Warn(logMsg, zap.Error(err))
	return c.JSON(http.StatusInternalServerError, echo.Map{
		"error": echo.Map{"code": "internal_error", "message": "internal server error"},
	})
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, echo.Map{
		"error": echo.Map{"code": "unauthorized", "message": "unauthorized"},
	})
}

func badRequest(c echo.Context, code, msg string) error {
	return c.JSON(http.StatusBadRequest, echo.Map{
		"error": echo.Map{"code": code, "message": msg},
	})
}

func badRequestField(c echo.Context, field, code, msg string) error {
	return c.JSON(http.StatusBadRequest, echo.Map{
		"error": echo.Map{"code": code, "field": field, "message": msg},
	})
}
