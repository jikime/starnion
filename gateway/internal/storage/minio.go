package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog/log"
)

// FileAttachment holds metadata for an uploaded file.
type FileAttachment struct {
	Name string `json:"name"`
	Mime string `json:"mime"`
	URL  string `json:"url"`
}

// MinIO wraps a minio client with bucket and public URL configuration.
type MinIO struct {
	client    *minio.Client
	bucket    string
	publicURL string // browser-accessible base URL (e.g. http://localhost:9000)
}

// NewMinIO initialises a MinIO client from environment variables.
//
//	MINIO_ENDPOINT   internal host:port  (default: localhost:9000)
//	MINIO_ACCESS_KEY access key
//	MINIO_SECRET_KEY secret key
//	MINIO_BUCKET     bucket name         (default: jiki-files)
//	MINIO_PUBLIC_URL browser-facing URL  (default: http://localhost:9000)
func NewMinIO() (*MinIO, error) {
	endpoint := envOr("MINIO_ENDPOINT", "localhost:9000")
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	bucket := envOr("MINIO_BUCKET", "jiki-files")
	publicURL := strings.TrimRight(envOr("MINIO_PUBLIC_URL", "http://localhost:9000"), "/")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("minio: new client: %w", err)
	}

	log.Info().Str("endpoint", endpoint).Str("bucket", bucket).Msg("minio client initialised")
	return &MinIO{client: client, bucket: bucket, publicURL: publicURL}, nil
}

// Upload stores data in MinIO and returns the public URL.
func (m *MinIO) Upload(ctx context.Context, name, contentType string, data []byte) (FileAttachment, error) {
	objectName := uniqueName(name)

	_, err := m.client.PutObject(ctx, m.bucket, objectName, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType},
	)
	if err != nil {
		return FileAttachment{}, fmt.Errorf("minio: upload %s: %w", objectName, err)
	}

	url := fmt.Sprintf("%s/%s/%s", m.publicURL, m.bucket, objectName)
	return FileAttachment{Name: name, Mime: contentType, URL: url}, nil
}

// uniqueName generates a collision-resistant object name preserving the original extension.
func uniqueName(original string) string {
	ext := filepath.Ext(original)
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b) + ext
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
