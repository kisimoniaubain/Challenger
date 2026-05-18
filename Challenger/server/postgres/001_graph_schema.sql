-- Challenger graph-first relational schema (Step 1)
-- PostgreSQL 13+

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_type') THEN
    CREATE TYPE connection_type AS ENUM ('friend', 'follow', 'block');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_status') THEN
    CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined', 'blocked');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT,
  display_name VARCHAR(120) NOT NULL,
  avatar_url TEXT,
  cover_photo_url TEXT,
  gender VARCHAR(32),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_type VARCHAR(30),
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (visibility IN ('public', 'friends', 'private'))
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation_type connection_type NOT NULL DEFAULT 'friend',
  status connection_status NOT NULL DEFAULT 'pending',
  acted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_connections_directed
  ON connections (requester_id, addressee_id, relation_type);

CREATE UNIQUE INDEX IF NOT EXISTS ux_connections_friend_pair
  ON connections (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id),
    relation_type
  )
  WHERE relation_type = 'friend';

CREATE INDEX IF NOT EXISTS ix_posts_author_created_at
  ON posts (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_comments_post_created_at
  ON comments (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ix_comments_parent
  ON comments (parent_comment_id);

CREATE INDEX IF NOT EXISTS ix_connections_requester
  ON connections (requester_id, relation_type, status);

CREATE INDEX IF NOT EXISTS ix_connections_addressee
  ON connections (addressee_id, relation_type, status);

COMMIT;
