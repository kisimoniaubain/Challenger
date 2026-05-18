# PostgreSQL Graph Schema (Step 1)

This folder contains a graph-oriented relational schema for Challenger.

## What It Adds

- `users` table (node)
- `posts` table (node)
- `comments` table (node)
- `connections` table (association edge for friend/follow/block)
- UUID primary keys on all main entities
- Query indexes for timeline, comments, and social graph lookups

## Apply Migration

Run the SQL file with your PostgreSQL client:

```bash
psql "$DATABASE_URL" -f server/postgres/001_graph_schema.sql
psql "$DATABASE_URL" -f server/postgres/002_graph_story_message_schema.sql
```

If your PostgreSQL environment does not allow `pgcrypto`, replace `gen_random_uuid()` with `uuid_generate_v4()` and enable extension `uuid-ossp`.

## Enable Graph API Mode

Set environment variables:

- `GRAPH_DB_MODE=postgres`
- `DATABASE_URL=postgres://user:password@host:5432/database`

Optional:

- `PG_SSL=true` for managed cloud databases that require SSL.
- `SESSION_SECRET=<long-random-secret>` for JWT session signing.
- `BCRYPT_ROUNDS=12` to tune password hashing strength.

For direct object storage uploads:

- `STORAGE_PROVIDER=s3`
- `S3_BUCKET=<bucket name>`
- `S3_REGION=<region>`
- `S3_ACCESS_KEY_ID=<access key>`
- `S3_SECRET_ACCESS_KEY=<secret key>`
- Optional: `S3_PUBLIC_BASE_URL=<public base URL>`

Or:

- `STORAGE_PROVIDER=gcs`
- `GCS_BUCKET=<bucket name>`
- `GCS_PROJECT_ID=<project id>`
- `GCS_CLIENT_EMAIL=<service account email>`
- `GCS_PRIVATE_KEY=<service account private key (with \n escaped new lines)>`
- Optional: `GCS_PUBLIC_BASE_URL=<public base URL>`

Or:

- `STORAGE_PROVIDER=supabase`
- `SUPABASE_URL=<project URL>`
- `SUPABASE_SERVICE_ROLE_KEY=<service role key>`
- `SUPABASE_BUCKET=<bucket name>`
- Optional: `SUPABASE_PUBLIC_BASE_URL=<public base URL>`

When enabled, server routes become available under `/api/graph/*`.

## Graph Endpoints

- `GET /api/graph/health`
- `GET /api/graph/users`
- `POST /api/graph/users`
- `PATCH /api/graph/users/:userId`
- `POST /api/graph/auth/login`
- `POST /api/graph/auth/register`
- `POST /api/graph/auth/reset-password`
- `POST /api/graph/auth/google-upsert`
- `GET /api/graph/auth/session`
- `POST /api/graph/auth/logout`
- `POST /api/storage/sign-upload`
- `GET /api/storage/status`
- `GET /api/graph/posts`
- `POST /api/graph/posts`
- `PATCH /api/graph/posts/:postId`
- `DELETE /api/graph/posts/:postId`
- `GET /api/graph/stories`
- `POST /api/graph/stories`
- `PATCH /api/graph/stories/:storyId`
- `DELETE /api/graph/stories/:storyId`
- `GET /api/graph/messages`
- `POST /api/graph/messages`
- `PATCH /api/graph/messages/:messageId`
- `DELETE /api/graph/messages/:messageId`
- `GET /api/graph/posts/:postId/comments`
- `POST /api/graph/posts/:postId/comments`
- `GET /api/graph/connections?userId=<uuid>`
- `POST /api/graph/connections`
- `PATCH /api/graph/connections/:connectionId`
