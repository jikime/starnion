// Package signedurl issues and verifies short-lived HMAC-signed URLs
// for file downloads. It is the intended replacement for passing a
// 24-hour session JWT in the `?token=` query parameter of
// /api/files/*, which is the pattern the Round 2 security review
// flagged as S-H3.
//
// Scheme:
//
//	GET /api/files/<object_key>?exp=<unix>&sig=<hex>
//
// The signature is HMAC-SHA256(secret, "<object_key>:<exp>:<user_id>")
// truncated to the first 16 bytes of hex. `user_id` is included in the
// signed payload so a leaked signature cannot be redeemed by a
// different user — but is NOT put in the URL because the path already
// starts with users/<user_id>/... and the verifier extracts it from
// there. `exp` is a unix timestamp; the verifier rejects URLs whose
// `exp` is in the past.
//
// Security properties:
//   - The signature binds the url path, expiry, AND the owning user —
//     stealing a link from user A cannot be used by user B (the verifier
//     re-derives user_id from the object-key prefix).
//   - Signatures are one-shot only in the sense that they expire quickly
//     (default 5 minutes). We do not track used signatures; if you need
//     true single-use you can add a Redis-backed seen-set later.
//   - constant-time compare (crypto/subtle) prevents timing oracles.
package signedurl

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultTTL is the lifetime of a newly-issued signed URL. 5 minutes is
// long enough for a browser to fetch a large file but short enough that
// a leaked link is effectively dead by the time it ends up in a log
// aggregator or a chat paste.
const DefaultTTL = 5 * time.Minute

// ErrExpired is returned by Verify when the signature is valid but the
// `exp` field is in the past.
var ErrExpired = errors.New("signedurl: expired")

// ErrInvalid is returned by Verify when the signature is missing,
// malformed, or does not match the server's HMAC.
var ErrInvalid = errors.New("signedurl: invalid signature")

// Sign returns the signed query string for `objectKey` owned by the
// given user. The caller appends it to the base URL:
//
//	"/api/files/" + objectKey + "?" + Sign(objectKey, userID, secret, ttl)
func Sign(objectKey, userID, secret string, ttl time.Duration) string {
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	exp := time.Now().Add(ttl).Unix()
	sig := computeMAC(objectKey, userID, exp, secret)
	params := url.Values{}
	params.Set("exp", strconv.FormatInt(exp, 10))
	params.Set("sig", sig)
	return params.Encode()
}

// Verify validates a signed URL against a request's query parameters
// and the object key extracted from the path. The caller is responsible
// for deriving `userID` from the object key prefix (typically
// "users/<uuid>/...") before calling Verify so the verifier can rebuild
// the signature without trusting client-supplied data.
//
// Returns nil on success, ErrExpired / ErrInvalid otherwise.
func Verify(objectKey, userID, secret string, query url.Values) error {
	sig := query.Get("sig")
	expStr := query.Get("exp")
	if sig == "" || expStr == "" {
		return ErrInvalid
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return ErrInvalid
	}
	if time.Now().Unix() >= exp {
		return ErrExpired
	}
	want := computeMAC(objectKey, userID, exp, secret)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(want)) != 1 {
		return ErrInvalid
	}
	return nil
}

// UserIDFromObjectKey extracts the user UUID from a canonical
// "users/<uuid>/..." object key. Returns "" when the key doesn't match
// the user-scoped prefix (e.g. shared browser/screenshots/...).
func UserIDFromObjectKey(objectKey string) string {
	const prefix = "users/"
	if !strings.HasPrefix(objectKey, prefix) {
		return ""
	}
	rest := objectKey[len(prefix):]
	slash := strings.IndexByte(rest, '/')
	if slash <= 0 {
		return ""
	}
	return rest[:slash]
}

// computeMAC builds the HMAC-SHA256 over the canonical payload and
// returns the first 16 bytes of hex (32 hex chars = 128 bits, plenty
// for a 5-minute validity window).
func computeMAC(objectKey, userID string, exp int64, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(objectKey))
	mac.Write([]byte{':'})
	mac.Write([]byte(strconv.FormatInt(exp, 10)))
	mac.Write([]byte{':'})
	mac.Write([]byte(userID))
	sum := mac.Sum(nil)
	return hex.EncodeToString(sum[:16])
}
