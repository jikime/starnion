package identity

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

// Platform 상수
const (
	PlatformTelegram  = "telegram"
	PlatformDiscord   = "discord"
	PlatformSlack     = "slack"
	PlatformKakao     = "kakao"
	PlatformTeams     = "teams"
	PlatformWhatsApp  = "whatsapp"
	PlatformWeb       = "web"
)

// Service는 플랫폼 독립적 사용자 ID 관리를 담당합니다.
type Service struct {
	db *sql.DB
}

// New는 새 Identity Service를 생성합니다.
func New(db *sql.DB) *Service {
	return &Service{db: db}
}

// ResolveUserID는 플랫폼 + 플랫폼 ID로 내부 user_id(UUID)를 반환합니다.
// 존재하지 않으면 users + platform_identities 레코드를 자동 생성합니다.
func (s *Service) ResolveUserID(platform, platformID string) (string, error) {
	// 1. platform_identities에서 조회
	var userID string
	err := s.db.QueryRow(`
		SELECT user_id FROM platform_identities
		WHERE platform = $1 AND platform_id = $2
	`, platform, platformID).Scan(&userID)

	if err == nil {
		// 마지막 활동 시간 업데이트 (비동기)
		go s.updateLastActive(platform, platformID)
		return userID, nil
	}

	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("identity lookup: %w", err)
	}

	// 2. 없으면 신규 사용자 생성
	return s.createUser(platform, platformID, "")
}

// ResolveUserIDWithName은 display_name과 함께 사용자를 조회/생성합니다.
func (s *Service) ResolveUserIDWithName(platform, platformID, displayName string) (string, error) {
	var userID string
	err := s.db.QueryRow(`
		SELECT user_id FROM platform_identities
		WHERE platform = $1 AND platform_id = $2
	`, platform, platformID).Scan(&userID)

	if err == nil {
		// display_name 업데이트 (이름이 변경될 수 있음)
		if displayName != "" {
			go s.updateDisplayName(platform, platformID, displayName)
		}
		go s.updateLastActive(platform, platformID)
		return userID, nil
	}

	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("identity lookup: %w", err)
	}

	return s.createUser(platform, platformID, displayName)
}

// createUser는 신규 users + platform_identities 레코드를 트랜잭션으로 생성합니다.
func (s *Service) createUser(platform, platformID, displayName string) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// UUID 생성
	userID, err := generateUUID()
	if err != nil {
		return "", fmt.Errorf("generate uuid: %w", err)
	}

	// users 테이블 삽입
	_, err = tx.Exec(`
		INSERT INTO users (id, display_name, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`, userID, nullableString(displayName))
	if err != nil {
		return "", fmt.Errorf("insert user: %w", err)
	}

	// platform_identities 삽입
	_, err = tx.Exec(`
		INSERT INTO platform_identities (user_id, platform, platform_id, display_name, last_active_at, created_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		ON CONFLICT (platform, platform_id) DO UPDATE
		SET last_active_at = NOW()
		RETURNING user_id
	`, userID, platform, platformID, nullableString(displayName))
	if err != nil {
		return "", fmt.Errorf("insert platform identity: %w", err)
	}

	// CONFLICT 시 실제 user_id 재조회 (다른 goroutine이 먼저 삽입한 경우)
	var actualUserID string
	err = tx.QueryRow(`
		SELECT user_id FROM platform_identities
		WHERE platform = $1 AND platform_id = $2
	`, platform, platformID).Scan(&actualUserID)
	if err != nil {
		return "", fmt.Errorf("recheck identity: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}

	log.Info().
		Str("user_id", actualUserID).
		Str("platform", platform).
		Str("platform_id", platformID).
		Msg("new user created")

	return actualUserID, nil
}

// GetUserPlatforms는 사용자가 연결된 모든 플랫폼 정보를 반환합니다.
func (s *Service) GetUserPlatforms(userID string) ([]PlatformInfo, error) {
	rows, err := s.db.Query(`
		SELECT platform, platform_id, display_name, last_active_at, created_at
		FROM platform_identities
		WHERE user_id = $1
		ORDER BY last_active_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query platforms: %w", err)
	}
	defer rows.Close()

	var platforms []PlatformInfo
	for rows.Next() {
		var p PlatformInfo
		var displayName sql.NullString
		if err := rows.Scan(&p.Platform, &p.PlatformID, &displayName, &p.LastActiveAt, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.DisplayName = displayName.String
		platforms = append(platforms, p)
	}
	return platforms, rows.Err()
}

// GenerateLinkCode는 플랫폼 연결용 임시 코드를 생성합니다 (10분 유효).
func (s *Service) GenerateLinkCode(userID string) (string, error) {
	code := generateLinkCode()
	expiresAt := time.Now().Add(10 * time.Minute)

	_, err := s.db.Exec(`
		INSERT INTO platform_link_codes (code, user_id, expires_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (code) DO UPDATE SET user_id = $2, expires_at = $3
	`, code, userID, expiresAt)
	if err != nil {
		return "", fmt.Errorf("create link code: %w", err)
	}

	return code, nil
}

// UseLinkCode는 페어링 코드로 새 플랫폼을 기존 계정에 연결합니다.
func (s *Service) UseLinkCode(code, newPlatform, newPlatformID, displayName string) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// 코드 검증 및 user_id 조회
	var userID string
	var expiresAt time.Time
	err = tx.QueryRow(`
		SELECT user_id, expires_at FROM platform_link_codes
		WHERE code = $1
	`, code).Scan(&userID, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("invalid link code")
	}
	if err != nil {
		return "", fmt.Errorf("lookup link code: %w", err)
	}
	if time.Now().After(expiresAt) {
		return "", fmt.Errorf("link code expired")
	}

	// 새 플랫폼 연결
	_, err = tx.Exec(`
		INSERT INTO platform_identities (user_id, platform, platform_id, display_name, last_active_at, created_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		ON CONFLICT (platform, platform_id) DO UPDATE
		SET user_id = $1, display_name = $4, last_active_at = NOW()
	`, userID, newPlatform, newPlatformID, nullableString(displayName))
	if err != nil {
		return "", fmt.Errorf("link platform: %w", err)
	}

	// 코드 삭제 (일회용)
	_, err = tx.Exec(`DELETE FROM platform_link_codes WHERE code = $1`, code)
	if err != nil {
		return "", fmt.Errorf("delete link code: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}

	log.Info().
		Str("user_id", userID).
		Str("platform", newPlatform).
		Str("platform_id", newPlatformID).
		Msg("platform linked via code")

	return userID, nil
}

// MergeAndLink는 크레덴셜 웹 계정(fromUserID)을 기존 플랫폼 계정에 병합합니다.
// 링크 코드는 대상 계정(예: 텔레그램 사용자)이 생성한 것이어야 합니다.
// 병합 후:
//   - fromUserID의 email/password_hash가 toUserID로 이전됩니다 (toUserID에 없을 때만).
//   - fromUserID의 platform_identities 레코드가 toUserID로 이동합니다.
//   - fromUserID의 google_tokens 레코드가 toUserID로 이전됩니다 (FK 없어 명시적 처리).
//   - fromUserID의 users 레코드가 삭제됩니다 (관련 데이터 CASCADE 삭제).
//   - 링크 코드가 소비됩니다 (일회용).
//
// 정규 user_id(toUserID)를 반환합니다.
func (s *Service) MergeAndLink(fromUserID, code string) (string, error) {
	if fromUserID == "" || code == "" {
		return "", fmt.Errorf("fromUserID and code are required")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// 1. 코드 검증 → toUserID 조회
	var toUserID string
	var expiresAt time.Time
	err = tx.QueryRow(`
		SELECT user_id, expires_at FROM platform_link_codes
		WHERE code = $1
	`, code).Scan(&toUserID, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("invalid link code")
	}
	if err != nil {
		return "", fmt.Errorf("lookup link code: %w", err)
	}
	if time.Now().After(expiresAt) {
		return "", fmt.Errorf("link code expired")
	}
	if toUserID == fromUserID {
		return "", fmt.Errorf("cannot link account to itself")
	}

	// 2. email/password_hash 이전 (fromUserID → toUserID)
	// toUserID에 이미 email이 있으면 건너뜀.
	_, err = tx.Exec(`
		UPDATE users AS t
		SET email         = f.email,
		    password_hash = f.password_hash,
		    updated_at    = NOW()
		FROM users AS f
		WHERE t.id = $1
		  AND f.id = $2
		  AND f.email IS NOT NULL
		  AND t.email IS NULL
	`, toUserID, fromUserID)
	if err != nil {
		return "", fmt.Errorf("migrate credentials: %w", err)
	}

	// 3. platform_identities 복사 (fromUserID → toUserID)
	// ON CONFLICT DO NOTHING: toUserID에 이미 해당 플랫폼이 있으면 건너뜀
	_, err = tx.Exec(`
		INSERT INTO platform_identities (user_id, platform, platform_id, display_name, last_active_at, created_at)
		SELECT $1, platform, platform_id, display_name, last_active_at, created_at
		FROM platform_identities
		WHERE user_id = $2
		ON CONFLICT (platform, platform_id) DO NOTHING
	`, toUserID, fromUserID)
	if err != nil {
		return "", fmt.Errorf("migrate platform identities: %w", err)
	}

	// 4. fromUserID의 platform_identities 삭제
	_, err = tx.Exec(`DELETE FROM platform_identities WHERE user_id = $1`, fromUserID)
	if err != nil {
		return "", fmt.Errorf("delete old platform identities: %w", err)
	}

	// 4.5. google_tokens 이전 (fromUserID → toUserID)
	// google_tokens은 users에 FK가 없으므로 CASCADE 삭제되지 않아 명시적으로 처리.
	// toUserID에 이미 토큰이 있으면 fromUserID 토큰으로 덮어씌움 (더 최신일 가능성).
	_, err = tx.Exec(`
		INSERT INTO google_tokens (user_id, access_token, refresh_token, scopes, expires_at, updated_at)
		SELECT $1, access_token, refresh_token, scopes, expires_at, updated_at
		FROM google_tokens
		WHERE user_id = $2
		ON CONFLICT (user_id) DO UPDATE SET
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			scopes = EXCLUDED.scopes,
			expires_at = EXCLUDED.expires_at,
			updated_at = EXCLUDED.updated_at
	`, toUserID, fromUserID)
	if err != nil {
		return "", fmt.Errorf("migrate google tokens: %w", err)
	}

	// 이전 완료 후 orphan 토큰 삭제
	_, err = tx.Exec(`DELETE FROM google_tokens WHERE user_id = $1`, fromUserID)
	if err != nil {
		return "", fmt.Errorf("delete old google tokens: %w", err)
	}

	// 5. fromUserID의 users 레코드 삭제 (CASCADE로 나머지 데이터 정리)
	_, err = tx.Exec(`DELETE FROM users WHERE id = $1`, fromUserID)
	if err != nil {
		return "", fmt.Errorf("delete old user: %w", err)
	}

	// 6. 링크 코드 소비 (일회용)
	_, err = tx.Exec(`DELETE FROM platform_link_codes WHERE code = $1`, code)
	if err != nil {
		return "", fmt.Errorf("delete link code: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}

	log.Info().
		Str("from_user_id", fromUserID).
		Str("to_user_id", toUserID).
		Msg("accounts merged via link code")

	return toUserID, nil
}

// GetTelegramChatID는 user_id(UUID)로 Telegram chat ID를 조회합니다.
// 스케줄러에서 Telegram 메시지 전송 시 사용합니다.
func (s *Service) GetTelegramChatID(userID string) (string, error) {
	var platformID string
	err := s.db.QueryRow(`
		SELECT platform_id FROM platform_identities
		WHERE user_id = $1 AND platform = 'telegram'
	`, userID).Scan(&platformID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("no telegram for user %s", userID)
	}
	return platformID, err
}

// GetNotificationPlatform은 사용자의 알림 수신 플랫폼을 반환합니다.
// preferences.notification_platform 설정 또는 마지막 활성 플랫폼 사용.
func (s *Service) GetNotificationPlatform(userID string) (platform, platformID string, err error) {
	// 1. preferences에서 지정 플랫폼 확인
	var pref sql.NullString
	err = s.db.QueryRow(`
		SELECT preferences->>'notification_platform'
		FROM users
		WHERE id = $1
	`, userID).Scan(&pref)
	if err == nil && pref.Valid && pref.String != "" {
		var pid string
		pidErr := s.db.QueryRow(`
			SELECT platform_id FROM platform_identities
			WHERE user_id = $1 AND platform = $2
		`, userID, pref.String).Scan(&pid)
		if pidErr == nil {
			return pref.String, pid, nil
		}
	}

	// 2. 마지막으로 활성화된 플랫폼 사용
	err = s.db.QueryRow(`
		SELECT platform, platform_id FROM platform_identities
		WHERE user_id = $1
		ORDER BY last_active_at DESC
		LIMIT 1
	`, userID).Scan(&platform, &platformID)
	return platform, platformID, err
}

// updateLastActive는 플랫폼 마지막 활동 시간을 업데이트합니다.
func (s *Service) updateLastActive(platform, platformID string) {
	_, err := s.db.Exec(`
		UPDATE platform_identities
		SET last_active_at = NOW()
		WHERE platform = $1 AND platform_id = $2
	`, platform, platformID)
	if err != nil {
		log.Warn().Err(err).Str("platform", platform).Msg("update last_active failed")
	}
}

// updateDisplayName은 플랫폼 표시 이름을 업데이트합니다.
func (s *Service) updateDisplayName(platform, platformID, displayName string) {
	_, err := s.db.Exec(`
		UPDATE platform_identities
		SET display_name = $3
		WHERE platform = $1 AND platform_id = $2
	`, platform, platformID, displayName)
	if err != nil {
		log.Warn().Err(err).Str("platform", platform).Msg("update display_name failed")
	}
}

// PlatformInfo는 플랫폼 연결 정보를 담습니다.
type PlatformInfo struct {
	Platform     string
	PlatformID   string
	DisplayName  string
	LastActiveAt time.Time
	CreatedAt    time.Time
}

// generateUUID는 랜덤 UUID를 생성합니다.
func generateUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant bits
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}

// generateLinkCode는 사람이 읽기 쉬운 페어링 코드를 생성합니다 (예: STAR-7A4B).
func generateLinkCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	return fmt.Sprintf("STAR-%s", strings.ToUpper(fmt.Sprintf("%06X", b))[:6])
}

// nullableString은 빈 문자열을 sql.NullString으로 변환합니다.
func nullableString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
