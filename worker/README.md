# Corhaus WhatsApp Worker

This is the **only** component that talks to WhatsApp. It is a separate,
long-running Node process — it is deliberately **not** part of the Vercel-hosted
Next.js app.

## Why it cannot live in the Next.js app

A WhatsApp Web session (Baileys) needs:

- a process that stays alive indefinitely,
- a persistent filesystem to hold its auth credentials,
- a long-lived WebSocket to WhatsApp.

Vercel functions are ephemeral, are killed after a short idle window, cannot
hold a persistent socket, and cannot mount writable persistent storage. Anything
built there would appear to work in `next dev` and silently fail in production.
So: the web app writes **jobs** to Supabase, and this worker delivers them.

```
Corhaus Admin
      ↓  /admin/integration
Vercel app (Next.js)
      ↓  INSERT whatsapp_message_jobs / whatsapp_commands
Supabase (Postgres)
      ↓  claim_whatsapp_jobs()  ← FOR UPDATE SKIP LOCKED
THIS WORKER (Baileys, persistent volume)
      ↓
Member's WhatsApp
      ↑  status / QR written back to whatsapp_settings
Supabase → Vercel UI polls /api/admin/whatsapp/status
```

Supabase is the only channel between the two. Neither process calls the other
over HTTP.

## Deploy it

Any host with a **persistent disk** and a long-running Node process.

### Recommended: Docker (works on Railway, Fly, Render, any VPS)

A `Dockerfile` is included. Build context is the **`worker/`** directory.

```bash
cd worker
docker build -t corhaus-worker .
docker run -d --name corhaus-whatsapp-worker \
  -e SUPABASE_URL="https://xxxx.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="sb_secret_..." \
  -v corhaus-wa:/data \
  --restart unless-stopped \
  corhaus-worker
```

Or with the included compose file (creates the named volume for you):

```bash
cd worker
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... docker compose up -d --build
docker compose logs -f
```

The volume is the whole point: **without `/data` mounted, every restart needs a
new QR scan.**

### Fly.io

`fly.toml` is included and pre-wired for a Mumbai region with a 1 GB volume.

```bash
cd worker
fly volumes create whatsapp_session --size 1
fly secrets set SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
fly deploy
```

### Railway / Render

Point the service at this directory, build `npm ci && npm run build`, start
`npm start`, and attach a volume mounted at `/data` with `WA_SESSION_DIR=/data`.
Both can also build the `Dockerfile` directly.

### Plain VPS (systemd)

`corhaus-whatsapp-worker.service` is included. Copy it to
`/etc/systemd/system/`, put the secrets in `/etc/corhaus-whatsapp-worker.env`,
then `systemctl enable --now corhaus-whatsapp-worker`.

**Run exactly one replica.** Two replicas are safe for message *delivery* (SQL
`SKIP LOCKED` prevents double-sends) but each would hold its own WhatsApp socket,
and the two would fight over the pairing QR — the QR scans but never connects.

### Local development only

```bash
cd worker
npm install
npm run build
npm start
```

Reads the web app's root `.env.local` automatically (outside production). Useful
for testing, but remember the pairing lives in `worker/.wa-session` on your
laptop, so it is lost if you delete it.

### Steps

```bash
cd worker
npm install
npm run build
npm start
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Same project as the web app. Falls back to `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Worker writes `whatsapp_settings` and settles jobs. **Must be a new `sb_secret_…` key** — a legacy JWT fails with "Legacy API keys are disabled". Never expose to a browser. |
| `WA_SESSION_DIR` | no | Where Baileys stores credentials. **Must be a persistent volume.** Defaults to `./.wa-session`; the Dockerfile sets `/data`. |
| `WORKER_ID` | no | Label written to `whatsapp_settings.worker_id`. Defaults to `worker-<pid>`. |
| `NODE_ENV` | no | Set to `production` on the host. Outside production the worker also loads `worker/.env.local` and the repo-root `.env.local`. |

No WhatsApp credentials are stored in Postgres. Baileys keeps them in
`WA_SESSION_DIR` on the host's disk only.

## Behaviour

**Heartbeat.** Writes `whatsapp_settings.worker_heartbeat_at` every 30s. The
admin UI shows "worker offline" if it is older than 90s.

**Commands.** The web app appends rows to `whatsapp_commands`
(`CONNECT` / `RECONNECT` / `DISCONNECT`). The worker claims one every 3s with a
conditional update, so a second replica cannot execute it twice.

- `CONNECT` / `RECONNECT` — clears the credential directory, boots a socket, and
  publishes a pairing QR with a 25-second TTL. The UI polls
  `/api/admin/whatsapp/status` every 2.5s while a QR is pending, so a rotated QR
  appears without a manual refresh and an expired one is never displayed.
- `DISCONNECT` — logs out, deletes the credential files, sets
  `connection_status = DISCONNECTED`. Jobs stay `PENDING` and resume after
  reconnect.

**Authenticating.** WhatsApp stays unlinked until an admin scans the QR from
`/admin/integration` → Integration. `connected` is written only on a real
`connection.update === "open"` event, never optimistically.

**Delivering.** Every 5s the worker calls `claim_whatsapp_jobs()`, which marks
rows `PROCESSING` atomically with `FOR UPDATE SKIP LOCKED`. Before sending, each
job re-reads its booking and class: if either was cancelled, or the class was
deactivated, the job becomes `CANCELLED` instead of sending. On failure it backs
off 2m → 5m → 15m → 1h → 3h up to `max_send_attempts` (default 3), then becomes
`FAILED`. Test messages never auto-retry.

**Reminders.** A one-minute tick calls `enqueue_class_reminders()`, which selects
bookings whose class starts in exactly the next minute at
`class_date + class_time AT TIME ZONE 'Asia/Kolkata'` minus the configured
offset. Each reminder's idempotency key is
`reminder:<booking_id>:<class_date>`, so duplicate ticks cannot double-send.
The per-template `offset_minutes` wins over the global `whatsapp_settings`
default, which lets different event types differ.

**Restarts.** On boot the worker returns any stale `PROCESSING` rows to `PENDING`
and, if `connection_status` says it was connected, resumes the session from the
volume without needing a new QR scan.

## Operational commands

```bash
# Force a fresh pairing (from the host)
docker exec -it corhaus-worker rm -rf /app/.wa-session && restart
```

Or, preferably, press **Reconnect** in `/admin/integration` — it does this for
you and keeps the audit trail.

## Observability

Structured logs to stdout for: session start, QR issued, connection
state changes, command execution, job claim, send success, retry, permanent
failure, reminder ticks, and heartbeat. No tokens, session files or message
credentials are ever logged.

Failure counts, last message, last failure and worker heartbeat are visible under
**Integration Health** in the admin UI.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "worker offline" in the UI | Process not running, or volume lost | Check host logs; confirm `SUPABASE_*` env vars |
| QR never appears | Worker not running, or command not polled | Check `[worker] command: CONNECT` in logs |
| QR appears but scan fails | Session directory not persistent | Mount a volume at `WA_SESSION_DIR` |
| Messages stuck `PENDING` | Socket disconnected | Reconnect; check `connection_status` |
| Messages `FAILED` | Real send error | Read `error_message` in Message History |
| Two QR codes alternating | Two worker replicas | Reduce to one replica |
| QR scans but never connects | Two sockets on one credential directory, or a stale socket left open | Fixed in code (`disposeSocket` before every start). If it persists, check for a second replica and confirm `/data` is a real volume |