package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// ConnectionRepository is the persistence port for the Connect aggregate.
// Every method is tenant-scoped — the repo always adds `WHERE user_id = $N`
// to block cross-tenant reads and writes (BR-AUTH-1).
//
// The port is intentionally narrow: complex business logic like
// merge-patch and score recomputation lives in the usecase layer, which
// calls GetByID → mutate → Update.
type ConnectionRepository interface {
	// Create inserts a new connection row. The caller must have set
	// ID, UserID, Category (validated), and Name. Tags and SocialProfiles
	// may be nil — the repo persists `{}` for the JSONB and `{}` for the
	// text array in that case.
	Create(ctx context.Context, c *entity.Connection) error

	// GetByID returns the connection identified by (userID, id). Returns
	// domain.ErrNotFound when the row is missing or owned by another user.
	GetByID(ctx context.Context, userID, id uuid.UUID) (entity.Connection, error)

	// List returns the filtered, paginated view of the caller's
	// connections plus the unfiltered `total` count for the same filter
	// (so the UI can render "N / total"). Items is never nil on success.
	List(ctx context.Context, userID uuid.UUID, filter entity.ConnectionListFilter) (entity.ConnectionListResult, error)

	// Update replaces every column of the connection row with the
	// supplied entity, still scoped by user_id. The caller is expected
	// to have merged any partial PATCH into a full entity first.
	// Returns domain.ErrNotFound when the row is missing.
	Update(ctx context.Context, c *entity.Connection) error

	// Delete removes the connection row (cascades to connection_activities
	// via FK). Returns domain.ErrNotFound when the row is missing.
	Delete(ctx context.Context, userID, id uuid.UUID) error

	// Touch records a manual contact event (UC-109):
	//   1. Inserts one row into connection_activities with kind='manual'.
	//   2. Advances connections.last_contact_at to GREATEST(stored, occurredAt).
	// Both operations run in a single transaction. Returns the updated
	// connection so the handler can echo it back without a second GET.
	// Monotonic semantics (BR-109-1) are enforced at the SQL layer.
	Touch(ctx context.Context, userID, id uuid.UUID, occurredAt time.Time, note string, durationMin int) (entity.Connection, error)
}
