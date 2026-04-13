// Package mimeutil holds small MIME/filename helpers that more
// than one HTTP sub-package needs. It exists only to stop the
// same function (DetectFileType) from being copy-pasted into two
// peer adapter packages, since the files and agentchat slices
// must not import each other.
package mimeutil

import (
	"path/filepath"
	"strings"
)

// DetectFileType classifies an uploaded file into one of the
// three canonical gateway types: "document" | "image" | "audio".
// The MIME type is authoritative; the filename extension is a
// fallback for the common case where a browser mislabels an
// audio upload as application/octet-stream.
func DetectFileType(mimeType, filename string) string {
	m := strings.ToLower(mimeType)
	if strings.HasPrefix(m, "image/") {
		return "image"
	}
	if strings.HasPrefix(m, "audio/") || strings.HasPrefix(m, "video/") {
		return "audio"
	}
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filename), "."))
	switch ext {
	case "mp3", "wav", "ogg", "m4a", "webm", "flac", "aac":
		return "audio"
	case "jpg", "jpeg", "png", "gif", "webp", "svg":
		return "image"
	}
	return "document"
}
