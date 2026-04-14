---
title: Connect (Relationships)
nav_order: 20
parent: Features
grand_parent: 🇺🇸 English
---

# Connect (Relationships)

## Overview

Starnion's **Connect** feature isn't a plain address book — it's a **relationship-maintenance assistant**. Business card scanning, activity logging, automatic ingest from Gmail/Calendar, contact cadence alerts, drift detection, and Google Contacts import all live in one surface. The goal: never "forget about" someone you care about.

The big difference from a typical CRM is **automation**. You don't have to log every meeting or email manually — Starnion pulls activity from Gmail + Google Calendar in the background, recomputes a connection score each night, and nudges you when someone you usually talk to has gone too long without contact.

---

## Key capabilities

| Capability | What it does |
|---|---|
| **PersonaCard** | One-screen detail view: avatar, name, role, company, category, contact info, social profiles, tags, context memo, business card, activity timeline |
| **Business card OCR** | Upload a card image → Gemini Vision extracts the fields → new connection is created automatically |
| **Context Memo** | Static facts about the person ("vegan diet, two kids, into Next.js") — up to 4,096 characters |
| **Activity Timeline** | Dated log of "what happened when" — manual entries + auto-ingest from Gmail and Calendar |
| **Nion Suggestion** | Data-driven action prompt combining drift status, recent activity counts, and last interaction |
| **Connection Score** | `0.45 × recency + 0.35 × frequency + 0.20 × importance`, recomputed every day at 03:00 |
| **Reminders panel** | Connections past their target contact cadence, sorted by days overdue |
| **Drift reminder** | Daily 09:00 Telegram summary: "3 people have gone quiet: …" |
| **Google Contacts Import** | One-shot bulk import from Google People API with email/phone dedup |

---

## Adding a connection

### Option 1: Business card scan

```
User: [attaches business card image]
AI:   I analyzed the card and added them as a new connection.
      Name: Kim Cheol-su
      Company: ACME Corp
      Role: Senior Engineer
      Email: kim@acme.com
      Phone: +82-10-1234-5678
```

Under the hood the `connect-ocr` skill runs Gemini Vision → extracts fields → writes directly into the `connections` table. The original image stays in the `business_card` JSONB column so the PersonaCard can show a preview and a lightbox.

### Option 2: Manual entry

Web UI `/connect` → "Add New Connection" → name, email, category, etc. → save.

### Option 3: Bulk import from Google Contacts (Phase 3)

```
User: Import all my Google contacts into Connect
AI:   I found 142 contacts in Google, 1 is already registered.
      Import the remaining 141?
User: Yes
AI:   Imported 141 contacts. You can filter them with the
      'google_contacts' tag in the Connect page.
```

The `connect-contacts-import` skill pages through the People API, dedups by email (then phone) against existing connections, and inserts the new rows with `category=acquaintance` and `tags=['google_contacts']`. It's a one-shot import — not a recurring two-way sync.

> **Prerequisite:** the Google Workspace skill needs the `contacts.readonly` scope. Users who connected before 2026-04 must visit `/skills` → Google Workspace → Disconnect → Connect again to approve the new scope.

---

## Categories and target cadence

Each connection falls into one of four categories:

| Category | Base importance | Suggested cadence |
|---|---|---|
| `family` | 0.9 | 2 weeks |
| `business` | 0.7 | 1 month |
| `friend` | 0.7 | 1 month |
| `acquaintance` | 0.4 | 3 months |

Every connection has a per-row `contact_frequency_target` (in days) that drives both drift detection and the score formula.

---

## Context Memo

A freeform text box for **static facts about the person** — things that don't change often. Things like "vegan diet", "kids: 3rd-grade daughter + pre-K son", "interested in Next.js". Kept separate from the Activity Timeline (memo = profile, timeline = event log).

You can edit it from chat:

```
User: Add "vegan diet, enjoys cycling" to Kim's memo
AI:   Added to Kim Cheol-su's memo.
```

The `connect-memo` skill supports append / replace / clear on the `context_notes` column. Maximum length is 4,096 characters (BR-CONTEXT-1).

---

## Activity Timeline (Phase 2)

A **"what we did together and when" event log**. Two entry paths — manual and automatic — and it renders as a vertical timeline with colored bullets in the PersonaCard's right pane.

### Manual entries

PersonaCard → "+ Add Entry" → pick a chip (meeting / call / meal / work / message / other) → enter note, optional datetime, optional duration → save.

Or via chat:

```
User: Had lunch with Kim yesterday. 45-min meeting at COEX.
AI:   Added an entry for April 12 lunch with Kim Cheol-su.
```

The `connect-activity` skill handles this. A manual add also advances `connections.last_contact_at` (monotonic — the timestamp never rewinds).

### Automatic ingest (Gmail + Google Calendar)

Pulls recent email and calendar events into the timeline automatically.

- **Cron (`connect_activity_ingest`)**: daily 02:00, default OFF — toggle on in `/cron`
- **Manual trigger**: notification center → "Connect Activity Ingest" ▶ button
- **Skill call**: `"pull my calendar into Connect"`

### Matching strategy

For each email / event:

1. **Primary: email match** — `From:` / `To:` / `Cc:` / `attendees[].email` → `connections.email`
2. **Fallback: name match** — if email matching fails, the subject or event title is searched for any connection name (≥2 characters) as a case-insensitive substring

Example: a personal event titled "Meeting with Kim Cheol-su" (no attendees) still gets linked to the `Kim Cheol-su` connection via the name fallback.

### Filters

- Drop `noreply@`, `notifications@`, `alerts@`, etc. senders
- Drop recipient count > 20 (mailing-list noise)
- Weight decay: `1 / sqrt(participants)` — 1:1 meeting = 1.0, 4-person = 0.5, 16-person = 0.25
- Future events **appear in the timeline** but do NOT advance `last_contact_at` (protects drift detection from negative day counts)

### Kind colors

Timeline bullets are color-coded by source:

- 🔵 Email (`email`, sky-400)
- 🟢 Calendar (`calendar`, emerald-400)
- 🟣 Manual (`manual`, violet-400)
- 🔷 Telegram (`telegram`, cyan-400)

---

## Nion Suggestion

A **data-driven summary box** at the top of the PersonaCard. Combines recent activity, drift status, and category severity into a one-sentence action prompt. No LLM call — 100% client-side math.

```
✨ NION'S SUGGESTION
27 days without contact (target 30)
Last 90 days: 📧 email 4  📅 events 1
Last activity: 3 days ago · meeting (45 min)
─────────────────────────────
→ Your regular check-in window is coming up.
   A quick hello now beats a late one later.
```

Picked from a 9-cell matrix of (category × severity × never-contacted):

- **family** → strong nudge starting at tier 1
- **business / friend / acquaintance** → graduated tone across tiers 1/2/3
- **healthy** → "You're staying in touch nicely 👍"
- **never contacted** → "Send a quick first hello"

---

## Connection Score

A number between 0.0 and 1.0 expressing **relationship health**. The `connect_score_recompute` cron recalculates it each night at 03:00.

**Formula** (architecture-design.md §D):

```
score = 0.45 × recency + 0.35 × frequency + 0.20 × importance

recency    = exp(-days_since_contact / (2 × target_interval))
frequency  = min(1, activity_weight_90d / (90 / target_interval))
importance = category_base[category] + tag_boost
```

- **recency**: near-1.0 inside the target window, ≈0.37 at 2× target, near-0 afterward
- **frequency**: weighted activity count in the last 90 days, normalized
- **importance**: family 0.9, business/friend 0.7, acquaintance 0.4

Writes are skipped when `|Δ| < 0.005` to minimize cron churn on quiet data.

---

## Reminders (drift detection)

### Reminders panel

`/connect` → toggle at the top of the right aside → "Reminders".

Shows connections whose `last_contact_at + contact_frequency_target < NOW()`, sorted by days overdue descending. Each row clicks through to the PersonaCard.

### Drift reminder cron

- **Job**: `connect_drift_reminder` (daily 09:00, default OFF)
- **Channel**: Telegram (if connected)
- **Format**: "3 people have gone quiet: Kim, Park, Lee. Check the Connect page."
- **Top-3 names** are named explicitly, with a "+N more" suffix for the rest
- **Dedup**: at most one notification per day

The Reminders panel and the drift reminder cron call the **same query** (`ListDriftingConnections`) through different channels. The panel is live — it doesn't depend on the cron running.

---

## Cron summary

Three system jobs that can be individually toggled under `/cron`:

| Job ID | Time | Action | Default | Purpose |
|---|---|---|---|---|
| `connect_activity_ingest` | 02:00 | maintenance | OFF | Gmail + Calendar → timeline auto-ingest |
| `connect_score_recompute` | 03:00 | maintenance | OFF | Recompute connection scores |
| `connect_drift_reminder` | 09:00 | smart_notify | OFF | Telegram drift summary |

All three default to **OFF** (opt-in) — users explicitly enable them under `/cron`. The ▶ trigger button runs any job once immediately for testing.

---

## The four Connect skills

| Skill | What it does |
|---|---|
| `connect-ocr` | Business card image → OCR → new connection |
| `connect-memo` | Context-memo add / replace / clear |
| `connect-activity` | Activity timeline find / add / list / delete + Gmail/Calendar sync |
| `connect-contacts-import` | Google Contacts bulk import (preview / import) |

All four write directly to Postgres via psycopg2, strictly scoped by `WHERE user_id = %s` (BR-AUTH-1). Per BR-SOCIAL-3, `social_profiles` is **never** written from the OCR or Contacts import paths — social links must be entered manually in the web UI.

---

## Business rules at a glance

| Rule | What it enforces |
|---|---|
| BR-AUTH-1 | Every query is scoped by `user_id` — no cross-tenant access |
| BR-CAT-1 | Category is one of `family / friend / business / acquaintance` (case-sensitive) |
| BR-TAG-1 | ≤ 16 tags, each ≤ 32 chars, case-insensitive dedupe |
| BR-CONTEXT-1 | Context memo ≤ 4,096 chars |
| BR-SOCIAL-1 | `social_profiles` keys limited to facebook / instagram / x / linkedin / threads |
| BR-SOCIAL-2 | PATCH uses merge-patch semantics (nil value = delete key) |
| BR-SOCIAL-3 | OCR / import paths never touch `social_profiles` |
| BR-SCORE-1 | `connection_score` is server-owned; PATCH silently drops it |
| BR-109-1 | `last_contact_at` is monotonic; future timestamps > NOW() + 60s are rejected |

---

## Troubleshooting

### "Google auth expired but auto-refresh isn't working"

Pre-v0.4.0 the `decrypt_value` helper in starnion_utils couldn't read the v2 ciphertext format the gateway writes on refresh. Upgrading to v0.4.0 and restarting the gateway fixes it.

### "My calendar events aren't showing up in the timeline"

Two things to check:

1. **Window**: the cron only scans past 7 days + future 14 days. For a wider backfill, ask the skill directly: `sync --days 90`.
2. **Matching**: if the event has no attendees, matching falls through to **name search** on the event title — the title must contain a connection's name. If both fail, the event is treated as a personal todo and skipped.

### "The Reminders panel is empty"

Probably legitimate. The panel shows only connections whose target cadence has elapsed. If nobody is overdue you get the "You're on top of everything 👍" empty state. To test with real data:

```sql
UPDATE connections SET last_contact_at = NOW() - INTERVAL '60 days'
WHERE name = '...' AND user_id = '...';
```

### "Connection scores aren't updating"

`connect_score_recompute` is likely OFF. Toggle it on under `/cron`, or hit the ▶ trigger to run it once immediately.

---

## See also

- [Skills](../skills.md) — details on connect-ocr / connect-memo / connect-activity / connect-contacts-import
- [Notifications & Scheduling](schedules.md) — cron job configuration
- [Architecture](../architecture.md) — Clean Architecture layering and domain model
