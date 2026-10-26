# openGym MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) bridge that lets an external LLM
application (Claude Desktop, Cursor, Cline, Continue, etc.) read your openGym profile —
routines, workouts, body-weight log, estimated 1RMs, and muscle balance — directly from your
self-hosted `./data` directory, and log a workout you describe to it.

It runs one of two ways: locally, as a stdio process the LLM client spawns (no container), or as
the opt-in `mcp` container of a self-hosted instance, reachable at `https://<your host>/mcp`, where
the client signs in through the app (see [Self-hosted, over HTTPS](#self-hosted-over-https)). The
read tools read the same `state-<uid>.json` files the openGym api already writes, and the LLM
never sees passkeys, VAPID keys, or session secrets. The one write tool, `log_workout`, is
stdio-only and off until you pair it with your server (see [Logging workouts](#logging-workouts));
the container is read-only.

The numbers it answers with are computed by the **same pure functions the React UI uses**
(`frontend/src/lib/*.js`) — `estimate1RM`, `loadOfWorkouts`, `effectiveRoutine`, etc. — so a
"what's my bench 1RM?" answer matches the Stats screen exactly.

> Phase 1 of a multi-phase plan, plus the first write tool and the HTTPS container. See
> **Roadmap** below.

## Quick start

### 1. Install

```bash
cd mcp
npm install
```

### 2. Point it at your data

The MCP server reads the same `./data` directory `docker compose up` creates. Pick the profile
to answer for — its user id is in `./data/db.json` under `users[].id`:

```bash
# single-user instance (the common self-hosted case) — auto-detected:
node src/index.js

# multi-user instance, or just to be explicit:
OPENGYM_UID=<your-uid> OPENGYM_DATA=/path/to/openGym/data node src/index.js
```

### 3. Register with your LLM client

Add the server to your LLM client's MCP config. For Claude Desktop, edit
`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "opengym": {
      "command": "node",
      "args": ["/absolute/path/to/openGym/mcp/src/index.js"],
      "env": {
        "OPENGYM_DATA": "/absolute/path/to/openGym/data",
        "OPENGYM_UID": "<your-uid>"   // optional — auto-detected if you have one profile
      }
    }
  }
}
```

For Cursor and other MCP-compatible clients, see the client's MCP docs — the same `command` +
`args` + `env` shape is what every stdio MCP server expects.

Restart the client; you should see the openGym tools appear with "serving profile \<name\>" on
the server's stderr.

## Self-hosted, over HTTPS

For an instance run with `docker compose`, the `mcp` service serves the same tools over
Streamable HTTP. It mounts `./data` read-only, and the web container proxies `/mcp` to it, so the
endpoint is on the address the app already has: a Cloudflare tunnel or reverse proxy pointed at
the web container carries it with no change, and nothing new is opened on the host.

### 1. Turn it on

Add one line to `.env`, then `docker compose up -d`:

```bash
COMPOSE_PROFILES=mcp
```

There is no secret to generate. `ORIGIN` (already set for passkeys) is where clients are sent to
sign in.

### 2. Connect a client

Give the client `https://gym.example.com/mcp`. For example:

```bash
claude mcp add --transport http opengym https://gym.example.com/mcp
```

In apps that take a custom connector, paste the same URL. The client opens the app in a browser;
you sign in as usual (passkey, or password where the instance offers it) and approve the client
on the **Connect** screen. From then on it reads that profile only, for as long as it keeps
refreshing its token (90 days at most between uses).

Every person on a shared instance connects their own client and sees only their own data. To
disconnect every client of a profile, use **Sign out everywhere** in Settings; a new password, an
admin disabling the profile, or deleting it does the same. Each connection is recorded in the
admin activity log as "Connected an AI app".

How it works: the api is a small OAuth 2.1 authorization server (`api/oauth.js`, discovery at
`/.well-known/oauth-authorization-server`): dynamic client registration, PKCE (S256) only,
one-hour access tokens and rotating refresh tokens, stored in `db.json` as hashes. This server
checks the access token against that file and answers for the profile it belongs to.

### If it does not connect

- **The client says it found no sign-in settings.** The api must know the public address:
  `ORIGIN` (and `RP_ID`) in the environment the *api* container gets, not only somewhere compose
  reads it. Check with
  `curl https://gym.example.com/.well-known/oauth-authorization-server`: every address in it
  must start with your `ORIGIN`, never `http://localhost:8080`.
- **`/mcp` answers 502.** The `mcp` container is not running: `COMPOSE_PROFILES=mcp` is missing,
  or check `docker compose logs mcp`.
- **An access gate in front of the site** (a login wall at the tunnel or proxy) has to let
  `/mcp`, `/.well-known/oauth-*`, `/api/oauth/register` and `/api/oauth/token` through: AI clients
  call them without a browser.
- **Under a subpath** (`BASE_PATH`) the discovery documents still have to be reachable at the
  root of the host (`/.well-known/oauth-*`), which a proxy that only forwards the prefix does not
  do.
- **Kubernetes:** the manifests in `kubernetes/` do not include the `mcp` container yet.

## Tools

Nine read-only tools, and one that writes:

| Tool | What it answers |
|---|---|
| `list_routines` | What routines are saved in my profile? (names + exercise counts) |
| `get_routine` | What does the Push Day routine prescribe? (sets/reps/weight and rest per exercise) |
| `preview_session` | What will the app actually put on screen when I start this routine — after the progression policy and my history have overridden the plan? |
| `get_week_plan` | What's planned when: the next seven days with their routines and how each was decided (coach week, a pinned session, an override, the weekday plan), the current coach week when one is running, and the weekday table. |
| `list_workouts` | Recent sessions — newest first, with dates, sets done/planned, volume, duration, PRs. |
| `get_workout` | Full set-by-set breakdown of one session, by `workout_id` or by date. On a day with two sessions the date alone returns both ids to pick from rather than guessing at one. |
| `get_bodyweight` | Weigh-ins with the latest weight, the goal line, and deltas vs goal. |
| `estimate_1rm` | All-time best 1RM for an exercise + the trend, or a PR table across all exercises. |
| `muscle_balance` | Which muscles I've trained this week/month/all-time, ranked + which I've neglected. |
| `log_workout` | *Writes.* "I did dumbbell curls, 12 kg, 12/12/10" → a logged session in your history, on every device. Needs pairing: [Logging workouts](#logging-workouts). |

`get_routine` and `preview_session` answer two different questions, and confusing them is the
easiest way for a coach to give wrong advice. `get_routine` reports what the routine *stores*.
`preview_session` reports what the athlete will actually *see*: a routine holding "squat 3×8 @
60 kg" opens at 75 kg if the policy progressed or deloaded from that routine's last logged
session. The routine's own weight is the last fallback the session builder consults, not the
first; its reps hold unless a policy that moves reps moved them, or the profile starts planned
sessions from the last session (`starts_from`). Ask `preview_session` before naming a weight.

Each tool returns JSON the LLM can format as it likes; structured fields (sets, dates, levels)
are pre-formatted into human-readable labels in `src/labels.js` so the LLM doesn't need to
re-interpret them.

## Logging workouts

`log_workout` lets you tell your LLM what you did instead of tapping it in:

> "Log today: dumbbell curls, 12 kg, three sets of 12 except the last was 10. Then planks, 3 × 60 s."

The LLM turns that into exercises and sets; the tool matches the exercises against your library,
builds the workout the way the app's Finish button does (PR badges, the next suggested weight,
warm-ups kept out of volume) and saves it through your openGym server, so every signed-in
device shows it within half a minute. Asking for the same thing twice logs it once.

Exercise names are matched the way a CSV import matches them. A common name resolves to the
library's default variant ("shoulder press" is the barbell one, "leg press" the 45° sled), and the
reply shows what it was matched to so the LLM can check with you. What it will not do is pick
between two entries: "lever chest press" is two in the library, and a name like that, or one that
matches nothing, comes back as a question with candidates. It only creates one of your own
exercises when you confirm the library has none.

It saves at most 20 workouts an hour (a forgotten week is fine, a client stuck in a loop is
not), and each save leaves one line on the MCP server's stderr with the workout's id, day and
the server revision it landed at. Workouts it logged have ids starting with `mw`.

### Pairing

Writes go through the api rather than straight into `./data`, because the api is what keeps a
phone's sync and this write from overwriting each other. So the MCP server needs your server's
address and a sign-in:

1. In the app, signed in as the profile to log into: **Settings → Account → Pair the mobile app**.
   It shows a one-time code (valid five minutes).
2. Turn the code into a token:

   ```bash
   node mcp/scripts/pair.mjs https://gym.example.com ABCD-1234
   ```

3. Add both to the MCP server's `env` in your client config:

   ```jsonc
   "env": {
     "OPENGYM_DATA": "/absolute/path/to/openGym/data",
     "OPENGYM_URL": "https://gym.example.com",
     "OPENGYM_TOKEN": "<the token pair.mjs printed>"
   }
   ```

Things to know about that token:

- It is a **full sign-in to your profile**, the same kind the paired phone app holds, not a
  workout-only key. Your client's config file holds it in plain text; treat it like a password.
- `OPENGYM_URL` has to be `https://` (plain `http://` only to `localhost`), so it never crosses a
  network in the clear.
- It lasts `SESSION_DAYS` (90 days by default). **Sign out everywhere** in Settings ends it at
  once. Either way `log_workout` then says the token was not accepted: pair again.
- Pairing again gets you a new token but does **not** end the old one. To retire a token you
  think has leaked, use Sign out everywhere (which also disconnects paired phones).
- If the MCP server also reads a `./data` directory, the token has to belong to the same profile
  (`OPENGYM_UID`); a token for another one is refused. The server can be remote: without
  `OPENGYM_DATA` the read tools have nothing to read, but `log_workout` still works.

### What it does not do (yet)

- Cardio by time and speed, supersets, per-side sets. Log those in the app.
- Edit or delete a workout. Fix a mistake in the app's History.
- Complete a routine's session. A logged workout is freestyle: it counts in history, stats,
  1RM, PRs and the muscle map, and like any freestyle session it can inform a routine that has
  no history of its own, but it does not tick off a planned day or a coach week's session.

## How it reuses the training logic

The MCP server imports the training helpers under `frontend/src/lib/` directly as Node ESM
and calls the same functions the React UI does (`history.js`, `onerm.js`, `muscles.js`,
`exercises.js`). The numbers it returns match what the Stats screen shows, because they are
the same code.

The one lib file that wasn't Node-safe was `i18n.js` (Vite's `import.meta.glob` at module
top level) — split into `i18n-core.js` (pure, Node-safe) + `i18n.js` (Vite/React bits,
re-exports from core). `exercises.js` got a one-line `import.meta.env || {}` guard. No new
dependencies landed in `frontend/`, no public exports changed.

## Design constraints honoured

- **One runtime dependency beyond the MCP SDK:** none. No database driver, no HTTP framework.
- **No container unless you ask for one.** stdio is spawned by the LLM client; the `mcp`
  compose service only starts with `COMPOSE_PROFILES=mcp`.
- **No new auth.** The read tools' boundary over stdio is the filesystem — same as
  `docker compose` running on the user's box. Over HTTP, OAuth through the app's own sign-in; no
  new kind of account. `log_workout` uses the paired-session token the phone app already uses; no
  new kind of credential, no new api route. No passkey material, VAPID keys, or session secrets
  ever cross either.
- **No telemetry.** The read tools make no network call. `log_workout` talks to your own
  openGym server and nothing else. Over stdio the process exits when the LLM client disconnects.

## Tests

```bash
cd mcp && npm test
```

The tool cases seed state from `frontend/src/lib/demoSeed.js` (the same deterministic fixture
the public demo runs on). Pins JSON shape and the user-facing edge cases: rest-day override,
missing routine, zero-workout history, no synced state, superset links, three 1RM formulas.
"Today" is pinned via `vi.useFakeTimers({ now: ..., toFake: ['Date'] })` so date-dependent
tools see consistent values regardless of when the suite runs. The pure lib functions have
their own 92 tests in `frontend/src/lib/*.test.js`. `test/http.test.js` covers the HTTP transport
with tokens issued by `api/oauth.js`: two profiles kept apart, and every way a grant ends.

`log_workout` has two more files: `write-tools.test.js` against a stand-in api (conflicts,
retries, a rejected token, dry runs, duplicates), and `log-workout.e2e.test.js` against the real
`api/server.js` on a temp data directory, which needs `npm ci` in `api/` (it skips without it on
a laptop and fails under `CI`). The workout it builds is tested in
`frontend/src/lib/log-workout.test.js`.

## Roadmap

- **Done (Phase 1):** read-only stdio, 8 tools, direct `./data` access.
- **Done (Phase 1.5):** `preview_session` — the policy's next prescription, the opening set
  rows it produces, and which of plan / confirmed weight / history each number came from.
- **Phase 2:** read+write over stdio, in pieces (#116). Writes go through the api's own
  `PUT /api/data` with the revision they read, as a paired device does, rather than into
  `state-<uid>.json` directly: the api is the one writer of that file, and its sync stamps are
  what keep a write from being undone by the next phone that merges.
  - **Done:** `log_workout`, on the paired-session token (`scripts/pair.mjs`).
  - Next: `add_bodyweight`, `edit_routine`, `assign_weekday`, `override_day`, log corrections.
- **Done (Phase 3):** Streamable HTTP transport (`src/http.js`, stateless), opt-in `mcp`
  container proxied at `/mcp`, OAuth through the app's sign-in (`api/oauth.js`). It serves the
  read tools only; `log_workout` stays on stdio.

## License

AGPL-3.0-or-later, same as openGym.
