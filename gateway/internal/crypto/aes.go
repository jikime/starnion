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
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// Encrypt encrypts plaintext with AES-256-GCM using masterKey.
// Returns a base64-encoded ciphertext prefixed with "enc:".
// If masterKey is empty the original plaintext is returned unchanged.
func Encrypt(plaintext, masterKey string) (string, error) {
	if masterKey == "" || plaintext == "" {
		return plaintext, nil
	}
	// already encrypted
	if len(plaintext) > 4 && plaintext[:4] == "enc:" {
		return plaintext, nil
	}

	key := deriveKey(masterKey)
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
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return "enc:" + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a value produced by Encrypt.
// Values not prefixed with "enc:" are returned unchanged (backward-compat).
// If masterKey is empty the value is returned unchanged.
func Decrypt(ciphertext, masterKey string) (string, error) {
	if masterKey == "" || ciphertext == "" {
		return ciphertext, nil
	}
	if len(ciphertext) < 4 || ciphertext[:4] != "enc:" {
		// plaintext stored before encryption was enabled
		return ciphertext, nil
	}
	data, err := base64.StdEncoding.DecodeString(ciphertext[4:])
	if err != nil {
		return "", err
	}
	key := deriveKey(masterKey)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, data := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, data, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// deriveKey stretches masterKey to 32 bytes via SHA-256.
func deriveKey(masterKey string) []byte {
	h := sha256.Sum256([]byte(masterKey))
	return h[:]
}
