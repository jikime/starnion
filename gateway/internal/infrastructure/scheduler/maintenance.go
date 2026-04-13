package scheduler

import (
	"context"
	"strings"
	"time"

	"go.uber.org/zap"
)

// ── Maintenance ───────────────────────────────────────────────────────────────

// runMaintenance runs background DB cleanup tasks with no user-visible notification.
func (s *Scheduler) runMaintenance(ctx context.Context, jobID, userID string) {
	switch jobID {
	case "memory_compaction":
		res, err := s.db.Pool().Exec(ctx,
			`DELETE FROM knowledge_base
			 WHERE user_id = $1::uuid
			   AND key NOT LIKE 'schedule:%'
			   AND created_at < NOW() - INTERVAL '90 days'`,
			userID,
		)
		if err != nil {
			s.logger.Error("maintenance: memory_compaction failed",
				zap.String("user_id", userID), zap.Error(err))
			return
		}
		n := res.RowsAffected()
		if n > 0 {
			s.logger.Info("maintenance: memory_compaction done",
				zap.String("user_id", userID),
				zap.Int64("deleted_rows", n))
		}
	}
}

func matchDayOfWeek(dayName string, t time.Time) bool {
	switch strings.ToLower(dayName) {
	case "sunday":
		return t.Weekday() == time.Sunday
	case "monday":
		return t.Weekday() == time.Monday
	case "tuesday":
		return t.Weekday() == time.Tuesday
	case "wednesday":
		return t.Weekday() == time.Wednesday
	case "thursday":
		return t.Weekday() == time.Thursday
	case "friday":
		return t.Weekday() == time.Friday
	case "saturday":
		return t.Weekday() == time.Saturday
	case "weekday":
		wd := t.Weekday()
		return wd >= time.Monday && wd <= time.Friday
	case "weekend":
		wd := t.Weekday()
		return wd == time.Saturday || wd == time.Sunday
	default:
		return true // unknown value: always match (backward compat)
	}
}
