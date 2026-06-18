# Plan — Fredagslåten rebuild (self-hosted, SQLite, Tinder-style UI)

Full rebuild of Fredagslåten into a **100% self-hosted** app: a Spotify-backed weekly vote where a
growing group of friends swipe **like / dislike** on each other's songs and the **most-liked song
wins**. All voting history (past + present) lives in **SQLite**, keyed by **year + week**.

This document is the roadmap. The legacy app stays in `spotify-playlist-voting/` as reference until
decommissioned. Work happens on `feat/localhost-sqlite-migration`; `main` holds the prod baseline
(`807fda1`). See `SPEC.md` for the legacy behaviour this replaces.

---

## 1. Goals & non-goals

**Goals**
- **Full rebuild** on a modern stack (see §2). Legacy Express + `node-json-db` is reference-only.
- **SQLite** datastore for ALL voting, **year + week** keyed (legacy data = year **2023**, week-only).
- **Tinder-style UI**: one card at a time, swipe/click **like vs. dislike**; **most likes wins**.
- **Adaptable / growing**: dynamic membership (invites), **nothing hardcoded** — no fixed roster, no
  magic vote thresholds (legacy hardcodes 8 users + "7").
- **Self-contained**: no `fredagslaten.tk` calls, no Firebase, no SaaS; config via `.env`.
- **Docker** for one-command run (local dev now; deployable later).

**Non-goals (now)**
- Public multi-group SaaS, mobile apps, real-time presence. Keep it single-group, single-instance.

## 2. Target stack (framework choice)

Chosen by "use whatever you know best", optimised for a lean self-hosted single instance with a
swipe UI:

| Concern   | Choice | Why |
|-----------|--------|-----|
| Framework | **SvelteKit (Svelte 5)** | One process = SSR UI **and** API routes; tiny runtime; first-class transitions for the swipe deck. |
| DB        | **better-sqlite3** | Synchronous, fast, zero-config; perfect for a single-instance self-hosted app. |
| Styling   | **Tailwind CSS** | Fast, consistent, themeable (dark/light) for the new UI. |
| Auth      | **Spotify OAuth (Authorization Code)** handled server-side; session cookie. |
| Config    | **`.env`** via SvelteKit `$env` | One config surface; secrets out of source. |
| Container | **Docker + docker-compose** | Reproducible run; volume-mount the SQLite file + `.env`. |
| Migration | **Node script** (`scripts/migrate-legacy.js`) using better-sqlite3 |

App lives in a new dir (proposed `app/`); legacy untouched until Phase 6.

## 3. Architecture

```
app/                         # SvelteKit project
  src/routes/
    +page.svelte             # the swipe deck (vote on this week's songs)
    submit/+page.svelte      # add/replace your song
    history/+page.svelte     # past weeks (by year+week)
    admin/+page.svelte       # roster, invites, close week, settings
    auth/spotify/+server.ts        # OAuth start
    auth/spotify/callback/+server  # OAuth callback → session
    api/songs/+server.ts           # GET week songs / POST submit
    api/votes/+server.ts           # POST like|dislike (one per song per user)
    api/weeks/+server.ts           # current week, close week, history
    api/members/+server.ts         # list/invite/approve members
  src/lib/server/db.ts       # better-sqlite3 connection + queries
  src/lib/server/spotify.ts  # token mgmt + Web API helpers
  data/fredagslaten.db       # SQLite (gitignored)
  db/schema.sql              # schema + indexes
  scripts/migrate-legacy.js  # JSON → SQLite (year=2023)
Dockerfile  docker-compose.yml  .env.example
```

Server-side holds Spotify tokens (no tokens in the URL hash like legacy). API routes enforce
membership and week phase.

## 4. Data model (SQLite, year-aware, dynamic)

```sql
CREATE TABLE settings (              -- adaptable config, no hardcoding
  key TEXT PRIMARY KEY, value TEXT
);  -- e.g. songs_per_user=1, vote_open_day=5 (Fri), tz, playlist ids

CREATE TABLE users (
  id           TEXT PRIMARY KEY,     -- Spotify user id
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',   -- 'member' | 'admin'
  status       TEXT NOT NULL DEFAULT 'active',   -- 'invited' | 'active' | 'removed'
  joined_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE invites (               -- growing roster
  email TEXT PRIMARY KEY, invited_by TEXT, created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL, week_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'voting' | 'closed'
  UNIQUE (year, week_no)
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  track_id TEXT,
  UNIQUE (week_id, user_id)
);

CREATE TABLE votes (                  -- Tinder: like/dislike, one vote per user per SONG
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES users(id),
  track_id TEXT NOT NULL,
  submitter_id TEXT REFERENCES users(id),
  is_like INTEGER NOT NULL,           -- 1 like / 0 dislike
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (week_id, voter_id, track_id)
);

CREATE TABLE winners (
  week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL, likes INTEGER NOT NULL, dislikes INTEGER NOT NULL,
  PRIMARY KEY (week_id, track_id)
);
```

> **Voting model change vs legacy:** legacy stored a single "like" per voter per week. Tinder-style
> means **one like/dislike per voter per song** (`UNIQUE(week_id, voter_id, track_id)`). **Winner =
> most likes** (tie-break: fewest dislikes, then earliest submission). Adaptability comes from
> `settings` + DB-driven roster — no hardcoded user list or quorum.

## 5. UX — the week lifecycle & swipe deck

- **Submit phase** (`status=open`): each active member adds one song (config `songs_per_user`).
- **Voting phase** (`status=voting`, e.g. Friday or when all submitted): the **deck** shows one song
  card (Spotify embed); swipe right/tap ♥ = like, swipe left/tap ✕ = dislike; card animates out, next
  appears. You can't vote your own song. Progress "n / total".
- **Result** (`status=closed`): winner(s) by most likes; optional Spotify playlist update + email.
- **History**: browse by **year → week**, see each week's songs, like/dislike tallies, and winner.

## 6. Legacy data migration (JSON → SQLite, 2023)

`scripts/migrate-legacy.js` (idempotent): seed `users` from all legacy `submitted-songs`; for
`appData.json` + each `backup/appDataWeek*.json`, upsert a `weeks` row with **year=2023** and the
file's week number, then insert `submissions` and `votes` (legacy single-like → `is_like=1`).
Compute `winners` per archived week. A `verify-legacy.js` diffs per-week tallies SQLite-vs-JSON
(must be zero-diff). Legacy JSON stays on disk (gitignored) as the safety net.

## 7. Adaptability (built in, not bolted on)

- Roster from `users`/`invites` tables — invite by email in admin; new Spotify logins land as
  `invited`/pending until an admin approves.
- All tunables in `settings` (songs per user, voting-open rule, timezone, playlist ids, base url).
- No magic numbers; "all submitted" is computed from active members, not a constant.

## 8. Docker & deployment

- **`Dockerfile`** — multi-stage: build SvelteKit (`adapter-node`), run the Node server.
- **`docker-compose.yml`** — one service; volume-mount `./data` (SQLite) and `.env`; map the port.
- `.env.example` documents: `PORT`, `ORIGIN`/`BASE_URL`, `SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI`,
  SMTP, playlist ids. Local dev: `npm run dev`; container: `docker compose up`.
- Spotify redirect URI must match the dashboard; loopback `127.0.0.1` for local http
  (see [[spotify-login-use-loopback-ip]] — LAN/remote needs HTTPS or a tunnel).

## 9. Phased roadmap (each phase independently runnable & committable)

- **Phase 0 — Foundations (DONE):** prod baseline on `main`; branch; `.gitignore`/docs/MCP; memory palace.
- **Phase 1 — Scaffold:** `app/` SvelteKit + Tailwind + better-sqlite3; `db/schema.sql`; health route. App boots, empty DB.
- **Phase 2 — Migrate legacy data:** migration + verify scripts; load 2023 weeks into SQLite; inspect via the SQLite MCP.
- **Phase 3 — Auth + read APIs:** server-side Spotify OAuth + session; `GET` current week / songs / history from SQLite.
- **Phase 4 — Voting + submit (Tinder UI):** swipe deck, like/dislike, submit/replace song; winner calc.
- **Phase 5 — Admin + adaptability:** roster/invites/approval, `settings`, close-week (playlist update + email), no hardcoding.
- **Phase 6 — Docker:** Dockerfile + compose + `.env.example`; one-command run.
- **Phase 7 — Cutover & cleanup:** make `app/` the entrypoint; remove legacy `spotify-playlist-voting/` and unused deps (log in `REMOVED.md`).
- **Phase 8 — Polish (later):** theming, animations, vendor any CDN assets for offline.

## 10. Risks & rollback

- **Data**: legacy JSON kept on disk through Phase 7; DB regenerable via migration; back up `data/*.db`
  before destructive steps.
- **Behaviour drift**: verify script diffs SQLite vs JSON before trusting the DB.
- **Spotify local login**: loopback-only for http (documented).
- **Rollback**: each phase is its own commit; `main` always holds known-good prod.

## 11. Tooling (MCP — see `.mcp.json`)

- **memory** ("memory palace") — persists rebuild decisions across sessions (mirrored in the file
  memory store until the MCP server is approved/loaded).
- **sqlite** (`uvx mcp-server-sqlite` → `app/data/fredagslaten.db` once it exists) — inspect/query the
  migrated DB while building Phases 2–5. *(Update `--db-path` to the new `app/data` location when the
  SvelteKit project is scaffolded.)*

> MCP servers are project-scoped; approve them and reload the session to activate — they are not live
> the moment this file is written.
