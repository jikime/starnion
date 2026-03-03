package auth

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrEmailTaken   = errors.New("email already registered")
	ErrInvalidCreds = errors.New("invalid email or password")
)

// CredentialUser holds the resolved user info after register or login.
type CredentialUser struct {
	UserID string
	Email  string
	Name   string
}

// Register creates a new credential-based user account.
// It inserts into users, user_credentials, and platform_identities (platform="credential").
func Register(db *sql.DB, name, email, password string) (*CredentialUser, error) {
	// Check email uniqueness first (fast path before hashing).
	var exists bool
	if err := db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM user_credentials WHERE email = $1)`, email,
	).Scan(&exists); err != nil {
		return nil, fmt.Errorf("check email: %w", err)
	}
	if exists {
		return nil, ErrEmailTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	userID, err := newUUID()
	if err != nil {
		return nil, fmt.Errorf("generate uuid: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err = tx.Exec(
		`INSERT INTO users (id, display_name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())`,
		userID, name,
	); err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	if _, err = tx.Exec(
		`INSERT INTO user_credentials (user_id, email, password_hash, created_at, updated_at)
		 VALUES ($1, $2, $3, NOW(), NOW())`,
		userID, email, string(hash),
	); err != nil {
		return nil, fmt.Errorf("insert credentials: %w", err)
	}

	// Register as "credential" platform so account linking works uniformly.
	if _, err = tx.Exec(
		`INSERT INTO platform_identities (user_id, platform, platform_id, display_name, last_active_at, created_at)
		 VALUES ($1, 'credential', $2, $3, NOW(), NOW())`,
		userID, email, name,
	); err != nil {
		return nil, fmt.Errorf("insert platform identity: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &CredentialUser{UserID: userID, Email: email, Name: name}, nil
}

// Login verifies email/password and returns user info on success.
func Login(db *sql.DB, email, password string) (*CredentialUser, error) {
	var userID, hash, name string
	err := db.QueryRow(`
		SELECT uc.user_id, uc.password_hash, COALESCE(u.display_name, '')
		FROM user_credentials uc
		JOIN users u ON u.id = uc.user_id
		WHERE uc.email = $1
	`, email).Scan(&userID, &hash, &name)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvalidCreds
	}
	if err != nil {
		return nil, fmt.Errorf("lookup credentials: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, ErrInvalidCreds
	}

	// Update last active (non-blocking).
	go db.Exec(
		`UPDATE platform_identities SET last_active_at = NOW() WHERE user_id = $1 AND platform = 'credential'`,
		userID,
	)

	return &CredentialUser{UserID: userID, Email: email, Name: name}, nil
}

// newUUID generates a random UUID v4.
func newUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
