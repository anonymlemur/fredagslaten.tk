# Removed from dev — replay on prod

A log of everything **removed** in the dev environment so the same cleanup can be applied to
prod quickly (prod is currently inactive). Apply these when bringing prod in line.

> Scope note: this lists **removals only**. Config *changes* (e.g. the `callback_url` port in
> `spotifyApiDetails.json`) and *additions* are not prod-relevant cleanup and are not listed here.

---

## 1. Firebase (was completely unused by `app.js`)

**Why:** the app should be 100% self-hosted; nothing in the code imported Firebase — the deps and
the service-account key were dead weight.

### a) `spotify-playlist-voting/package.json` — removed dependencies
```diff
-    "firebase": "^9.14.0",
-    "firebase-admin": "^11.5.0",
```
(All other dependencies left unchanged.)

### b) Deleted file
```
spotify-playlist-voting/firebaseServiceAccountKey.json
```
(Already gitignored — it holds a service-account secret. Also revoke/rotate that key in Google
Cloud if it was ever real.)

### c) Pruned `node_modules`
```
npm prune        # removed 271 transitive packages pulled in by firebase/firebase-admin
```

### Replay on prod
```bash
cd spotify-playlist-voting
# edit package.json: delete the "firebase" and "firebase-admin" lines
rm -f firebaseServiceAccountKey.json
npm prune
# (optional) revoke the firebase service-account key in Google Cloud
```

---

## 2. Directory `old/` (dev workspace only)

**Why:** leftover wrapper directory from reorganising the dev workspace. Not part of the app.
**Note:** this likely does **not** exist on prod — included only for completeness. Skip if absent.

---

## Candidates NOT yet removed (pending your go-ahead)

These are also unused/dead but were left in place. If you want them gone, they should be removed in
**both** dev and prod:

- **Unused npm deps** in `package.json`: `collect.js`, `mathjs`, `mailtrap` (only `nodemailer` is used).
- **Dead/dev leftover files:** `app.js.save`, `app.js_old`, `appData.jsonOld`, `appData copy.json`
  (root + `spotify-playlist-voting/`), `ss.js`, and `public/{html1, friskel, adrian_meme}`.

(See `SPEC.md` §10 for the full quirks/cleanup list.)
