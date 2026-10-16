# Scouts QR – attendance, points & achievements

Adapted from the original single-file "QR List Scanner" PWA.
- **Kept:** the bundled jsQR decoder (`public/vendor/jsqr.js`), the PWA shell (manifest, icons, network-first service worker) and the colour theme.
- **Replaced:** browser `localStorage` + Google Apps Script sync (not shared, not persistent) with a small Node server + SQLite.
- **Removed:** the original's hardcoded status labels and invented point values (10/8/6…). The seven required Arabic labels are used and points start **unconfigured**.

## Structure
`server.js` (API, static files, schema auto-creation) · `public/` (index.html, app.js, style.css, sw.js, manifest, `vendor/jsqr.js`, `vendor/qrcode.js` = qrcode-generator 2.0.4, local QR generation) · `test/app.test.js` · `.env.example` · `.gitignore`. No npm dependencies.

## Run locally
Node **>= 22.13** (uses built-in `node:sqlite`, which Node still labels experimental).
`npm start` → http://localhost:3000 (camera works on localhost/HTTPS). `npm test`. The database is created on first start at `./data/scouts.db`.

## Deploy (selected target: Render Web Service + persistent disk)
1. Push this folder to GitHub.
2. Render → New Web Service; runtime Node 22+, empty build command, start command `npm start`.
3. Add a **Disk** (requires a paid instance) mounted at `/var/data`.
4. Set env var `DATA_DIR=/var/data`.
5. Open the `https://…onrender.com` URL (HTTPS is required for the camera).

Railway/Fly.io work the same way with a volume. **Without a persistent disk the SQLite file is lost on redeploy.** Run a single instance only. Not actually deployed or verified on Render by me.

## Security (no login, by design)
Anyone with the URL can view and change all data, including member names and QR tokens. Restrict access at hosting level if needed (private URL, IP allow-list, basic-auth proxy). Only name, group and optional year are stored. QR codes contain only a random token.

## Data model
Names are the user-facing keys (group name, activity name + date). Members have a hidden numeric id and token, so renames and group changes never break QR codes or history. Attendance primary key = (member, activity), so duplicates are impossible at database level; a correction is `correct:true` (upsert). Points are an append-only table; totals are sums; corrections append the difference. `rules` holds one nullable value per exact status (NULL = unconfigured → submission blocked, unless "Allow attendance without points" is ticked).

## Acceptance checklist (manual, phone, HTTPS)
- Add group, member, activity; download a member QR and scan it.
- Scanning alone saves nothing; the form shows 7 / 3 / 3×3 exact options; participation defaults to لم يُسجّل.
- Save, restart the server, record still under Attendance records.
- Duplicate rejected; correction updates points once; unconfigured status blocked.
- Manual points need a reason; achievement visible per member.
- Camera denied → manual search still works.

## Limitations
- Not verified: real camera scanning on a phone, browser UI behaviour, an actual hosting deployment. Only the automated API tests (`npm test`, passing) and a local server smoke test were run.
- No activity close/finalize, no delete, no per-group report page (the original dashboard was dropped).
- Single instance only.
