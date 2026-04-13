package auth

import (
	"crypto/rand"
	"encoding/base64"
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
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
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

	// dummyLoginHash is a precomputed bcrypt cost-12 hash of an impossible
	// password. The login path feeds any request with an unknown email
	// through this hash so the total response time is indistinguishable
	// from a known-email-wrong-password attempt. Eliminates the timing
	// oracle that used to let attackers enumerate valid email addresses.
	dummyLoginHash = []byte("$2a$12$C6UzMDM.H6dfI/f/IKxGhuaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
)

// init starts a background goroutine that evicts stale login
// attempt records. Token blacklist storage + eviction now lives
// in the httpauth package (see BlacklistToken / IsTokenBlacklisted)
// so both the auth handler and the agentchat WS handler can
// reach it without a circular package dependency.
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

type Handler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{db: db, config: cfg, logger: logger}
}

func (h *Handler) JWTMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			// Check blacklist before parsing
			if httpauth.IsTokenBlacklisted(tokenStr) {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "token revoked"})
			}

			token, err := jwt.ParseWithClaims(tokenStr, &httpauth.Claims{}, func(t *jwt.Token) (any, error) {
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

func (h *Handler) generateToken(userID uuid.UUID) (string, error) {
	claims := &httpauth.Claims{
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

func (h *Handler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	// Struct-tag validation: required + email format + min length.
	// Runs before the heavier password-complexity check so trivial
	// failures return fast without allocating a bcrypt.
	if err := c.Validate(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	// Validate password complexity
	if msg := validatePasswordComplexity(req.Password); msg != "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": msg})
	}

	// Hash password. Cost 12 is the 2026 floor for a service that stores
	// LLM provider API keys and OAuth refresh tokens; bcrypt.DefaultCost
	// (10) is too weak against modern GPU/FPGA attacks.
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
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

	_, err = h.db.Pool().Exec(c.Request().Context(),
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

func (h *Handler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	// Struct-tag validation: required + email format. Returns the
	// same 401 shape on validation failure that the credential
	// check does below, so an attacker cannot distinguish
	// "malformed email" from "unknown user" via status code alone.
	if err := c.Validate(&req); err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}

	// Snapshot the lockout state but do NOT return early on a
	// lockout match — skipping the DB + bcrypt work below would
	// make locked-out accounts measurably faster to respond to
	// (timing oracle: "this email has recently been attacked").
	// We still need the flag to decide the final response, so we
	// carry it through the hash compute.
	locked := isLockedOut(req.Email)

	var userID uuid.UUID
	var passwordHash string
	var displayName *string
	dbErr := h.db.Pool().QueryRow(c.Request().Context(),
		`SELECT id, password_hash, display_name FROM users WHERE email = $1 AND is_active = true`,
		req.Email,
	).Scan(&userID, &passwordHash, &displayName)

	// User enumeration defense: always run bcrypt.CompareHashAndPassword
	// with the same cost, whether the user exists, is locked, or the
	// password is wrong. `dummyLoginHash` is a precomputed cost-12 hash
	// of an impossible password so every code path spends ~260ms before
	// the error branch is picked — closes the timing oracle for email
	// enumeration and for "is this account rate-limited right now".
	var bcryptErr error
	if dbErr != nil || passwordHash == "" {
		bcryptErr = bcrypt.CompareHashAndPassword(dummyLoginHash, []byte(req.Password))
	} else {
		bcryptErr = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password))
	}

	// Now that the constant-time work is done, evaluate the outcome.
	// Lockout check comes first so a locked-out attacker sees the
	// "locked" message regardless of whether they supplied the
	// correct password (prevents credential stuffing from "oracle"
	// shaping its guesses around the lockout window).
	if locked {
		return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "account temporarily locked. try again later"})
	}
	if dbErr != nil || passwordHash == "" || bcryptErr != nil {
		recordFailedLogin(req.Email)
		if bcryptErr != nil && passwordHash != "" {
			h.logger.Warn("failed login attempt", zap.String("email", req.Email), zap.String("ip", c.RealIP()))
		}
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
//
// Security invariants enforced here:
//  1. The presented token must not already be blacklisted — a
//     logged-out or previously-refreshed token cannot be used to
//     mint a new one (defends against stolen-token replay).
//  2. The token must carry an `exp` claim — a nil `ExpiresAt`
//     would panic below when we hand it to BlacklistToken, and
//     also indicates a malformed token that we shouldn't honour.
//  3. The signing algorithm must be HMAC — rejects `alg: none`
//     and RS256 confusion attacks.
//  4. The account must still be active — deactivated users cannot
//     refresh even if they still hold a valid unexpired token.
func (h *Handler) RefreshToken(c echo.Context) error {
	authHeader := c.Request().Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	// Invariant 1: a blacklisted token cannot be refreshed. Without
	// this check, Logout → Refresh on the same token happily mints a
	// fresh 24-hour token even though the user has revoked access.
	if httpauth.IsTokenBlacklisted(tokenStr) {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "token revoked"})
	}

	parsed, err := jwt.ParseWithClaims(tokenStr, &httpauth.Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(h.config.JWTSecret), nil
	})
	if err != nil || !parsed.Valid {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}
	claims, ok := parsed.Claims.(*httpauth.Claims)
	if !ok {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	// Invariant 2: nil ExpiresAt would panic on the BlacklistToken
	// call below when we do `claims.ExpiresAt.Time`. A missing exp
	// claim is also a malformed token per RFC 7519 §4.1.4.
	if claims.ExpiresAt == nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "token missing exp"})
	}

	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	// Invariant 4: verify the account is still active — tokens for
	// deactivated users must not be renewed even if they unexpired.
	var isActive bool
	if err := h.db.Pool().QueryRow(c.Request().Context(),
		`SELECT is_active FROM users WHERE id = $1`, userID,
	).Scan(&isActive); err != nil || !isActive {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "account inactive or not found"})
	}

	token, err := h.generateToken(userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	// Blacklist the old token so it can't be reused. Safe now that
	// we've guarded against nil ExpiresAt above.
	httpauth.BlacklistToken(tokenStr, claims.ExpiresAt.Time)

	return c.JSON(http.StatusOK, map[string]any{"token": token})
}

// Logout invalidates the current JWT token by adding it to the
// blacklist until its natural expiry. The parser enforces the
// HMAC signing method so a forged `alg: none` token cannot be
// used to poison the blacklist map with arbitrary strings (which
// would be a low-severity DoS vector filling the sync.Map for the
// full 24-hour window).
func (h *Handler) Logout(c echo.Context) error {
	authHeader := c.Request().Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	parsed, err := jwt.ParseWithClaims(tokenStr, &httpauth.Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(h.config.JWTSecret), nil
	})
	if err == nil && parsed.Valid {
		if claims, ok := parsed.Claims.(*httpauth.Claims); ok && claims.ExpiresAt != nil {
			httpauth.BlacklistToken(tokenStr, claims.ExpiresAt.Time)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// ── Auth Link ─────────────────────────────────────────────────────────────────

// POST /api/v1/auth/link
// Generates a short-lived 8-character alphanumeric code stored in platform_link_codes.
// A Telegram bot (or other platform) can call this code to link the user's account.
// The code expires in 10 minutes.
func (h *Handler) AuthLink(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	// Generate a 6-byte random code → 8-char base32-like uppercase alphanum
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate code"})
	}
	// Encode to uppercase alphanumeric (drop non-alphanum, take first 8 chars)
	encoded := strings.ToUpper(strings.NewReplacer(
		"+", "", "/", "", "=", "",
	).Replace(base64.StdEncoding.EncodeToString(buf)))
	if len(encoded) > 8 {
		encoded = encoded[:8]
	}

	expiresAt := time.Now().Add(10 * time.Minute)
	ctx := c.Request().Context()

	// Invalidate any existing codes for this user
	h.db.Pool().Exec(ctx,
		`DELETE FROM platform_link_codes WHERE user_id = $1`, userID,
	)

	// Insert new code
	_, err = h.db.Pool().Exec(ctx,
		`INSERT INTO platform_link_codes (code, user_id, expires_at) VALUES ($1, $2, $3)`,
		encoded, userID, expiresAt,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save link code"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"code":       encoded,
		"expires_at": expiresAt.Format(time.RFC3339),
		"expires_in": 600, // seconds
	})
}

// ── WS Token ──────────────────────────────────────────────────────────────────

// GET /api/v1/ws-token
// Returns a short-lived JWT (1 hour) that can be used as a WebSocket auth token.
// Clients send it as ?token=... in the WS upgrade URL so it doesn't block the HTTP
// Authorization header (which browsers don't support on WebSocket upgrades).
func (h *Handler) GetWSToken(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"type":    "ws",
		"exp":     time.Now().Add(1 * time.Hour).Unix(),
		"jti":     uuid.New().String(), // unique token ID
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.config.JWTSecret))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"token":      signed,
		"expires_in": 3600,
		"type":       "ws",
	})
}

// unauthorized returns a canonical 401 JSON response.
func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}
