# Fredagslåten

A small web app a group of friends use to pick a weekly "Friday song" (*fredagslåt*).
Each week everyone submits one Spotify track, then everyone votes on the others'
songs. The most-liked track wins, gets added to a shared Spotify playlist, and a
winner-announcement email goes out. Originally hosted at `fredagslaten.tk`.

## How it works (weekly cycle)

1. **Submit** – Each member logs in with Spotify and submits **one track for the
   week** (paste a Spotify track link/URI). They can change or remove it while the
   submission window for the current week is open.
2. **Vote** – When voting opens (Thursday/Friday, or once everyone has submitted),
   members **"like" (heart) each other's songs**. One like per person, and you
   **can't vote for your own** song. Songs are shown as embedded Spotify players.
3. **Close out the week** (`/update_playlist`) – The app:
   - tallies likes and picks the **winner(s)** (most likes; ties = shared winners),
   - adds the winner to the main playlist *"Fredagslåten 2 Electric boogaloo"* and
     **all** submitted tracks to the *"Alla bidrag"* playlist,
   - **archives** the week to `backup/appDataWeek<N>.json`,
   - **advances** `date.week` to the next week and clears songs/votes,
   - **emails** all members a summary of the winner(s).
4. **Reminders** – `reminder.sh` POSTs to `/email` to nudge people to vote
   (intended to be run on a schedule / cron).

Past weeks can be browsed in the UI via a "Vecka N" dropdown, served from the
`backup/` snapshots.

## Tech stack

- **Backend:** Node.js + **Express** (`spotify-playlist-voting/app.js`)
- **Storage:** [`node-json-db`](https://github.com/Belphemur/node-json-db) — flat
  JSON files, no real database
- **Frontend:** static `public/` — vanilla JS + **jQuery** + **Handlebars**
  templates; Bootstrap 3 + Font Awesome for styling
- **Spotify:** OAuth login + Web API (track validation, playlist updates) and
  embed iframes for playback
- **Email:** **nodemailer** (SMTP)
- **Hosting:** IIS / Azure via `iisnode` (`Web.config`)

> Note: `package.json` lists `firebase`/`firebase-admin`/`mathjs`/`collect.js`,
> but `app.js` does **not** use them — they're leftovers. It also declares
> `engines: node ~6.10.x`; it runs fine on modern Node (tested on Node 22).

## Project layout

```
spotify-playlist-voting/
├── app.js                  # Express server — all routes/logic
├── public/                 # static frontend
│   ├── index.html          # login + song grid + playlist embeds
│   ├── js/index.js         # bundled client logic (jQuery/Handlebars)
│   ├── css/ assets/ fonts/ images/
├── template.hbs            # Handlebars template for song cards
├── appData.json            # CURRENT week's data (the "live DB")
├── backup/appDataWeekN.json# per-week archived snapshots (history)
├── playlists.json          # cached Spotify playlist track ids (for de-duping)
├── spotifyApiDetails.json  # client_id / client_secret / callback_url  (gitignored)
├── emailDetails.json        # SMTP host/port/user/pass               (gitignored)
└── Web.config              # Azure/iisnode hosting config
reminder.sh                 # curl POST /email — "don't forget to vote" reminder
```

## Data model (`appData.json`)

```jsonc
{
  "submitted-songs": {            // keyed by Spotify user id
    "<userId>": { "trackId": "<spotify track id or ''>", "display_name": "Joel", "userId": "<userId>" }
  },
  "votes": {                      // keyed by the VOTER's user id (one vote each)
    "<voterId>": {
      "trackId": "<liked track>",
      "who": "<submitter's userId>",
      "like": true,
      "displayName": "...", "imageURI": "...", "timestamp": 1685708149492
    }
  },
  "date": { "week": 26 }          // ISO week number the current round belongs to
}
```

Members are a fixed set of ~8 friends (Frej, Linus, Lukas, Joel, Jonas, Oskar,
Adrian, Edvin), identified by their Spotify user id.

## HTTP API (from `app.js`)

| Method & route        | Purpose |
|-----------------------|---------|
| `GET /login`          | Redirect to Spotify OAuth authorize |
| `GET /callback`       | Exchange code → tokens; redirect to `/#access_token=…` |
| `GET /refresh_token`  | Refresh a Spotify access token |
| `POST /add_song`      | Add / change / `delete` your track for the week (parses track URL/URI/`spotify.link`, validates via Spotify API, de-dupes against past playlists) |
| `POST /vote`          | Toggle a like (blocks voting for your own song) |
| `POST /get_tracks`    | Current week's songs + like counts, shuffled by a seed; lists archived weeks |
| `POST /get_old_tracks`| A past week's songs (from `backup/`) |
| `POST /get_likes` / `POST /get_old_likes` | Like tallies for current / past week |
| `GET /get_playlists`  | Fetch the two playlists' track ids; cache to `playlists.json` |
| `POST /update_playlist` | **Weekly close-out**: pick winner, update playlists, archive, advance week, email |
| `POST /email`         | Send an email via nodemailer |

## Running locally

```bash
cd spotify-playlist-voting
npm install

# These two files are gitignored — create them if missing:
#   spotifyApiDetails.json  { "client_id": "...", "client_secret": "...", "callback_url": "http://127.0.0.1:5000/callback" }
#   emailDetails.json       { "host": "...", "port": 587, "secure": false, "user": "...", "pass": "..." }

PORT=5000 node app.js          # then open http://127.0.0.1:5000
```

Notes:
- The `npm start` script (`node server`) is broken — there is no `server.js`. Run
  `node app.js` directly.
- **Port matters for login.** On the default port `8888` the code hardcodes the
  production redirect `https://fredagslaten.tk/callback`. On any other port it uses
  `callback_url` from `spotifyApiDetails.json`, which **must exactly match** a
  Redirect URI registered in your Spotify dashboard. Use `127.0.0.1` (not
  `localhost`) so the OAuth state cookie sticks, and note the Spotify app is in
  **Development mode** (only allow-listed accounts can log in).

## Caveats

- `node-json-db` is a flat-file store — fine for a handful of friends, not
  concurrency-safe.
- The `request` HTTP library is deprecated.
- Secrets live in plaintext JSON (gitignored), not env vars.
