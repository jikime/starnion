// Package googleoauth implements the Google OAuth token exchange and
// revocation HTTP calls. It was extracted from handler/integrations.go
// so the integrations CA slice can depend on a small port instead of
// inlining net/http calls inside the usecase.
package googleoauth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	authURL   = "https://accounts.google.com/o/oauth2/v2/auth"
	tokenURL  = "https://oauth2.googleapis.com/token"
	revokeURL = "https://oauth2.googleapis.com/revoke"
)

// Scopes is the fixed OAuth scope set the gateway asks for via the
// /integrations/google/auth-url endpoint: openid, email, profile,
// calendar (readonly), drive (readonly), and contacts (readonly —
// added 2026-04 for UC-302 Google Contacts import).
const Scopes = "openid email profile " +
	"https://www.googleapis.com/auth/calendar.readonly " +
	"https://www.googleapis.com/auth/drive.readonly " +
	"https://www.googleapis.com/auth/contacts.readonly"

// AuthURL exports the Google consent-screen URL so the handler can
// still compose query params server-side without importing this
// package for a constant.
const AuthURL = authURL

// Tokens is the decoded /oauth2/v4/token response with ExpiresAt
// computed from the server-local clock.
type Tokens struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresIn    int       `json:"expires_in"`
	Scope        string    `json:"scope"`
	TokenType    string    `json:"token_type"`
	ExpiresAt    time.Time `json:"-"`
}

// Client is a thin HTTP client for the Google OAuth endpoints. 15s
// timeout prevents hanging goroutines on slow upstream responses.
type Client struct {
	http *http.Client
}

func NewClient() *Client {
	return &Client{http: &http.Client{Timeout: 15 * time.Second}}
}

// Exchange swaps an authorization code for a token bundle.
func (c *Client) Exchange(ctx context.Context, clientID, clientSecret, redirectURL, code string) (Tokens, error) {
	params := url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURL},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return Tokens{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return Tokens{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return Tokens{}, fmt.Errorf("google token exchange %d: %s", resp.StatusCode, body)
	}
	var t Tokens
	if err := json.Unmarshal(body, &t); err != nil {
		return Tokens{}, err
	}
	t.ExpiresAt = time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	return t, nil
}

// RefreshAccessToken trades a long-lived refresh_token for a fresh
// access_token. Called by the integrations usecase from the nightly
// ingest cron when the stored access token is near its expiry.
//
// Google's refresh flow returns everything except `refresh_token`
// itself (since that one persists), so callers should keep the
// stored refresh_token in place and only overwrite access_token +
// expires_at on the returned struct.
func (c *Client) RefreshAccessToken(ctx context.Context, clientID, clientSecret, refreshToken string) (Tokens, error) {
	params := url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"refresh_token": {refreshToken},
		"grant_type":    {"refresh_token"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return Tokens{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return Tokens{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return Tokens{}, fmt.Errorf("google token refresh %d: %s", resp.StatusCode, body)
	}
	var t Tokens
	if err := json.Unmarshal(body, &t); err != nil {
		return Tokens{}, err
	}
	// The refresh_token is NOT returned by Google on refresh. The
	// caller should preserve the one it already has.
	if t.RefreshToken == "" {
		t.RefreshToken = refreshToken
	}
	t.ExpiresAt = time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	return t, nil
}

// Revoke invalidates the access token on Google's side. It is
// best-effort; callers should log and swallow errors.
func (c *Client) Revoke(token string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, revokeURL,
		strings.NewReader("token="+url.QueryEscape(token)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return nil
}
