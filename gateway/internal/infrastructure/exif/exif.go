// Package exif extracts EXIF metadata from image bytes. It is a
// thin wrapper around github.com/rwcarlsen/goexif so the files CA
// slice and the telegram slice can share one implementation instead
// of each duplicating the extraction logic.
package exif

import (
	"bytes"
	"math"

	goexif "github.com/rwcarlsen/goexif/exif"
)

// ExtractImageMetadata parses EXIF tags from image bytes and
// returns a flat map. Missing EXIF blocks return an empty map
// rather than an error — callers that don't have image data (or
// have images with no EXIF, like screenshots) should be able to
// treat the return value as "no extra metadata".
func ExtractImageMetadata(data []byte) map[string]any {
	meta := make(map[string]any)

	x, err := goexif.Decode(bytes.NewReader(data))
	if err != nil {
		return meta
	}

	// GPS coordinates — rounded to 6 decimals (~11 cm precision).
	lat, lon, err := x.LatLong()
	if err == nil && !math.IsNaN(lat) && !math.IsNaN(lon) {
		meta["latitude"] = math.Round(lat*1e6) / 1e6
		meta["longitude"] = math.Round(lon*1e6) / 1e6
	}

	// Date taken (when the shutter fired).
	if tm, err := x.DateTime(); err == nil {
		meta["date_taken"] = tm.Format("2006-01-02T15:04:05")
	}

	// Camera make/model.
	if tag, err := x.Get(goexif.Make); err == nil {
		if v, err := tag.StringVal(); err == nil {
			meta["camera_make"] = v
		}
	}
	if tag, err := x.Get(goexif.Model); err == nil {
		if v, err := tag.StringVal(); err == nil {
			meta["camera_model"] = v
		}
	}

	return meta
}
