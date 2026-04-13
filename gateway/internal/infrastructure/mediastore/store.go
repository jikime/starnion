// Package mediastore wraps the MinIO client with a local-filesystem
// fallback so the handler layer does not have to branch between the
// two paths on every put/get. It was extracted from
// handler/media.go as part of the media CA slice migration.
//
// Usage:
//
//	store := mediastore.New(cfg, logger) // safe when MinIO is unreachable
//	url, err := store.Put(ctx, objectKey, reader, size, contentType)
//	body, ct, err := store.Get(ctx, objectKey)
package mediastore

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/newstarnion/gateway/config"
	"go.uber.org/zap"
)

// Store presents a small put/get/url API that hides whether the
// backing store is MinIO or the local filesystem under
// $SESSION_DIR/uploads. When `minio` is nil the store falls back to
// the filesystem.
type Store struct {
	cfg    *config.Config
	logger *zap.Logger
	minio  *minio.Client
}

// New builds a Store. When MinIO credentials are configured it tries
// to connect and ensures the bucket exists; otherwise it returns a
// filesystem-only store. Connection failure is logged and degrades
// to filesystem mode (preserves legacy behaviour).
func New(cfg *config.Config, logger *zap.Logger) *Store {
	s := &Store{cfg: cfg, logger: logger}
	if cfg.MinioAccessKey == "" {
		return s
	}
	client, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: cfg.MinioUseSSL,
	})
	if err != nil {
		logger.Warn("failed to init MinIO client", zap.Error(err))
		return s
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	exists, _ := client.BucketExists(ctx, cfg.MinioBucket)
	if !exists {
		if mkErr := client.MakeBucket(ctx, cfg.MinioBucket, minio.MakeBucketOptions{}); mkErr != nil {
			logger.Warn("failed to create MinIO bucket",
				zap.String("bucket", cfg.MinioBucket), zap.Error(mkErr))
		}
	}
	s.minio = client
	return s
}

// Enabled reports whether the store is backed by MinIO. The handler
// layer uses this to decide whether to generate signed URLs or
// public ones.
func (s *Store) Enabled() bool { return s.minio != nil }

// PublicURL returns the absolute URL for an object when a MinIO
// public base URL is configured, or the gateway-proxied
// /api/files/<key> path otherwise. Does NOT verify the object
// exists — callers are expected to have just stored it.
func (s *Store) PublicURL(objectKey string) string {
	if s.minio != nil && s.cfg.MinioPublicURL != "" {
		return s.cfg.MinioPublicURL + "/" + s.cfg.MinioBucket + "/" + objectKey
	}
	return "/api/files/" + objectKey
}

// ProxyURL always returns the gateway-proxied path, regardless of
// whether a public MinIO URL is available. Used for screenshot
// uploads so the agent always hits the gateway.
func (s *Store) ProxyURL(objectKey string) string {
	return "/api/files/" + objectKey
}

// Put uploads an object to MinIO, or writes it to the local uploads
// directory when MinIO is not configured. Returns the caller-facing
// URL (public or gateway-proxied).
func (s *Store) Put(ctx context.Context, objectKey string, r io.Reader, size int64, contentType string) (string, error) {
	if s.minio != nil {
		_, err := s.minio.PutObject(ctx, s.cfg.MinioBucket, objectKey, r, size,
			minio.PutObjectOptions{ContentType: contentType})
		if err != nil {
			return "", fmt.Errorf("minio put %s: %w", objectKey, err)
		}
		return s.PublicURL(objectKey), nil
	}

	dir := filepath.Join(s.cfg.SessionDir, "uploads", filepath.Dir(objectKey))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("local mkdir %s: %w", dir, err)
	}
	path := filepath.Join(s.cfg.SessionDir, "uploads", objectKey)
	dst, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("local create %s: %w", path, err)
	}
	defer dst.Close()
	if _, err := io.Copy(dst, r); err != nil {
		return "", fmt.Errorf("local write %s: %w", path, err)
	}
	return "/api/files/" + objectKey, nil
}

// PutBytes is a convenience wrapper for callers that already have
// the object payload in memory (e.g. base64-decoded screenshots).
func (s *Store) PutBytes(ctx context.Context, objectKey string, data []byte, contentType string) (string, error) {
	return s.Put(ctx, objectKey, bytesReader(data), int64(len(data)), contentType)
}

// ObjectReader is the narrow interface the handler sees when
// streaming a file out: body + content type. The implementation is
// either an *minio.Object or an *os.File wrapped in a struct.
type ObjectReader struct {
	Body        io.ReadCloser
	ContentType string
}

// Get opens an object from MinIO or the local filesystem. Returns
// (nil, ErrNotFound) semantics via a plain error — callers use
// `err != nil` branching; they don't need to distinguish "not
// found" from "storage error" because both map to a 404 in the
// HTTP adapter.
func (s *Store) Get(ctx context.Context, objectKey string) (*ObjectReader, error) {
	if s.minio != nil {
		obj, err := s.minio.GetObject(ctx, s.cfg.MinioBucket, objectKey, minio.GetObjectOptions{})
		if err != nil {
			return nil, fmt.Errorf("minio get %s: %w", objectKey, err)
		}
		info, err := obj.Stat()
		if err != nil {
			obj.Close()
			return nil, fmt.Errorf("minio stat %s: %w", objectKey, err)
		}
		return &ObjectReader{Body: obj, ContentType: info.ContentType}, nil
	}

	path := filepath.Join(s.cfg.SessionDir, "uploads", filepath.Clean("/"+objectKey))
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("local open %s: %w", path, err)
	}
	return &ObjectReader{Body: f, ContentType: ""}, nil
}

// Delete removes an object from MinIO or from the local uploads
// directory. Errors are returned so callers can log them — the
// files/media handlers call this best-effort after a DB delete.
func (s *Store) Delete(ctx context.Context, objectKey string) error {
	if s.minio != nil {
		if err := s.minio.RemoveObject(ctx, s.cfg.MinioBucket, objectKey, minio.RemoveObjectOptions{}); err != nil {
			return fmt.Errorf("minio remove %s: %w", objectKey, err)
		}
		return nil
	}
	path := filepath.Join(s.cfg.SessionDir, "uploads", objectKey)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("local remove %s: %w", path, err)
	}
	return nil
}

// ServeFilePath returns the absolute local file path for an object
// when the store is running in filesystem mode. The HTTP adapter
// uses this to call echo.Context.File for correct Content-Type
// detection. Returns "" when backed by MinIO — the caller should
// use Get in that case.
func (s *Store) ServeFilePath(objectKey string) string {
	if s.minio != nil {
		return ""
	}
	return filepath.Join(s.cfg.SessionDir, "uploads", filepath.Clean("/"+objectKey))
}

// bytesReader is a tiny helper to avoid importing bytes at the
// call site for the PutBytes convenience wrapper.
func bytesReader(b []byte) io.Reader { return &byteReaderImpl{b: b} }

type byteReaderImpl struct {
	b []byte
	i int
}

func (r *byteReaderImpl) Read(p []byte) (int, error) {
	if r.i >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += n
	return n, nil
}
