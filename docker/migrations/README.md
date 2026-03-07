# Migrations

## Structure

```
docker/
  init.sql              ← v1.0.0 baseline: complete schema for fresh installs
  migrations/
    incremental/        ← post-v1.0.0 changes applied to existing databases
    001_*.sql           ← historical (development history, not run on new installs)
    ...
    030_*.sql
```

## How It Works

### Fresh Install

`starnion setup` detects an empty database and applies `docker/init.sql` in full.
This creates all tables in one shot and records `v1.0.0` in `schema_migrations`.

### Upgrade (existing database)

`starnion migrate` (or `starnion setup` on an existing DB) applies only the files
in `incremental/` that are not yet recorded in `schema_migrations`.

### Historical Files (001–030)

These files document the development history from the initial prototype to v1.0.0.
They are **not applied** on new installs — `init.sql` already represents their
combined final state.
