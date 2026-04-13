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

// Scopes is the fixed OAuth scope set the gateway asks for: openid,
// email, profile, calendar (readonly), drive (readonly).
const Scopes = "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly"

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
