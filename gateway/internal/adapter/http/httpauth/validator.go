package httpauth

import (
	"github.com/go-playground/validator/v10"
)

// RequestValidator is a thin adapter over go-playground/validator
// that satisfies echo.Validator. Register it once on the Echo
// instance at bootstrap:
//
//	e := echo.New()
//	e.Validator = httpauth.NewRequestValidator()
//
// Handlers then call c.Validate(&req) after c.Bind(&req), which
// walks the `validate:` struct tags (required, email, min, max,
// oneof, …) and returns a non-nil error on the first violation.
// Without this, the validate: tags scattered through the handlers
// are silently dead code — the legacy code had hand-rolled checks
// downstream that frequently forgot to cover an added field.
type RequestValidator struct {
	v *validator.Validate
}

// NewRequestValidator builds a validator configured with the
// default field reflection settings. Safe to call once at
// bootstrap; the returned value is stateless beyond its struct
// tag cache and is safe for concurrent use.
func NewRequestValidator() *RequestValidator {
	return &RequestValidator{v: validator.New(validator.WithRequiredStructEnabled())}
}

// Validate walks the struct tags on `i` and returns the first
// violation as a plain error. Echo's Context.Validate wraps this
// so handlers get `return c.JSON(400, {error: err.Error()})`
// semantics without wiring a middleware.
func (rv *RequestValidator) Validate(i any) error {
	return rv.v.Struct(i)
}
