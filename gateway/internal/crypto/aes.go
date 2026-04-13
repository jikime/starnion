// Package crypto provides AES-256-GCM symmetric encryption helpers for
// storing sensitive values (API keys, tokens) at rest in the database.
//
// Usage:
//
//	enc, err := crypto.Encrypt(plaintext, masterKey)
//	plain, err := crypto.Decrypt(enc, masterKey)
//
// If masterKey is empty the functions return the value unchanged so that
// existing installations without an ENCRYPTION_KEY continue to work.
// Set ENCRYPTION_KEY in the environment to enable encryption.
//
// Ciphertext format:
//
//	v2 (new, 2026-04+): "enc:v2:" + base64(salt[16] || nonce || ct)
//	     key derivation: HKDF-SHA256(masterKey, salt=random16, info="starnion-aes-v2")
//	v1 (legacy):        "enc:"    + base64(nonce || ct)
//	     key derivation: SHA256(masterKey) — no salt, weaker against DB-leak attacks
//
// Decrypt recognises both versions so data encrypted by older binaries
// continues to open under the new build. Encrypt always writes v2.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"

	"golang.org/x/crypto/hkdf"
)

const (
	v2Prefix = "enc:v2:"
	v1Prefix = "enc:"
	v2Info   = "starnion-aes-v2"
	v2Salt   = 16
)

// Encrypt encrypts plaintext with AES-256-GCM.
// Returns a base64-encoded ciphertext prefixed with "enc:v2:".
// If masterKey is empty the original plaintext is returned unchanged.
func Encrypt(plaintext, masterKey string) (string, error) {
	if masterKey == "" || plaintext == "" {
		return plaintext, nil
	}
	// already encrypted (either v1 or v2)
	if len(plaintext) >= len(v1Prefix) && plaintext[:len(v1Prefix)] == v1Prefix {
		return plaintext, nil
	}

	salt := make([]byte, v2Salt)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", err
	}
	key, err := deriveKeyV2(masterKey, salt)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	// pack: salt || nonce || ciphertext
	buf := make([]byte, 0, len(salt)+len(nonce)+len(ciphertext))
	buf = append(buf, salt...)
	buf = append(buf, nonce...)
	buf = append(buf, ciphertext...)
	return v2Prefix + base64.StdEncoding.EncodeToString(buf), nil
}

// Decrypt decrypts a value produced by Encrypt. Values with no "enc:"
// prefix are returned unchanged for backward compatibility with rows
// stored before encryption was enabled.
func Decrypt(ciphertext, masterKey string) (string, error) {
	if masterKey == "" || ciphertext == "" {
		return ciphertext, nil
	}
	switch {
	case len(ciphertext) >= len(v2Prefix) && ciphertext[:len(v2Prefix)] == v2Prefix:
		return decryptV2(ciphertext[len(v2Prefix):], masterKey)
	case len(ciphertext) >= len(v1Prefix) && ciphertext[:len(v1Prefix)] == v1Prefix:
		return decryptV1(ciphertext[len(v1Prefix):], masterKey)
	default:
		// plaintext stored before encryption was enabled
		return ciphertext, nil
	}
}

// decryptV2 handles the new format: salt(16) || nonce || ciphertext.
func decryptV2(b64 string, masterKey string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	if len(data) < v2Salt+12 { // 12 = gcm nonce minimum
		return "", errors.New("ciphertext too short (v2)")
	}
	salt := data[:v2Salt]
	key, err := deriveKeyV2(masterKey, salt)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < v2Salt+gcm.NonceSize() {
		return "", errors.New("ciphertext too short (v2 nonce)")
	}
	nonce := data[v2Salt : v2Salt+gcm.NonceSize()]
	ct := data[v2Salt+gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// decryptV1 handles the legacy format: nonce || ciphertext.
func decryptV1(b64 string, masterKey string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	key := deriveKeyV1(masterKey)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short (v1)")
	}
	nonce, ct := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// deriveKeyV1 is the legacy SHA-256 derivation — still needed for
// decrypting rows written by older binaries. New data goes through v2.
func deriveKeyV1(masterKey string) []byte {
	h := sha256.Sum256([]byte(masterKey))
	return h[:]
}

// deriveKeyV2 runs HKDF-SHA256 over the master key with a per-record salt
// and a fixed info tag. The salt defeats precomputed rainbow tables and
// means two ciphertexts for the same plaintext use different keys.
func deriveKeyV2(masterKey string, salt []byte) ([]byte, error) {
	key := make([]byte, 32)
	r := hkdf.New(sha256.New, []byte(masterKey), salt, []byte(v2Info))
	if _, err := io.ReadFull(r, key); err != nil {
		return nil, err
	}
	return key, nil
}
