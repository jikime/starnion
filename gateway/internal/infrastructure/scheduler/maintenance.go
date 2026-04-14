package scheduler

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
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

	case "connect_activity_ingest":
		// Phase 2 Gmail/Calendar ingest. Skipped silently when the
		// ingestor isn't wired (test/isolated environments).
		if s.connectIngester == nil {
			return
		}
		uid, err := uuid.Parse(userID)
		if err != nil {
			s.logger.Warn("maintenance: connect_activity_ingest bad user_id",
				zap.String("user_id", userID), zap.Error(err))
			return
		}
		inserted, err := s.connectIngester.RunForUser(ctx, uid)
		if err != nil {
			s.logger.Error("maintenance: connect_activity_ingest failed",
				zap.String("user_id", userID), zap.Error(err))
			return
		}
		if inserted > 0 {
			s.logger.Info("maintenance: connect_activity_ingest done",
				zap.String("user_id", userID),
				zap.Int("inserted", inserted))
		}

	case "connect_score_recompute":
		// Phase 2 nightly score recompute (UC-202). The connect
		// usecase's RecomputeScoresForUser walks every connection
		// and persists only those whose score visibly moved.
		if s.connectScorer == nil {
			return
		}
		uid, err := uuid.Parse(userID)
		if err != nil {
			s.logger.Warn("maintenance: connect_score_recompute bad user_id",
				zap.String("user_id", userID), zap.Error(err))
			return
		}
		changed, err := s.connectScorer.RecomputeScoresForUser(ctx, uid)
		if err != nil {
			s.logger.Error("maintenance: connect_score_recompute failed",
				zap.String("user_id", userID), zap.Error(err))
			return
		}
		if changed > 0 {
			s.logger.Info("maintenance: connect_score_recompute done",
				zap.String("user_id", userID),
				zap.Int("scores_adjusted", changed))
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
