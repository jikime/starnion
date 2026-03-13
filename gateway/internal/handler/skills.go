package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"

	"github.com/jikime/starnion/gateway/internal/skill"
)

// SkillHandler exposes skill management as REST endpoints.
type SkillHandler struct {
	svc *skill.Service
}

// NewSkillHandler creates a new SkillHandler.
func NewSkillHandler(svc *skill.Service) *SkillHandler {
	return &SkillHandler{svc: svc}
}

// List returns all skills with the user's enabled state.
// GET /api/v1/skills?user_id=...
func (h *SkillHandler) List(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	skills, err := h.svc.GetUserSkills(userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("skills: list failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch skills"})
	}

	type skillResponse struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Emoji       string `json:"emoji"`
		Enabled     bool   `json:"enabled"`
		Permission  int    `json:"permission"`
		SortOrder   int    `json:"sort_order"`
	}

	resp := make([]skillResponse, 0, len(skills))
	for _, s := range skills {
		resp = append(resp, skillResponse{
			ID:          s.ID,
			Name:        s.Name,
			Description: s.Description,
			Category:    s.Category,
			Emoji:       s.Emoji,
			Enabled:     s.Enabled,
			Permission:  s.Permission,
			SortOrder:   s.SortOrder,
		})
	}
	return c.JSON(http.StatusOK, resp)
}

// Toggle flips a skill's enabled state for the user.
// POST /api/v1/skills/:id/toggle?user_id=...
func (h *SkillHandler) Toggle(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	skillID := c.Param("id")
	if skillID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "skill id required"})
	}

	newEnabled, err := h.svc.Toggle(userID, skillID)
	if err != nil {
		if err.Error() == "system skill cannot be toggled" {
			return c.JSON(http.StatusForbidden, map[string]string{"error": err.Error()})
		}
		log.Error().Err(err).Str("user_id", userID).Str("skill_id", skillID).Msg("skills: toggle failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "toggle failed"})
	}

	return c.JSON(http.StatusOK, map[string]any{"id": skillID, "enabled": newEnabled})
}
