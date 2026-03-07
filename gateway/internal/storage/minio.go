package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog/log"
)

// publicReadPolicy is the S3-compatible policy that allows anonymous GET on all objects.
func publicReadPolicy(bucket string) string {
	return `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::` + bucket + `/*"]}]}`
}

// FileAttachment holds metadata for an uploaded file.
type FileAttachment struct {
	Name string `json:"name"`
	Mime string `json:"mime"`
	URL  string `json:"url"`
	Size int64  `json:"size"` // bytes
}

// MinIO wraps a minio client with bucket and public URL configuration.
type MinIO struct {
	client    *minio.Client
	bucket    string
	publicURL string // browser-accessible base URL (e.g. http://localhost:9000)
}

// NewMinIO initialises a MinIO client from the provided configuration.
func NewMinIO(endpoint, accessKey, secretKey, bucket, publicURL string, useSSL bool) (*MinIO, error) {
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	if bucket == "" {
		bucket = "starnion-files"
	}
	if publicURL == "" {
		publicURL = "http://localhost:9000"
	}
	publicURL = strings.TrimRight(publicURL, "/")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio: new client: %w", err)
	}

	// Ensure bucket exists with public-read policy.
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("minio: check bucket: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("minio: create bucket %s: %w", bucket, err)
		}
		log.Info().Str("bucket", bucket).Msg("minio: bucket created")
	}
	// Apply public-read policy so browsers can load files directly.
	if err := client.SetBucketPolicy(ctx, bucket, publicReadPolicy(bucket)); err != nil {
		log.Warn().Err(err).Str("bucket", bucket).Msg("minio: failed to set public-read policy (images may require auth)")
	}

	log.Info().Str("endpoint", endpoint).Str("bucket", bucket).Str("public_url", publicURL).Msg("minio client initialised")
	return &MinIO{client: client, bucket: bucket, publicURL: publicURL}, nil
}

// Upload stores data in MinIO and returns the public URL.
// Non-image files are stored with Content-Disposition: attachment so browsers
// download them with the original filename instead of the UUID-based object key.
func (m *MinIO) Upload(ctx context.Context, name, contentType string, data []byte) (FileAttachment, error) {
	objectName := uniqueName(name)

	opts := minio.PutObjectOptions{ContentType: contentType}
	if !strings.HasPrefix(contentType, "image/") {
		opts.ContentDisposition = fmt.Sprintf(`attachment; filename="%s"`, name)
	}

	_, err := m.client.PutObject(ctx, m.bucket, objectName, bytes.NewReader(data), int64(len(data)), opts)
	if err != nil {
		return FileAttachment{}, fmt.Errorf("minio: upload %s: %w", objectName, err)
	}

	url := fmt.Sprintf("%s/%s/%s", m.publicURL, m.bucket, objectName)
	return FileAttachment{Name: name, Mime: contentType, URL: url, Size: int64(len(data))}, nil
}

// uniqueName generates a collision-resistant object key in the form <uuid>/<original>
// so that the last path segment is always the human-readable filename.
// Example: "a3f8c1d2e5b6a7f0/vibe-coding.docx"
func uniqueName(original string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b) + "/" + original
}

