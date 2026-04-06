package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// ── Login attempt tracking (in-memory) ───────────────────────────────────────

const (
	maxLoginAttempts  = 5
	lockoutDuration   = 15 * time.Minute
	minPasswordLength = 10
)

type loginAttempt struct {
	mu       sync.Mutex
	count    int
	lockedAt time.Time
	lastSeen time.Time
}

var (
	loginAttempts = sync.Map{} // key: email → *loginAttempt
)

// init starts a background goroutine that sweeps stale loginAttempt entries every
// 15 minutes to prevent unbounded memory growth for emails that never reach lockout.
func init() {
	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			loginAttempts.Range(func(k, v any) bool {
				a := v.(*loginAttempt)
				a.mu.Lock()
				stale := time.Since(a.lastSeen) > 30*time.Minute
				a.mu.Unlock()
				if stale {
					loginAttempts.Delete(k)
				}
				return true
			})
		}
	}()
}

func isLockedOut(email string) bool {
	val, ok := loginAttempts.Load(email)
	if !ok {
		return false
	}
	a := val.(*loginAttempt)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.count < maxLoginAttempts {
		return false
	}
	if time.Since(a.lockedAt) > lockoutDuration {
		a.count = 0
		return false
	}
	return true
}

func recordFailedLogin(email string) {
	val, _ := loginAttempts.LoadOrStore(email, &loginAttempt{})
	a := val.(*loginAttempt)
	a.mu.Lock()
	defer a.mu.Unlock()
	a.count++
	a.lastSeen = time.Now()
	if a.count >= maxLoginAttempts {
		a.lockedAt = time.Now()
	}
}

func clearLoginAttempts(email string) {
	loginAttempts.Delete(email)
}

// validatePasswordComplexity checks that password meets complexity requirements.
func validatePasswordComplexity(pw string) string {
	if len(pw) < minPasswordLength {
		return "password must be at least 10 characters"
	}
	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}
	if !hasUpper {
		return "password must contain at least one uppercase letter"
	}
	if !hasLower {
		return "password must contain at least one lowercase letter"
	}
	if !hasDigit {
		return "password must contain at least one digit"
	}
	if !hasSpecial {
		return "password must contain at least one special character"
	}
	return ""
}

type AuthHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewAuthHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *AuthHandler {
	return &AuthHandler{db: db, config: cfg, logger: logger}
}

type JWTClaims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

func (h *AuthHandler) JWTMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return []byte(h.config.JWTSecret), nil
			})
			if err != nil || !token.Valid {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			}

			c.Set("user", token)
			return next(c)
		}
	}
}

func (h *AuthHandler) generateToken(userID uuid.UUID) (string, error) {
	claims := &JWTClaims{
		UserID: userID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.config.JWTSecret))
}

type RegisterRequest struct {
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required,min=8"`
	DisplayName string `json:"display_name"`
	Name        string `json:"name"` // alias for display_name from web frontend
}

func (h *AuthHandler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Validate password complexity
	if msg := validatePasswordComplexity(req.Password); msg != "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": msg})
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to hash password"})
	}

	// Validate input lengths
	if len(req.Email) > 254 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "email too long"})
	}

	// Create user — accept both "name" and "display_name"
	userID := uuid.New()
	email := req.Email
	name := req.DisplayName
	if name == "" {
		name = req.Name
	}
	if len(name) > 100 {
		name = name[:100]
	}
	hashStr := string(hash)

	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)`,
		userID, email, hashStr, name,
	)
	if err != nil {
		h.logger.Error("Failed to create user", zap.Error(err))
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return c.JSON(http.StatusConflict, map[string]string{"error": "email already exists"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create account"})
	}

	token, err := h.generateToken(userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"token":   token,
		"user_id": userID.String(),
		"email":   email,
		"name":    name,
	})
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Check lockout before querying DB (prevents timing-based enumeration)
	if isLockedOut(req.Email) {
		return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "account temporarily locked. try again later"})
	}

	var userID uuid.UUID
	var passwordHash string
	var displayName *string
	err := h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, password_hash, display_name FROM users WHERE email = $1 AND is_active = true`,
		req.Email,
	).Scan(&userID, &passwordHash, &displayName)
	if err != nil {
		recordFailedLogin(req.Email)
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}

	// Reject empty password_hash (e.g., Telegram-only accounts)
	if passwordHash == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		recordFailedLogin(req.Email)
		h.logger.Warn("failed login attempt", zap.String("email", req.Email), zap.String("ip", c.RealIP()))
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}
	clearLoginAttempts(req.Email)

	token, err := h.generateToken(userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	name := ""
	if displayName != nil {
		name = *displayName
	}

	return c.JSON(http.StatusOK, map[string]any{
		"token":   token,
		"user_id": userID.String(),
		"email":   req.Email,
		"name":    name,
	})
}

// RefreshToken issues a new JWT if the current one is still valid.
func (h *AuthHandler) RefreshToken(c echo.Context) error {
	authHeader := c.Request().Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	parsed, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(h.config.JWTSecret), nil
	})
	if err != nil || !parsed.Valid {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}
	claims, ok := parsed.Claims.(*JWTClaims)
	if !ok {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	// Verify the account is still active — tokens for deactivated users must not be renewed.
	var isActive bool
	if err := h.db.QueryRowContext(c.Request().Context(),
		`SELECT is_active FROM users WHERE id = $1`, userID,
	).Scan(&isActive); err != nil || !isActive {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "account inactive or not found"})
	}

	token, err := h.generateToken(userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	return c.JSON(http.StatusOK, map[string]any{"token": token})
}
