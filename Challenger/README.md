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
- `GOOGLE_CLIENT_ID=<your Google OAuth client id>`
- `VITE_GOOGLE_CLIENT_ID=<same Google OAuth client id used by the frontend>`

Optional:

- `GOOGLE_CLIENT_IDS=<comma-separated list of allowed Google client ids>`

Do not set `VITE_API_BASE_URL` on Render. In production the frontend should use the same origin as the deployed app, not `localhost`.

### Render Blueprint

The repo includes `render.yaml` with:

- build command: `npm install && npm run build`
- start command: `npm start`
- health check: `/api/health`
- persistent disk mounted at `/var/data/challenger`

If you create the service manually in Render instead of using the blueprint, use the same values above.