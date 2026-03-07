package cli

import (
	"bytes"
	"fmt"
	"io"
)

// prefixWriter wraps an io.Writer and prepends a colored prefix to each line.
type prefixWriter struct {
	w      io.Writer
	prefix string
	buf    []byte
}

func newPrefixWriter(w io.Writer, prefix string) io.Writer {
	return &prefixWriter{w: w, prefix: prefix + " "}
}

func (pw *prefixWriter) Write(p []byte) (n int, err error) {
	pw.buf = append(pw.buf, p...)
	for {
		idx := bytes.IndexByte(pw.buf, '\n')
		if idx < 0 {
			break
		}
		line := pw.buf[:idx+1]
		if _, err := fmt.Fprintf(pw.w, "%s%s", pw.prefix, line); err != nil {
			return 0, err
		}
		pw.buf = pw.buf[idx+1:]
	}
	return len(p), nil
}
