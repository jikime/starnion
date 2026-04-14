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

	// ListActivities returns the paginated activity timeline for a single
	// connection (UC-111), DESC by occurred_at. Total is the unfiltered
	// count for the same (user, connection) pair.
	ListActivities(ctx context.Context, userID, connID uuid.UUID, limit, offset int) (entity.ActivityListResult, error)

	// CreateActivity inserts one row into connection_activities and, when
	// kind='manual' and occurred_at is newer than the stored
	// last_contact_at, bumps the parent connection's last_contact_at
	// (monotonic, same rule as Touch). Returns the new row with its
	// assigned ID and server-side created_at. UC-112.
	CreateActivity(ctx context.Context, userID, connID uuid.UUID, in entity.ActivityInput) (entity.ConnectionActivity, error)

	// DeleteActivity removes one activity row owned by the caller. UC-113.
	// Returns domain.ErrNotFound when the row is missing or belongs to
	// another user.
	DeleteActivity(ctx context.Context, userID uuid.UUID, activityID int64) error

	// IngestActivities bulk-inserts a batch of activity rows for Phase 2
	// automation (UC-201, called from the scheduler or the connect-activity
	// skill via an internal call site). Each row uses
	// `ON CONFLICT (connection_id, kind, occurred_at) DO NOTHING` so
	// re-ingestion is safe. Returns the number of rows actually inserted.
	//
	// The connection_id on each input MUST already be resolved to a row
	// owned by userID — the repo does not do name resolution here.
	IngestActivities(ctx context.Context, userID uuid.UUID, batch []entity.ActivityInput, connIDs []uuid.UUID) (int, error)

	// CountRecentActivities returns (count, sum_weight) for a single
	// connection over the [since, NOW()] window. Used by the score
	// recompute cron (UC-202). Safe to call with zero rows (returns
	// 0, 0, nil).
	CountRecentActivities(ctx context.Context, userID, connID uuid.UUID, since time.Time) (int, float64, error)

	// UpdateConnectionScore persists a freshly-computed score. Scoped by
	// user_id. Cron-only — the write path for /touch and /activities
	// must not call this (score stays stale until the next 03:00 tick,
	// which is the intended design from architecture-design.md §D).
	UpdateConnectionScore(ctx context.Context, userID, connID uuid.UUID, score float64) error

	// ListAllForUser returns every connection id + email + name owned by
	// userID, for the Gmail/Calendar ingestor to match against. No
	// pagination — a user with 10k connections is a theoretical edge
	// case the cron iterator can handle in memory.
	ListAllForUser(ctx context.Context, userID uuid.UUID) ([]entity.Connection, error)

	// ListDriftingConnections returns connections whose
	// last_contact_at + contact_frequency_target days < NOW(), ordered
	// by days-overdue descending. Connections that have never been
	// contacted (last_contact_at IS NULL) ARE included if
	// created_at + contact_frequency_target days < NOW(). UC-204.
	ListDriftingConnections(ctx context.Context, userID uuid.UUID) ([]entity.DriftingConnection, error)
}
