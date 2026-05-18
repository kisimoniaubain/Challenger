-- Challenger graph schema extension (Step 3)
-- Adds stories and messages in UUID graph format

BEGIN;

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_type VARCHAR(16),
  music_url TEXT,
  music_name VARCHAR(140),
  challenge_title VARCHAR(180),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'text'))
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  reply_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS ix_stories_author_created_at
  ON stories (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_stories_expires_at
  ON stories (expires_at DESC);

CREATE INDEX IF NOT EXISTS ix_messages_pair_created_at
  ON messages (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id),
    created_at ASC
  );

CREATE INDEX IF NOT EXISTS ix_messages_from_created_at
  ON messages (from_user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ix_messages_to_created_at
  ON messages (to_user_id, created_at ASC);

COMMIT;
