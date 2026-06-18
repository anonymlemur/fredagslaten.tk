# Migration Plan — 100% self-hosted + SQLite

Goal: turn Fredagslåten into a fully self-hostable app with a **SQLite** datastore that holds
**all past and present voting data**, keyed by **year + week** (current data is **2023**). The UI
stays as-is for now. **No breaking changes are made by this document** — it is the roadmap. Work
happens on branch `feat/localhost-sqlite-migration`; `main` holds the prod baseline (commit `807fda1`).

> Read `SPEC.md` first — it defines current behaviour and lists the quirks this plan addresses.

---

## 1. Goals & non-goals

**Goals**
- Replace the `node-json-db` flat-file store (`appData.json` + `backup/appDataWeek*.json`) with
  **one SQLite database**.
- Add a **`year`** dimension everywhere (today only `week` exists; all existing data = year **2023**).
- Make the app **self-contained**: no calls to `https://fredagslaten.tk`, no external SaaS, secrets
  via env/config, runnable on localhost/LAN with one command.
- Preserve **all historical weeks** (the 12 `appDataWeek*.json` snapshots) in the DB.

**Non-goals (for now)**
- No UI redesign (keep `public/` as-is; only repoint endpoints if needed).
- No auth overhaul (keep Spotify OAuth).
- No multi-tenancy.

## 2. Framework & library choices

| Concern        | Choice | Why |
|----------------|--------|-----|
| Runtime/server | **Keep Node + Express** | Already there; smallest blast radius. (Express 4 is in deps.) |
| DB driver      | **`better-sqlite3`** | Synchronous, fast, simple, well-maintained; ideal for a single-process self-hosted app. Avoids callback spaghetti. (Alt: Node 22's built-in `node:sqlite`, still experimental.) |
| Migrations     | **Plain SQL files** run by a tiny runner (or `better-sqlite3` `exec`) | No heavy ORM needed for this scale. |
| Config         | **`dotenv` + `.env`** | Move secrets out of `spotifyApiDetails.json`/`emailDetails.json`; one config surface. |
| Email          | **Keep `nodemailer`** (self-hosted SMTP) | Already used. Drop `mailtrap`. |
| Process mgmt   | `node app.js` (dev) → optional `pm2`/Windows service (later) | Out of scope for first pass. |

Remove still-unused deps along the way: `collect.js`, `mathjs`, `mailtrap` (see `REMOVED.md`).

## 3. Target SQLite schema

```sql
-- A round = one (year, week). status drives the submit/vote/closed phases.
CREATE TABLE weeks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  year       INTEGER NOT NULL,
  week_no    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'voting' | 'closed'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, week_no)
);

CREATE TABLE users (
  id           TEXT PRIMARY KEY,               -- Spotify user id
  display_name TEXT NOT NULL
);

-- One submission slot per user per week.
CREATE TABLE submissions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id   INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  user_id   TEXT    NOT NULL REFERENCES users(id),
  track_id  TEXT,                              -- Spotify track id, NULL/'' = not submitted
  UNIQUE (week_id, user_id)
);

-- One vote per voter per week (matches current behaviour: a single like that can move/toggle).
CREATE TABLE votes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id      INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  voter_id     TEXT    NOT NULL REFERENCES users(id),
  track_id     TEXT    NOT NULL,               -- the liked track
  submitter_id TEXT    REFERENCES users(id),   -- "who" submitted it
  is_like      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT,                            -- from existing `timestamp`
  UNIQUE (week_id, voter_id)
);

-- Resolved winner(s) per week (supports ties → multiple rows).
CREATE TABLE winners (
  week_id   INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  track_id  TEXT NOT NULL,
  likes     INTEGER NOT NULL,
  PRIMARY KEY (week_id, track_id)
);

CREATE INDEX idx_submissions_week ON submissions(week_id);
CREATE INDEX idx_votes_week ON votes(week_id);
```

Notes:
- `year` lives on `weeks`; every other table joins through `week_id`, so the whole model is
  year-aware automatically.
- The current JSON `votes` object is keyed by voter → maps cleanly to `votes.UNIQUE(week_id, voter_id)`.

## 4. Data migration (JSON → SQLite)

A one-off, **idempotent** script `scripts/migrate-json-to-sqlite.js`:
1. Create the DB + schema (`spotify-playlist-voting/data/fredagslaten.db`) if absent.
2. Seed `users` from the union of all `submitted-songs` across `appData.json` + every
   `backup/appDataWeek*.json` (id → display_name).
3. For each source file:
   - Derive `week_no` from `date.week` (or the `N` in the filename); set **`year = 2023`** for all
     existing data (override via `--year` flag for future imports).
   - Upsert a `weeks` row; insert `submissions` and `votes`.
   - For archived weeks, compute and store `winners` (max-likes, ties allowed) so history is queryable.
4. Print a summary (weeks, users, submissions, votes migrated) and leave the JSON files untouched.

**Verification:** a `scripts/verify-migration.js` that re-derives per-week like tallies from SQLite
and diffs them against the JSON source; must be zero-diff before the backend switches over.

## 5. Self-host hardening (the prod-URL problem)

`/update_playlist` currently calls `https://fredagslaten.tk/{get_likes,email,get_playlists}` and the
`redirect_uri` is port-coupled (see SPEC §10). Plan:
- Introduce `BASE_URL`, `PORT`, `HOST`, `SPOTIFY_REDIRECT_URI`, playlist IDs, and SMTP settings in
  `.env`; replace the hard-coded `fredagslaten.tk` URLs with `BASE_URL` (or call the functions
  directly instead of HTTP round-tripping to self).
- Default `BASE_URL=http://127.0.0.1:<PORT>`; document the Spotify dashboard redirect-URI requirement
  (loopback `127.0.0.1` only for plain http).

## 6. Phased, non-breaking steps

Each phase is independently committable and leaves the app runnable.

- **Phase 0 — Baseline & tooling (DONE)**
  - Prod committed on `main`; this branch created; `.gitignore`, docs, MCP config in place.
- **Phase 1 — DB scaffolding (additive)**
  - Add `better-sqlite3`; add `db/schema.sql`; add the migration + verify scripts. App still runs on JSON.
- **Phase 2 — Migrate data**
  - Run migration into `data/fredagslaten.db`; run verify; eyeball with the SQLite MCP. JSON remains the source of truth until Phase 3.
- **Phase 3 — Swap read paths**
  - Reimplement `get_tracks`/`get_old_tracks`/`get_likes`/`get_old_likes` against SQLite behind a
    `DATA_BACKEND` flag (`json|sqlite`); compare outputs; flip default to `sqlite`.
- **Phase 4 — Swap write paths**
  - Move `add_song`, `vote`, and `update_playlist` to SQLite; replace per-week JSON backup with DB rows.
- **Phase 5 — Self-host hardening**
  - `.env` config; remove `fredagslaten.tk` URLs; fix the `npm start` script (`node app.js`).
- **Phase 6 — Cleanup**
  - Remove `node-json-db` and unused deps; delete dead files (`app.js_old`, `ss.js`,
    `appData*.jsonOld`, etc.) in dev **and** prod (track in `REMOVED.md`).
- **Phase 7 — UI (later)**
  - Optional: vendor CDN assets for offline use; polish.

## 7. Risks & rollback

- **Data loss** — JSON files are the safety net through Phase 4 (kept on disk, gitignored). The DB is
  regenerable from them via the migration script. Take a copy of `data/*.db` before destructive steps.
- **Behaviour drift** — the verify script + `DATA_BACKEND` flag let us diff JSON vs SQLite before flipping.
- **Spotify login on LAN** — unchanged limitation (http allowed only for `127.0.0.1`); document, don't fight.
- **Rollback** — every phase is its own commit on this branch; `git revert`/branch reset restores the
  prior runnable state. `main` always holds the known-good prod baseline.

## 8. Tooling (MCP) — see `.mcp.json`

- **`memory`** (`@modelcontextprotocol/server-memory`) — the "memory palace": a local knowledge-graph
  store (`.mcp/memory.json`, gitignored) to persist migration decisions/notes across sessions.
- **`sqlite`** (`uvx mcp-server-sqlite` → `data/fredagslaten.db`) — inspect/query the migrated DB
  directly while building Phases 2–4.

> These are **project-scoped** servers. Claude Code will ask you to approve them, and they load after
> the next session reload/approval — they are not active the instant this file is written.
