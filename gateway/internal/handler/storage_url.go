package handler

import "strings"

// minioToProxyURL converts a direct MinIO URL (http://host:9000/bucket/uuid/file)
// to a gateway proxy path (/api/v1/files/uuid/file).
// URLs that are already relative or already use the proxy prefix are returned unchanged.
// This lets List handlers serve both legacy DB records (direct MinIO URLs) and
// new records (proxy paths) transparently.
func minioToProxyURL(rawURL string) string {
	if !strings.Contains(rawURL, "://") {
		return rawURL // already relative / proxy URL
	}

	// Strip scheme://host to get the path.
	afterScheme := rawURL
	if idx := strings.Index(rawURL, "://"); idx >= 0 {
		afterScheme = rawURL[idx+3:]
	}
	pathStart := strings.IndexByte(afterScheme, '/')
	if pathStart < 0 {
		return rawURL
	}
	path := afterScheme[pathStart:] // /<bucket>/<objectKey>

	// Remove leading slash and the first segment (bucket name).
	trimmed := strings.TrimPrefix(path, "/")
	bucketEnd := strings.IndexByte(trimmed, '/')
	if bucketEnd < 0 {
		return rawURL
	}
	objectKey := trimmed[bucketEnd+1:] // <uuid>/<filename>
	if objectKey == "" {
		return rawURL
	}
	return "/api/v1/files/" + objectKey
}
