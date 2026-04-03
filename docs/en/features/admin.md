---
title: Admin Tools
nav_order: 13
parent: Features
grand_parent: 🇺🇸 English
---

# Admin Tools

## Overview

Starnion provides CLI commands for server administrators to manage user accounts and database migrations directly from the terminal.

---

## starnion users — User Account Management

The `starnion users` command group accesses PostgreSQL directly to manage user accounts. **No login required** — instead, a valid database connection must be configured in `~/.starnion/config.yaml`.

### List Users

```bash
starnion users list
```

Example output:

```
══════════════════════════════════ USERS ═══════════════════════════════════════

  ID        EMAIL                  NAME          ROLE    CREATED
  ──────    ─────────────────────  ────────────  ─────   ──────────
  a1b2c3    admin@example.com      Admin         admin   2024-01-15
  d4e5f6    user@example.com       John Doe      user    2024-02-01

  Total: 2 users
```

### Add a New User

```bash
starnion users add \
  --email user@example.com \
  --password "StrongPassword123!" \
  --name "John Doe"

# Grant admin privileges
starnion users add \
  --email admin@example.com \
  --password "AdminPass!" \
  --name "System Admin" \
  --admin
```

| Flag | Required | Description |
|------|----------|-------------|
| `--email` | ✅ | Email address (must be unique) |
| `--password` | ✅ | Initial password |
| `--name` | ✅ | Display name |
| `--admin` | ❌ | Grant admin role (default: regular user) |

### Remove a User

```bash
starnion users remove user@example.com
```

A confirmation prompt is shown. Type `yes` to proceed with deletion.

> ⚠️ **Warning**: All data associated with the account — conversations, memos, diary entries, etc. — will be permanently deleted.

### Reset Password

```bash
starnion users reset-password user@example.com
```

A secure prompt is displayed to enter the new password (input is hidden from the terminal).

---

## starnion db — Database Migrations

The `starnion db` command group manages the database schema version. It uses the `schema_migrations` table to track which migrations have been applied.

### Apply Migrations

```bash
starnion db migrate
```

Runs all `.sql` files in `gateway/internal/cli/migrations/incremental/` in filename order. Already-applied files are skipped.

Example output:

```
  · v1.1.0-add-search-index.sql already applied
  ✓ v1.2.0-add-usage-logs.sql applied

  Migration complete: 1 applied, 1 skipped
```

### Check Migration Status

```bash
starnion db status
```

Example output:

```
══════════════════════════ MIGRATION STATUS ════════════════════════════════════

  ✓ v1.0.0 (baseline)          [applied 2024-01-15 10:30:00]
  ✓ v1.1.0-add-search-index    [applied 2024-02-01 14:22:10]
  · v1.2.0-add-usage-logs      [pending]
```

### Adding New Migration Files

1. Create a `.sql` file in `gateway/internal/cli/migrations/incremental/`
2. Use a version prefix — filenames are executed in sort order:

   ```
   v1.2.0-add-usage-logs.sql
   v1.2.1-add-audit-table.sql
   ```

3. Apply with `starnion db migrate`
4. Verify with `starnion db status`

---

## Document Processing Queue (Background Queue)

Parsing and embedding large documents (≥ 500 KB) is handled by a **background queue** to prevent gRPC handler timeouts.

### How It Works

```
parse_document called
  ↓
File size check
  ├── < 500 KB → process synchronously → return result
  └── ≥ 500 KB → enqueue → return task_id
                     ↓
               Background Workers (up to 2 concurrent)
                     ↓
               Docling parsing + embedding + DB storage
```

### Check Status (AI Tool)

After uploading a large document, use the returned `task_id` to poll progress:

```
check_document_status('<task_id>')
```

Status values:

| Status | Meaning |
|--------|---------|
| `pending` | Waiting (not yet started) |
| `processing` | In progress (Docling parsing + embedding) |
| `done` | Complete (N sections stored in vector DB) |
| `error` | Failed (error message included) |

### Configuration

```bash
# Number of concurrent workers (default: 2)
DOC_QUEUE_WORKERS=3
```

> 💡 Docling is CPU-intensive. Setting too many workers can cause CPU contention and actually slow down processing.
