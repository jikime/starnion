-- Migration 015: telegram_pairing
-- Supports DM policy "pairing": a Telegram user must be approved before the bot
-- responds to their messages.

-- Approved contacts: Telegram user IDs explicitly allowed to DM this bot owner.
CREATE TABLE IF NOT EXISTS telegram_approved_contacts (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id  TEXT        NOT NULL,  -- web user who owns the bot
    telegram_id    TEXT        NOT NULL,  -- Telegram user ID (string representation)
    display_name   TEXT        NOT NULL DEFAULT '',
    approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_approved_contacts_owner
    ON telegram_approved_contacts (owner_user_id);

-- Pending pairing requests: Telegram users waiting for approval.
CREATE TABLE IF NOT EXISTS telegram_pairing_requests (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id  TEXT        NOT NULL,  -- web user who owns the bot
    telegram_id    TEXT        NOT NULL,  -- requester's Telegram user ID
    display_name   TEXT        NOT NULL DEFAULT '',
    message_text   TEXT        NOT NULL DEFAULT '',  -- first message that triggered the request
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status         TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | denied
    resolved_at    TIMESTAMPTZ,
    UNIQUE (owner_user_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_pairing_requests_owner_status
    ON telegram_pairing_requests (owner_user_id, status);
