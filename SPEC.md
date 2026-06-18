# Fredagslåten — Functional Specification (as-is)

This documents **exactly what the app does today**, derived from `spotify-playlist-voting/app.js`,
the data files, `public/index.html`, and `template.hbs`. It is intentionally descriptive of the
*current* behaviour (including quirks/bugs), so it can serve as the baseline for a rebase.

---

## 1. Purpose & concept

A weekly group ritual: a fixed circle of friends each nominate **one Spotify song per week**.
Mid/late week they **vote** (one "like" each) on the others' songs. At week's end an admin
**closes the week**: the winner(s) are added to a shared Spotify playlist, every entry is added
to a second "all submissions" playlist, the week is archived, the round resets, and a summary
email is sent.

## 2. Actors

- **Members** — a fixed set identified by Spotify user id. Current roster (from `appData.json`):
  Frej (`1157601814`), Linus (`cgt594qxc32yf0sf14jf5gra2`), Lukas (`countes`), Joel (`jagestedt`),
  Jonas (`jonas.eagle8`), Oskar (`oskar326`), Adrian (`day557`), Edvin (`4js5qnqn0mhvir39io8d2dhzw`).
- **Admin** — whoever triggers the weekly close-out (`/update_playlist`) with a Spotify token that
  can modify the target playlists. There is no role system; it's purely "who has the playlist-edit token".

## 3. The weekly state machine

State lives in `appData.json`:
- `submitted-songs[userId]` = `{ trackId, display_name, userId }` (one slot per member; `trackId: ""` = not submitted)
- `votes[voterUserId]` = a **single** vote object (see §6) — **one vote per member per week**
- `date.week` = the ISO week number this round "belongs to"

Phase gating is computed per-request from the **server's local date** and `date.week`
(`weekNumber()` is an ISO-8601 week calculator). Let `today = current ISO week`, and
`submittedCount = number of members whose trackId is non-empty`.

| Phase            | Condition (per current `/get_tracks` logic)                          |
|------------------|----------------------------------------------------------------------|
| **Can submit**   | `today == date.week`                                                 |
| **Can view songs** (`canView`) | `submittedCount == 7` **OR** (`today == date.week` AND day is **Thu or Fri**) |
| **Can vote** (`canVote`)       | `submittedCount == 7` **OR** (`today == date.week` AND day is **Fri**)       |

> Quirks: the threshold is hard-coded to **7** even though the roster is **8** — if all 8 submit,
> `submittedCount == 8` and the early-open no longer triggers (voting then depends only on it being
> Friday). Gating depends on the **server's** clock/timezone.

Closing the week (admin) advances `date.week` to `today+1` and clears songs/votes (see §7).

## 4. Authentication (Spotify OAuth, implicit-ish)

- **`GET /login`** — sets a random `spotify_auth_state` cookie and redirects to Spotify's
  `/authorize` with scopes:
  `user-read-private playlist-read-private playlist-modify-public playlist-read-collaborative playlist-modify-private`.
  - `redirect_uri` selection: if `PORT == 8888` → hard-coded `https://fredagslaten.tk/callback`;
    otherwise → `callback_url` from `spotifyApiDetails.json`.
- **`GET /callback`** — verifies `state` matches the cookie, exchanges the `code` for
  `access_token` + `refresh_token`, then redirects to `/#access_token=…&refresh_token=…`
  (tokens delivered to the browser via the **URL hash**; the client reads them there).
  - State mismatch → `/#error=state_mismatch`; token exchange failure → `/#error=invalid_token`.
- **`GET /refresh_token?refresh_token=…`** — returns `{ access_token }` JSON.

There is **no server-side session for members**. The browser holds the Spotify token and sends it
to endpoints that need it (e.g. `/add_song`).

## 5. HTTP API — complete behaviour

### `POST /get_tracks`  — body `{ seed }`
Reads `appData.json`. For every member's slot, computes: `likes` (count of votes whose `trackId`
matches), `users` (voter ids), `colorValue`/`oppositeColorValue` (random hue for empty-slot styling),
`text` ("Lägg till låt" / "Ändra låt"), plus `canSubmit`/`canView`/`canVote` per §3. Returns
`{ items: <shuffled tracks>, backup: [{weekNumber}…] }`. The shuffle is **deterministic by `seed`**
(seedrandom), so order is stable for a given seed. `backup` is the list of archived weeks found in
`backup/` (`appDataWeek<N>.json`). If the `backup/` dir can't be read, returns `{ items }` only.

### `POST /get_old_tracks` — body `{ weekNumber }`
Same shape as `/get_tracks` but reads from `backup/appDataWeek<weekNumber>.json` and marks each
track `old: true` (so the template shows the submitter name + vote counts instead of vote buttons).

### `POST /vote` — body `{ userId, who, trackId, like, displayName, imageURI }`
- Rejects if `userId` is empty **or** `userId == who` → `"Du kan inte rösta på din egen låt!"`
  (you can't vote for your own song).
- The vote is keyed by the **voter** (`votes[userId]`), a single object. Therefore **each member has
  exactly one active like per week**: voting a different song **replaces** the previous like.
- If the existing vote is for the **same** `trackId` → it's **deleted** (toggle off) →
  `"Röst borttagen"`. Otherwise the new vote is stored → `"ok"`.

### `POST /add_song` — body `{ userId, trackId, accessToken }`
- `trackId == "delete"` → clears that member's `trackId` and deletes any votes cast **for** their
  song (`votes[*].who == userId`) → `"Låt borttagen"`.
- Otherwise normalises the input to a bare track id, accepting:
  `https://open.spotify.com/track/<id>`, a trailing `?…` query, `spotify:track:<id>`, and
  `https://spotify.link/<…>` (followed by fetching the page and parsing the real link out of the HTML).
- **De-dupe:** loads `playlists.json`, gathers all track ids already in the two playlists; if the new
  track is among them → `"Låten är redan tillagd i listan"` (already used before).
- **Validate:** `GET https://api.spotify.com/v1/tracks/<id>` with the member's `accessToken`; non-200
  → `"Låten är inte giltig"`. On success stores the id → `"Sång tillagd"`.

### `GET /get_playlists` — Authorization: `<spotify token>`, body `{ ids:[winnerId, allId] }`
Fetches both playlists' track ids from Spotify, writes them to `playlists.json`, and returns them.
(Feeds the `/add_song` de-dupe and the close-out.)

### `POST /get_likes` / `POST /get_old_likes` — `{ weekNumber }`
Return each song with `likes`, `users`, and `displayNames` (voter display names) for the current /
archived week respectively. Used by the client to render vote tallies.

### `POST /update_playlist` — Authorization: `<admin spotify token>`  — **weekly close-out**
1. Backs up the current `appData.json` to `backup/appDataWeek<currentWeek>.json`.
2. Targets two hard-coded playlists: winner `6CiGXt6v60opLz0v45JI5i` ("Fredagslåten 2 Electric
   boogaloo") and all-entries `4wBuklcIoGf4ZVXRPNzQ2r` ("Alla bidrag").
3. Pulls current likes, sorts desc, selects **winner(s)** = every song tied at the max like count.
4. Adds **all** non-empty entries to the all-entries playlist and the **winner(s)** to the winner
   playlist (Spotify `POST …/playlists/<id>/tracks`).
5. `date.week` → `today + 1`; clears every member's `trackId`; deletes all votes.
6. Fetches winner track metadata and emails a Swedish summary ("Vinnare vecka N, med X röster…")
   to a hard-coded recipient list, with links to the playlist.

### `POST /email` — body `{ email, subject, message }`
Sends HTML mail via nodemailer (SMTP from `emailDetails.json`), `from: "Fredagslåten <noreply@fredagslaten.tk>"`.

### Static
Everything under `public/` is served at `/` (Express static). `/` returns `public/index.html`.

## 6. Data schemas

**`appData.json` (live, current week)** and **`backup/appDataWeek<N>.json`** (archived) share:
```jsonc
{
  "submitted-songs": { "<userId>": { "trackId": "<id|''>", "display_name": "...", "userId": "..." } },
  "votes":           { "<voterId>": { "trackId": "...", "who": "<submitterId>", "like": true,
                                      "displayName": "...", "imageURI": "...", "timestamp": 169… } },
  "date": { "week": <ISO week number> }
}
```
**`playlists.json`** — cached `[ {id, tracks:{items:[{track:{id}}]}}, … ]` for the two playlists.
**`spotifyApiDetails.json`** — `{ client_id, client_secret, callback_url }`.
**`emailDetails.json`** — `{ host, port, secure, user, pass }`.

## 7. Client (browser) behaviour

`public/index.html` loads `js/index.js` (bundled jQuery + Handlebars logic) cache-busted per load.
Observed behaviour:
- Shows **"Logga in med Spotify"** (`/login`) when logged out; on return reads the token from the URL
  hash and switches to the logged-in view.
- Calls `/get_tracks` (with a seed) and renders song cards via the `selected-playlist-tracks-template`
  Handlebars template: each submitted song is a **Spotify embed iframe**; a **heart button** appears
  when `canVote`; archived weeks render with submitter name + vote counts.
- Add/replace/delete your song (→ `/add_song`), like a song (→ `/vote`), browse past weeks via a
  **calendar dropdown** (→ `/get_old_tracks`), and a **logout** button.
- Two playlist embeds are shown: the winners playlist and "Alla bidrag".

## 8. Reminders & scheduling

- `reminder.sh` / `reminder_test.sh` — a `curl` that POSTs to `/email` with a "don't forget to vote"
  message to the member list. Intended to be run by an **external scheduler (cron)**; the app itself
  has **no built-in timer** — week close-out is **manual** via `/update_playlist`.

## 9. External dependencies (relevant to "fully self-hosted")

- **Spotify** — login (OAuth) + Web API (track validation, playlist edits) + embed iframes. Core; not removable.
- **CDNs in `index.html`** — Bootstrap 3, jQuery, Handlebars, seedrandom, Font Awesome are loaded from
  external CDNs. To be fully self-hosted/offline these should be vendored into `public/`.
- **SMTP** — any mail server via `emailDetails.json`.
- **Firebase** — **removed** (was unused; deps + `firebaseServiceAccountKey.json` deleted).

## 10. Known quirks / things to fix on rebase

1. **Hard-coded production URLs inside `/update_playlist`** — it calls `https://fredagslaten.tk/get_likes`,
   `/email`, and `/get_playlists` instead of the local server, so the close-out talks to prod, not
   this instance. Must be made relative/configurable for self-hosting.
2. **`redirect_uri` is port-coupled** — `8888` forces the prod callback; any other port uses
   `callback_url`. Spotify only allows non-HTTPS redirect URIs for the **`127.0.0.1` loopback**, so
   browser login from other LAN devices over plain `http://<lan-ip>` is rejected by Spotify.
3. **`npm start` is broken** (`node server`; no `server.js`) — entry point is `node app.js`.
4. **Vote threshold hard-coded to 7** while the roster is 8.
5. **`node-json-db`** flat files are not concurrency-safe; `request` is deprecated; secrets are
   plaintext JSON; `engines` claims Node 6.10 (runs on Node 22).
6. **Dead/dev leftovers** in the tree: `app.js.save`, `app.js_old`, `appData.jsonOld`,
   `appData copy.json`, `ss.js`, and `public/{html1,friskel,adrian_meme}`.
7. **Unused deps** still listed: `collect.js`, `mathjs`, `mailtrap` (only `nodemailer` is used for mail).

## 11. Running it (current dev setup)

```bash
cd spotify-playlist-voting
npm install
PORT=5000 node app.js          # binds 0.0.0.0:5000 (all interfaces)
```
- Same machine: http://127.0.0.1:5000  (use 127.0.0.1 so the OAuth state cookie sticks; Spotify login works here)
- LAN: http://172.19.141.189:5000  (viewable from other devices; Spotify **login** won't complete there — see quirk #2)
```

Open the inbound port for LAN devices (run once in an **Admin** PowerShell):

```powershell
New-NetFirewallRule -DisplayName 'Fredagslaten 5000' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5000 -Profile Any
```
