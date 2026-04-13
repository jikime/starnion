// Package domain holds entity types, repository interfaces, and error sentinels
// that make up the business-rule core of the gateway. Code in this package must
// not import any infrastructure (database drivers, HTTP framework, gRPC, etc.)
// so that the business rules remain testable in isolation.
package domain

import "errors"

// ErrNotFound is returned by repositories when a lookup finds no matching
// row. Use errors.Is(err, domain.ErrNotFound) to detect it at the usecase
// layer and translate to the appropriate HTTP status at the adapter layer.
var ErrNotFound = errors.New("domain: resource not found")

// ErrConflict signals a constraint violation (duplicate key, unique index,
// etc.) that callers should surface as HTTP 409.
var ErrConflict = errors.New("domain: resource conflict")

// ErrInvalidArgument marks a usecase input that fails validation. The
// handler layer should map it to HTTP 400.
var ErrInvalidArgument = errors.New("domain: invalid argument")

// ErrUnavailable signals that a downstream dependency the usecase
// needs is not wired (e.g. scheduler not running). Handler layer
// maps it to HTTP 503.
var ErrUnavailable = errors.New("domain: service unavailable")
