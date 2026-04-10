// cmd/test-notify — local notification test runner
//
// Triggers every builtin scheduler job once for a given user and prints
// whether the message was sent (or skipped due to no data).
//
// Usage:
//
//	go run ./cmd/test-notify                       # runs all jobs for first active user
//	go run ./cmd/test-notify -user <uuid>          # specific user
//	go run ./cmd/test-notify -job daily_weather    # specific job only
//	go run ./cmd/test-notify -dry                  # print messages, do NOT send to Telegram
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"github.com/newstarnion/gateway/internal/infrastructure/scheduler"
	tg "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
)

// allJobIDs is the ordered list of jobs to test.
var allJobIDs = []string{
	// Level 3: External Content
	"daily_weather",
	// Level 3b: Naver Search
	"daily_news",
	"local_events",
	"it_blog_digest",
	// Level 1: Rule-Based
	"daily_summary",
	"weekly_report",
	"monthly_closing",
	"inactive_reminder",
	"budget_warning",
	// Level 2: Pattern-Learning
	"planner_task_reminder",
	"planner_goal_dday",
	"spending_anomaly",
	"anomaly_insights",
	"pattern_analysis",
	"pattern_insight",
	"conversation_analysis",
	// Level 5: Maintenance (skipped in test — no notification)
	// "memory_compaction",
}

func main() {
	userFlag := flag.String("user", "", "User UUID (defaults to first active user in DB)")
	jobFlag := flag.String("job", "", "Specific job ID (default: run all)")
	dryRun := flag.Bool("dry", false, "Print messages without sending to Telegram")
	flag.Parse()

	// ── Logger ────────────────────────────────────────────────────────────────
	logger, _ := zap.NewDevelopment()
	defer logger.Sync() //nolint:errcheck

	// ── Config + DB ───────────────────────────────────────────────────────────
	cfg := config.Load()
	ctx := context.Background()

	db, err := database.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("DB connect failed", zap.Error(err))
	}

	// ── Resolve user ──────────────────────────────────────────────────────────
	// Prefer a user who has Telegram linked so notifications actually deliver.
	userID := *userFlag
	if userID == "" {
		// 1st choice: user with platform_identities telegram row
		db.QueryRowContext(ctx,
			`SELECT u.id::text FROM users u
			 JOIN platform_identities pi ON pi.user_id = u.id AND pi.platform = 'telegram'
			 WHERE u.is_active = true LIMIT 1`,
		).Scan(&userID)
	}
	if userID == "" {
		// 2nd choice: user with telegram_id column set
		db.QueryRowContext(ctx,
			`SELECT id::text FROM users WHERE is_active = true AND telegram_id IS NOT NULL LIMIT 1`,
		).Scan(&userID)
	}
	if userID == "" {
		// 3rd choice: any active user (may fail Telegram delivery)
		if err := db.QueryRowContext(ctx,
			`SELECT id::text FROM users WHERE is_active = true ORDER BY created_at LIMIT 1`,
		).Scan(&userID); err != nil {
			logger.Fatal("no active user found", zap.Error(err))
		}
	}

	var email string
	db.QueryRowContext(ctx, `SELECT email FROM users WHERE id = $1::uuid`, userID).Scan(&email)
	fmt.Printf("\n=== StarNion Notification Test ===\n")
	fmt.Printf("User : %s (%s)\n", userID, email)
	if *dryRun {
		fmt.Printf("Mode : DRY RUN (messages will NOT be sent to Telegram)\n")
	} else {
		fmt.Printf("Mode : LIVE (messages will be sent to Telegram)\n")
	}
	fmt.Println()

	// ── notifyFn ──────────────────────────────────────────────────────────────
	// In live mode, resolve the user's Telegram chat_id + bot_token and send.
	// In dry mode, just print.
	var notifyFn func(ctx context.Context, uid, notifType, message string) error

	if *dryRun {
		notifyFn = func(_ context.Context, _, notifType, message string) error {
			fmt.Printf("  [DRY] type=%s\n  %s\n", notifType, message)
			return nil
		}
	} else {
		notifyFn = func(ctx context.Context, uid, notifType, message string) error {
			// Resolve chat_id
			var platformID string
			db.QueryRowContext(ctx,
				`SELECT COALESCE(
				     (SELECT platform_id FROM platform_identities
				      WHERE user_id = $1::uuid AND platform = 'telegram' LIMIT 1),
				     (SELECT telegram_id::text FROM users
				      WHERE id = $1::uuid AND telegram_id IS NOT NULL LIMIT 1)
				 )`,
				uid,
			).Scan(&platformID)
			if platformID == "" {
				return fmt.Errorf("no Telegram chat_id for user %s", uid)
			}

			// Resolve bot token
			var rawToken string
			if err := db.QueryRowContext(ctx,
				`SELECT bot_token FROM channel_settings
				 WHERE user_id = $1::uuid AND channel = 'telegram' AND enabled = true AND bot_token <> ''
				 LIMIT 1`,
				uid,
			).Scan(&rawToken); err != nil {
				// Fall back to global bot token
				rawToken = cfg.TelegramBotToken
			}
			botToken := rawToken
			if cfg.EncryptionKey != "" {
				if plain, err := crypto.Decrypt(rawToken, cfg.EncryptionKey); err == nil && plain != "" {
					botToken = plain
				}
			}
			if botToken == "" {
				return fmt.Errorf("no bot token available")
			}

			// Convert platform_id to int64
			var chatID int64
			fmt.Sscan(platformID, &chatID)
			if chatID == 0 {
				return fmt.Errorf("invalid chat_id: %s", platformID)
			}

			client := tg.NewClient(botToken)
			return client.SendMessage(chatID, message)
		}
	}

	reportFn := func(_ context.Context, _, _ string) error { return nil }

	// ── Scheduler ─────────────────────────────────────────────────────────────
	sched := scheduler.New(db, logger, reportFn, notifyFn)
	sched.SetNaverCredentials(cfg.NaverSearchClientID, cfg.NaverSearchClientSecret)
	sched.SetEncryptionKey(cfg.EncryptionKey)

	// ── Job list ──────────────────────────────────────────────────────────────
	jobs := allJobIDs
	if *jobFlag != "" {
		jobs = []string{*jobFlag}
	}

	// ── Run each job ──────────────────────────────────────────────────────────
	passed, skipped, failed := 0, 0, 0
	for _, jobID := range jobs {
		start := time.Now()
		msg, sent, err := sched.TriggerJob(ctx, jobID, userID)
		elapsed := time.Since(start).Round(time.Millisecond)

		switch {
		case err != nil:
			fmt.Printf("  [FAIL]  %-30s %v  (%s)\n", jobID, err, elapsed)
			failed++
		case !sent:
			fmt.Printf("  [SKIP]  %-30s no data to send  (%s)\n", jobID, elapsed)
			skipped++
		default:
			preview := msg
			if len(preview) > 80 {
				preview = preview[:80] + "…"
			}
			fmt.Printf("  [SENT]  %-30s %q  (%s)\n", jobID, preview, elapsed)
			passed++
		}
	}

	// ── Summary ───────────────────────────────────────────────────────────────
	fmt.Printf("\n──────────────────────────────────────\n")
	fmt.Printf("SENT %d  /  SKIPPED %d  /  FAILED %d\n", passed, skipped, failed)
	fmt.Println()

	if failed > 0 {
		os.Exit(1)
	}
}
