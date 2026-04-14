package signedurl

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
)

// TestPythonParity locks the signature scheme against the Python helper in
// agent/skills/_shared/starnion_utils.py so both sides stay in sync.
// The Python helper does:
//
//	payload = f"{object_key}:{exp}:{user_id}".encode()
//	mac     = hmac.new(secret, payload, sha256).digest()
//	sig     = mac[:16].hex()
//
// This test computes the same signature in Go and confirms it matches what
// computeMAC produces for the same (object_key, user_id, exp, secret) triple.
func TestPythonParity(t *testing.T) {
	objectKey := "users/abc-123/telegram/2026/test.jpg"
	userID := "abc-123"
	secret := "test-secret"
	var exp int64 = 1744633200

	// Reference (same math as Python helper).
	ref := hmac.New(sha256.New, []byte(secret))
	ref.Write([]byte(fmt.Sprintf("%s:%d:%s", objectKey, exp, userID)))
	refSig := hex.EncodeToString(ref.Sum(nil)[:16])

	got := computeMAC(objectKey, userID, exp, secret)
	if got != refSig {
		t.Errorf("computeMAC mismatch:\n  got:  %s\n  want: %s", got, refSig)
	}
}
