package handler

import (
	"bytes"
	"math"

	goexif "github.com/rwcarlsen/goexif/exif"
)

// extractImageMetadata extracts EXIF metadata from image bytes.
// Returns an empty map if no EXIF data is found (never errors out).
func extractImageMetadata(data []byte) map[string]any {
	meta := make(map[string]any)

	x, err := goexif.Decode(bytes.NewReader(data))
	if err != nil {
		return meta
	}

	// GPS coordinates
	lat, lon, err := x.LatLong()
	if err == nil && !math.IsNaN(lat) && !math.IsNaN(lon) {
		meta["latitude"] = math.Round(lat*1e6) / 1e6
		meta["longitude"] = math.Round(lon*1e6) / 1e6
	}

	// Date taken
	if tm, err := x.DateTime(); err == nil {
		meta["date_taken"] = tm.Format("2006-01-02T15:04:05")
	}

	// Camera info
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
