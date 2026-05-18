# Challenger

## Render Deployment

This app is designed to run as a single Node web service on Render.
The Express server serves both the API and the built React app.

### Persistent Data

To keep user accounts, profile photos, cover photos, uploaded videos, posts, stories, and messages available after refresh, re-login, redeploy, and across devices, Render must mount a persistent disk.

Use this exact disk path:

- `mountPath`: `/var/data/challenger`
- `CHALLENGER_DATA_DIR`: `/var/data/challenger`

The app stores:

- SQLite database in `/var/data/challenger/data/challenger.db`
- uploaded files in `/var/data/challenger/uploads`

### Required Render Variables

Set these on the Render web service:

- `NODE_ENV=production`
- `CHALLENGER_DATA_DIR=/var/data/challenger`
- `SESSION_SECRET=<long random secret used for JWT cookie signing>`
- `GOOGLE_CLIENT_ID=<your Google OAuth client id>`
- `VITE_GOOGLE_CLIENT_ID=<same Google OAuth client id used by the frontend>`

Optional:

- `GOOGLE_CLIENT_IDS=<comma-separated list of allowed Google client ids>`
- `BCRYPT_ROUNDS=12`

### Cloud Object Storage (S3)

For Facebook-style media handling, the app supports direct browser uploads to a bucket using signed URLs.

Required when using bucket uploads:

- `STORAGE_PROVIDER=s3`
- `S3_BUCKET=<bucket name>`
- `S3_REGION=<bucket region, e.g. us-east-1>`
- `S3_ACCESS_KEY_ID=<access key>`
- `S3_SECRET_ACCESS_KEY=<secret key>`

Optional:

- `S3_PUBLIC_BASE_URL=<public CDN or bucket base URL>`

Alternative providers:

- `STORAGE_PROVIDER=gcs`
- `GCS_BUCKET=<bucket name>`
- `GCS_PROJECT_ID=<project id>`
- `GCS_CLIENT_EMAIL=<service account email>`
- `GCS_PRIVATE_KEY=<service account private key, use \n for new lines>`
- Optional: `GCS_PUBLIC_BASE_URL=<public base URL>`

- `STORAGE_PROVIDER=supabase`
- `SUPABASE_URL=<https://<project>.supabase.co>`
- `SUPABASE_SERVICE_ROLE_KEY=<service role key>`
- `SUPABASE_BUCKET=<storage bucket name>`
- Optional: `SUPABASE_PUBLIC_BASE_URL=<public base URL>`

Workflow:

1. Frontend requests a signed upload URL from `/api/storage/sign-upload`.
2. Frontend uploads the file directly to S3 using that signed URL.
3. Backend and frontend keep only the returned public URL in app records (`avatar_url`, post media URL, story media URL).

Verification:

- `GET /api/storage/status` shows active provider mode and missing configuration keys.
- Settings page includes a Storage Provider Status card for quick pre-deploy checks.

Do not set `VITE_API_BASE_URL` on Render. In production the frontend should use the same origin as the deployed app, not `localhost`.

### Render Blueprint

The repo includes `render.yaml` with:

- build command: `npm install && npm run build`
- start command: `npm start`
- health check: `/api/health`
- persistent disk mounted at `/var/data/challenger`

If you create the service manually in Render instead of using the blueprint, use the same values above.

## PostgreSQL Graph Schema (Step 1)

If you want a Facebook-style graph foundation, a PostgreSQL schema with UUID IDs is available at:

- `server/postgres/001_graph_schema.sql`
- `server/postgres/002_graph_story_message_schema.sql`
- `server/postgres/README.md`

This adds graph-ready nodes (`users`, `posts`, `comments`) and associations (`connections`) with indexes for feed and relationship queries.

## Graph API Migration Mode

Frontend can gradually switch to graph endpoints without breaking existing flows.

- `VITE_GRAPH_API_MODE=auto` (default): use graph endpoints when available, fallback to legacy endpoints.
- `VITE_GRAPH_API_MODE=on`: force graph endpoints.
- `VITE_GRAPH_API_MODE=off`: keep legacy endpoints only.