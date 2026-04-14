package database

import (
	"context"
	"fmt"

	"github.com/newstarnion/migrations"
	"go.uber.org/zap"
)

// RunMigrations applies any pending SQL migrations against db. The
// canonical SQL files and the apply-with-tracking logic live in the
// shared `migrations` module so the gateway, the starnion-cli
// installer, and Docker's postgres bootstrap all reference the same
// source of truth.
//
// This function exists as a thin shim so the bootstrap code calling
// it stays unchanged — wire.go still does
// `database.RunMigrations(ctx, db, logger)` exactly as before.
func RunMigrations(ctx context.Context, db *DB, logger *zap.Logger) error {
	if err := migrations.Run(ctx, db.Pool(), zapAdapter{logger}); err != nil {
		return fmt.Errorf("database: %w", err)
	}
	return nil
}

// zapAdapter satisfies migrations.Logger by forwarding Infof calls
// into the gateway's structured zap logger. The migrations package is
// dependency-free of zap so the rest of the workspace can use it
// without dragging zap into smaller modules.
type zapAdapter struct{ z *zap.Logger }

func (a zapAdapter) Infof(format string, args ...any) {
	a.z.Sugar().Infof(format, args...)
}
