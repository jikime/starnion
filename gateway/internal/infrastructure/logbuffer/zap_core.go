package logbuffer

import (
	"fmt"
	"strings"

	"go.uber.org/zap/zapcore"
)

// ZapCore is a zapcore.Core that writes gateway log entries into the Hub.
type ZapCore struct {
	hub    *Hub
	fields []zapcore.Field
	level  zapcore.LevelEnabler
}

// NewZapCore returns a core that captures INFO and above.
func NewZapCore(hub *Hub) *ZapCore {
	return &ZapCore{hub: hub, level: zapcore.InfoLevel}
}

func (c *ZapCore) Enabled(l zapcore.Level) bool { return c.level.Enabled(l) }

func (c *ZapCore) With(fields []zapcore.Field) zapcore.Core {
	return &ZapCore{
		hub:    c.hub,
		fields: append(append([]zapcore.Field{}, c.fields...), fields...),
		level:  c.level,
	}
}

func (c *ZapCore) Check(entry zapcore.Entry, ce *zapcore.CheckedEntry) *zapcore.CheckedEntry {
	if c.Enabled(entry.Level) {
		return ce.AddCore(entry, c)
	}
	return ce
}

func (c *ZapCore) Write(entry zapcore.Entry, fields []zapcore.Field) error {
	all := append(c.fields, fields...) //nolint:gocritic
	suffix := fieldsSuffix(all)
	msg := entry.Message
	if suffix != "" {
		msg += "  " + suffix
	}
	c.hub.Write(Entry{
		Time:    entry.Time,
		Level:   entry.Level.String(),
		Message: msg,
		Source:  "gateway",
	})
	return nil
}

func (c *ZapCore) Sync() error { return nil }

// fieldsSuffix encodes zap fields to a compact key=value string.
func fieldsSuffix(fields []zapcore.Field) string {
	if len(fields) == 0 {
		return ""
	}
	enc := zapcore.NewMapObjectEncoder()
	for _, f := range fields {
		f.AddTo(enc)
	}
	parts := make([]string, 0, len(enc.Fields))
	for k, v := range enc.Fields {
		parts = append(parts, fmt.Sprintf("%s=%v", k, v))
	}
	return strings.Join(parts, " ")
}
