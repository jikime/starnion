package entity

import "time"

// Image is one row in the `images` table. Prompt and Analysis are
// optional — the repository returns empty strings when NULL.
type Image struct {
	ID        int64
	URL       string
	Name      string
	MIME      string
	Size      int64
	Source    string
	Type      string
	Prompt    string
	Analysis  string
	CreatedAt time.Time
}

// Audio is one row in the `audios` table.
type Audio struct {
	ID         int64
	URL        string
	Name       string
	MIME       string
	Size       int64
	Duration   int
	Source     string
	Type       string
	Transcript string
	CreatedAt  time.Time
}

// ImageCreate is the write shape for inserting an image row.
// Source/Type are "upload" for user uploads and "browser"/"screenshot"
// for agent screenshots.
type ImageCreate struct {
	URL    string
	Name   string
	MIME   string
	Size   int64
	Source string
	Type   string
}

// AudioCreate is the write shape for inserting an audio row.
type AudioCreate struct {
	URL      string
	Name     string
	MIME     string
	Size     int64
	Duration int
	Source   string
	Type     string
}
