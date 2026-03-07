# Incremental Migrations

Post-v1.0.0 schema changes go here.

## Naming Convention

```
v1.0.1.sql   ← patch: bug fixes, index additions
v1.1.0.sql   ← minor: new columns, new tables
v2.0.0.sql   ← major: breaking schema changes
```

## Rules

- Each file is applied **once** and tracked in the `schema_migrations` table.
- Files are applied in **lexicographic order** — version numbers must sort correctly.
- Every migration must be **idempotent** where possible (use `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`).
- **Never modify** a migration that has already been released and applied in production.
- For complex migrations that require data transformation, wrap in a transaction (`BEGIN` / `COMMIT`).

## Example

```sql
-- v1.1.0.sql
-- Add notification_settings to channel_settings

ALTER TABLE channel_settings
    ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{}';
```
