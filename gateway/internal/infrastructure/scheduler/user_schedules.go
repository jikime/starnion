package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"go.uber.org/zap"
)

// ── User Schedules ────────────────────────────────────────────────────────────

// computeNextFireAt returns the next UTC time at which entry should fire, after `after`.
// Returns zero time if the schedule is expired, paused, or otherwise unschedulable.
func computeNextFireAt(entry scheduleEntry, userTZ string, after time.Time) time.Time {
	loc, err := time.LoadLocation(userTZ)
	if err != nil {
		loc = time.UTC
	}

	localAfter := after.In(loc)

	// One-time: specific date + hour + minute
	if entry.Schedule.Date != "" {
		s := fmt.Sprintf("%s %02d:%02d", entry.Schedule.Date, entry.Schedule.Hour, entry.Schedule.Minute)
		t, err := time.ParseInLocation("2006-01-02 15:04", s, loc)
		if err != nil || !t.After(after) {
			return time.Time{} // already past or invalid
		}
		return t.UTC()
	}

	// Recurring: next occurrence of Hour:Minute (+ optional day_of_week)
	candidate := time.Date(
		localAfter.Year(), localAfter.Month(), localAfter.Day(),
		entry.Schedule.Hour, entry.Schedule.Minute, 0, 0, loc,
	)
	// If this minute has already passed today, start from tomorrow
	if !candidate.After(after) {
		candidate = candidate.AddDate(0, 0, 1)
	}
	// Advance day until day_of_week matches (at most 7 days)
	if entry.Schedule.DayOfWeek != "" {
		for i := 0; i < 7; i++ {
			if matchDayOfWeek(entry.Schedule.DayOfWeek, candidate) {
				break
			}
			candidate = candidate.AddDate(0, 0, 1)
		}
	}
	return candidate.UTC()
}

// runAndArmUserSchedules executes all due user schedules and returns the next UTC
// fire time across all active schedules (used to arm the event-driven timer).
//
// The per-tick cost used to be O(N) in the count of ALL active schedules —
// every tick materialised every row just to locate the handful that had
// fired and to recompute the min next_fire_at. The scan now runs in two
// narrow queries:
//
//  1. "due" query — returns only rows whose `next_fire_at` is missing
//     (first run / migration) or already in the past. This is the
//     set the Go loop has to touch.
//  2. "min future" query — returns `MIN(next_fire_at)` across the
//     rows that aren't due yet, used to arm the event-driven timer
//     so we sleep exactly until the next fire.
//
// Only the due query runs through pending materialisation + goroutine
// fan-out. A fleet with 1000 schedules and 5 due per tick touches
// 5 rows in Go instead of 1000.
func (s *Scheduler) runAndArmUserSchedules(ctx context.Context) time.Time {
	now := time.Now().UTC()
	nowEpoch := now.Unix()
	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// "Due" query: status='active' AND (next_fire_at missing OR in the past).
	//
	// knowledge_base.value is a generic TEXT column that stores arbitrary
	// user data (memory chunks, notes, …) alongside the JSON blobs the
	// scheduler writes under the `schedule:<id>` key space. We therefore:
	//
	//   1. Wrap the scan in a `WITH … AS MATERIALIZED` CTE whose WHERE
	//      clause restricts to schedule rows ONLY. The MATERIALIZED hint
	//      tells PG 12+ to treat the CTE as an optimisation fence, so
	//      the cast below NEVER runs on non-JSON rows.
	//
	//   2. Cast `value::jsonb` inside the CTE so the outer WHERE /
	//      SELECT can use `->>` to project JSONB fields. A plain `text
	//      ->> 'key'` expression fails with SQLSTATE 42883 because `->>`
	//      is only defined for json / jsonb.
	//
	// Status is pushed into the outer WHERE so paused rows never cross
	// the wire, and the epoch filter narrows the result set to schedules
	// the Go loop actually has to touch this tick.
	rows, err := s.db.Pool().Query(queryCtx,
		`WITH schedule_rows AS MATERIALIZED (
		     SELECT kb.user_id::text AS user_id,
		            kb.id             AS kb_id,
		            kb.key            AS kb_key,
		            kb.value::jsonb   AS kb_value,
		            COALESCE(u.preferences->>'timezone', 'Asia/Seoul') AS user_timezone
		     FROM knowledge_base kb
		     JOIN users u ON u.id = kb.user_id::uuid
		     WHERE kb.key LIKE 'schedule:%'
		       AND u.is_active = TRUE
		 )
		 SELECT user_id, kb_id, kb_key, kb_value::text, user_timezone
		 FROM schedule_rows
		 WHERE (kb_value->>'status') = 'active'
		   AND (
		         (kb_value->>'next_fire_at') IS NULL
		         OR (kb_value->>'next_fire_at')::bigint <= $1
		       )`,
		nowEpoch,
	)
	if err != nil {
		s.logger.Error("scheduler: user schedule query failed", zap.Error(err))
		return time.Time{}
	}

	// Materialise due rows first so pgxpool can reuse the connection
	// for the subsequent UPDATE/MIN queries instead of holding the
	// read cursor open while we write.
	type pendingEntry struct {
		userID, key, value, tz string
		kbID                   int64
	}
	var pending []pendingEntry
	for rows.Next() {
		var p pendingEntry
		if err := rows.Scan(&p.userID, &p.kbID, &p.key, &p.value, &p.tz); err != nil {
			continue
		}
		pending = append(pending, p)
	}
	if err := rows.Err(); err != nil {
		s.logger.Warn("scheduler: user schedule row iteration error", zap.Error(err))
	}
	rows.Close()

	var nextFireAt time.Time
	var toFire []pendingEntry
	var toUpdate []struct {
		kbID  int64
		entry scheduleEntry
	}

	for _, p := range pending {
		var entry scheduleEntry
		if json.Unmarshal([]byte(p.value), &entry) != nil {
			continue
		}
		// Status was filtered in SQL but defence-in-depth: a stale
		// decode where the status flipped between SELECT and
		// Unmarshal still gets skipped here.
		if entry.Status != "active" {
			continue
		}

		// Compute and persist next_fire_at if missing (first run or migrated from old format)
		if entry.NextFireAt == 0 {
			nfa := computeNextFireAt(entry, p.tz, now)
			if nfa.IsZero() {
				// One-time schedule already expired — pause it
				if entry.Type == "once" || entry.Type == "one_time" {
					entry.Status = "paused"
					toUpdate = append(toUpdate, struct {
						kbID  int64
						entry scheduleEntry
					}{p.kbID, entry})
				}
				continue
			}
			entry.NextFireAt = nfa.Unix()
			toUpdate = append(toUpdate, struct {
				kbID  int64
				entry scheduleEntry
			}{p.kbID, entry})
		}

		fireAt := time.Unix(entry.NextFireAt, 0).UTC()

		if !fireAt.After(now) {
			p.value = "" // unused from here
			_ = p
			toFire = append(toFire, pendingEntry{
				userID: p.userID,
				key:    p.key,
				kbID:   p.kbID,
				tz:     p.tz,
			})
			// stash entry alongside the pending trigger
			toFire[len(toFire)-1].value = string(mustMarshalEntry(entry))
			continue
		}

		// Rows in the due set that we just re-armed with a fresh
		// next_fire_at still need to contribute to the min — the
		// "min future" query below won't see them because their
		// persisted row is stale until updateEntry flushes.
		if nextFireAt.IsZero() || fireAt.Before(nextFireAt) {
			nextFireAt = fireAt
		}
	}

	// Persist deferred updates now that the SELECT cursor is closed.
	for _, u := range toUpdate {
		s.updateEntry(ctx, u.kbID, u.entry)
	}

	// Fan out due executions after all writes.
	for _, f := range toFire {
		schedID := strings.TrimPrefix(f.key, "schedule:")
		var entry scheduleEntry
		_ = json.Unmarshal([]byte(f.value), &entry)
		go s.executeUserSchedule(ctx, f.userID, schedID, f.kbID, entry, f.tz, now)
	}

	// "Min future" query: cheapest form — one scalar across every row
	// that's still armed and in the future. Uses the same MATERIALIZED
	// CTE pattern as the due query above so `value::jsonb` only runs
	// on schedule rows (knowledge_base.value is TEXT and generically
	// stores arbitrary user data, so a blanket `->>` cast would fail
	// on memory chunks / notes).
	//
	// Postgres can serve this out of the index on knowledge_base(key)
	// for small fleets and benefits from an expression index on
	// `((value::jsonb->>'next_fire_at')::bigint)` when the fleet grows.
	var minFuture pgtype.Int8
	if err := s.db.Pool().QueryRow(queryCtx,
		`WITH schedule_rows AS MATERIALIZED (
		     SELECT kb.value::jsonb AS kb_value
		     FROM knowledge_base kb
		     JOIN users u ON u.id = kb.user_id::uuid
		     WHERE kb.key LIKE 'schedule:%'
		       AND u.is_active = TRUE
		 )
		 SELECT MIN((kb_value->>'next_fire_at')::bigint)
		 FROM schedule_rows
		 WHERE (kb_value->>'status') = 'active'
		   AND (kb_value->>'next_fire_at') IS NOT NULL
		   AND (kb_value->>'next_fire_at')::bigint > $1`,
		nowEpoch,
	).Scan(&minFuture); err != nil {
		s.logger.Warn("scheduler: min future next_fire_at query failed", zap.Error(err))
	} else if minFuture.Valid {
		futureTime := time.Unix(minFuture.Int64, 0).UTC()
		if nextFireAt.IsZero() || futureTime.Before(nextFireAt) {
			nextFireAt = futureTime
		}
	}

	return nextFireAt
}

// mustMarshalEntry re-serialises a scheduleEntry for the in-memory
// handoff between the cursor-scan phase and the fan-out phase. Failures
// return an empty document; the executor tolerates zero-value entries.
func mustMarshalEntry(entry scheduleEntry) []byte {
	b, err := json.Marshal(entry)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// updateEntry persists a modified scheduleEntry back to knowledge_base.
func (s *Scheduler) updateEntry(ctx context.Context, kbID int64, entry scheduleEntry) {
	newValue, err := json.Marshal(entry)
	if err != nil {
		return
	}
	if _, err := s.db.Pool().Exec(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE id = $2`,
		string(newValue), kbID,
	); err != nil {
		s.logger.Warn("scheduler: failed to update schedule entry",
			zap.Int64("kb_id", kbID), zap.Error(err))
	}
}

// schedTime mirrors the struct in cron.go for JSON unmarshalling.
type schedTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
	Timezone  string `json:"timezone,omitempty"` // IANA timezone, e.g. "Asia/Seoul"
}

type scheduleEntry struct {
	Title      string    `json:"title"`
	Type       string    `json:"type"`        // "recurring" | "once" | "one_time"
	ReportType string    `json:"report_type"` // action discriminator
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"` // "active" | "paused"
	Message    string    `json:"message"`
	LastSent   string    `json:"last_sent"`
	NextFireAt int64     `json:"next_fire_at,omitempty"` // UTC Unix seconds; 0 = not yet computed
	TaskPrompt string    `json:"task_prompt,omitempty"`  // NL task for AI agent execution
	DeliverTo  string    `json:"deliver_to,omitempty"`   // "telegram" or ""
	LastOutput string    `json:"last_output,omitempty"`  // last execution output snippet
}

func (s *Scheduler) executeUserSchedule(
	ctx context.Context,
	userID, schedID string,
	kbID int64,
	entry scheduleEntry,
	userTZ string,
	executedAt time.Time,
) {
	s.logger.Info("scheduler: executing user schedule",
		zap.String("sched_id", schedID),
		zap.String("user_id", userID),
		zap.String("report_type", entry.ReportType))

	// The old "report" dispatch branch was removed when the reports
	// handler was deleted (it was a silent no-op stub that still paid
	// per-tick DB cost). All user schedules now deliver through the
	// notify path; entries with legacy `report_type` values
	// (summary/weekly/monthly/diary/goals/finance) are surfaced as
	// notifications instead of silently dropped.
	msg := entry.Message
	if msg == "" {
		msg = entry.Title + " 알림입니다."
	}
	notifType := entry.ReportType
	if notifType == "" {
		notifType = "custom_reminder"
	}
	execErr := s.notifyFn(ctx, userID, notifType, msg)

	if execErr != nil {
		s.logger.Error("scheduler: user schedule execution failed",
			zap.String("sched_id", schedID),
			zap.String("user_id", userID),
			zap.Error(execErr))
		return
	}

	// Record local date of execution
	loc, err := time.LoadLocation(userTZ)
	if err != nil {
		loc = time.UTC
	}
	entry.LastSent = executedAt.In(loc).Format("2006-01-02")

	// Pause one-time schedules; advance next_fire_at for recurring ones
	if entry.Type == "once" || entry.Type == "one_time" {
		entry.Status = "paused"
		entry.NextFireAt = 0
	} else {
		nfa := computeNextFireAt(entry, userTZ, executedAt)
		if nfa.IsZero() {
			entry.NextFireAt = 0
		} else {
			entry.NextFireAt = nfa.Unix()
		}
	}

	s.updateEntry(ctx, kbID, entry)
	s.Wake() // Re-arm the event-driven timer with the updated next_fire_at
}
