// Package port holds interface-level ports that decouple the gateway's
// adapter layer from its infrastructure. Types here are stable contracts:
// the handler package depends on `port.ScheduleWaker`, and the scheduler
// implementation in internal/infrastructure/scheduler/ provides the
// concrete implementation.
//
// Putting these interfaces in a neutral package fixes the inverted DIP
// relationship that used to exist — previously `handler/cron.go` owned
// the `ScheduleWaker`/`JobTriggerer` interfaces and
// internal/infrastructure/scheduler imported nothing that defined them,
// which meant the "outer" handler layer was the abstraction owner and
// the "inner" infra layer implemented it. Moving them here lets both
// sides depend on a shared neutral contract without a circular import.
package port

import "context"

// ScheduleWaker signals the scheduler to re-arm its event-driven timer.
// Implemented by `*scheduler.Scheduler`; may be nil before the scheduler
// starts.
type ScheduleWaker interface {
	Wake()
}

// JobTriggerer forces a single builtin job to fire immediately for a
// given user. Implemented by `*scheduler.Scheduler`.
type JobTriggerer interface {
	TriggerJob(ctx context.Context, jobID, userID string) (msg string, sent bool, err error)
}
