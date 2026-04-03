package handler

import "strings"

// parsePostgresArray converts a PostgreSQL array literal like {val1,val2} to []string.
func parsePostgresArray(s string) []string {
	if s == "" || s == "{}" {
		return []string{}
	}
	if len(s) >= 2 && s[0] == '{' && s[len(s)-1] == '}' {
		s = s[1 : len(s)-1]
	}
	if s == "" {
		return []string{}
	}
	return strings.Split(s, ",")
}
