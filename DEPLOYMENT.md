# Deploying Scouts QR on GitHub Pages

## How it works (architecture decision)

```
Phone / PC browser
   │  1. loads the website (static files)                    https://<user>.github.io/Attendance-System/
   ▼
GitHub Pages  ── docs/index.html, config.js, api-client.js, vendor/*.js
   │  2. fetch POST (text/plain JSON, with access code)
   ▼
Google Apps Script web app  (Code.gs, your existing /exec URL)  ── 3. reads/writes ──▶  Google Sheets
```

* **Option A** was chosen: GitHub Pages frontend + the *existing* Apps Script backend + the *existing* Google Sheet. No data or schema migration, no new hosting, no cost.
* Apps Script cannot answer CORS preflight requests, so the client sends **simple requests**: `POST`, `Content-Type: text/plain`, no custom headers, no cookies. Apps Script replies with a 302 redirect that the browser follows. This is why `api-client.js` is written the way it is. Do not change it to `application/json`.
* The backend URL lives in **one place**: `docs/config.js`.
* The backend is public (anyone with the URL can call it), so **every request must carry an access code** that is checked on the server (Script property `ACCESS_CODE`). Without it, anyone who found the URL could read children's phone numbers and national IDs. The old Apps Script-served page was removed from `doGet` for the same reason: it would have been a way around the code.
* Option B (separate backend) and C (stay on Apps Script) were not needed.

### Trade-offs / limits
* Free GitHub plans publish Pages only from **public** repositories. Code and the `/exec` URL are therefore public; data and the access code are not (they live in your Sheet and Apps Script properties).
* The access code is one shared code, stored in each leader's browser. It is a gate, not per-person accounts. Change it any time (step A4) to lock everyone out and re-issue.
* Apps Script is slow-ish (1-3 s per call, longer on a cold start) and has daily quotas. Fine for a troop; not for hundreds of simultaneous scans.
* Camera: GitHub Pages is HTTPS and top-level, which fixes the old iframe camera restrictions of Apps Script pages.

---

## A. Google Apps Script (do this FIRST)

> Until you redeploy, your existing `/exec` URL still serves the OLD open page. The website will not work and the old page stays public.

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Open `Code.gs`, select all, delete, paste the full new `Code.gs` from this project. **Save** (Ctrl+S).
3. (Recommended) Left gear **Project Settings** → tick **Show "appsscript.json" manifest file in editor** → open `appsscript.json` → replace with the new one → Save. (The deployment dialog below is what really counts.)
4. Still in **Project Settings**, scroll to **Script properties → Add script property**:
   * Property: `ACCESS_CODE`
   * Value: a code of 8+ characters that you will share with leaders (e.g. a short phrase). **Save script properties.**
5. **Deploy → Manage deployments** → pencil icon on your existing *Web app* deployment →
   * **Version: New version** (this is the step people forget)
   * Description: `GitHub Pages API`
   * **Execute as: Me**
   * **Who has access: Anyone**
   * **Deploy**. If Google asks to authorize, review and allow (your account, your own sheet).
   * The **Web app URL stays the same** (`.../exec`). Only if you choose *New deployment* instead would the URL change; then paste the new URL into `docs/config.js`.
6. Check: open the `/exec` URL in a browser tab. Expected: a line of JSON beginning `{"ok":true,"service":"scouts-qr-api"`. If you still see the old Scouts page, step 5 "New version" did not take effect.
7. You do **not** need to run `setup()` again (no schema changes). You can delete `Index`, `JsQR`, `QrCode` HTML files from the Apps Script project once the website works; they are no longer used.

---

## D. GitHub deployment tutorial (Windows + VS Code)

Prerequisite: Git for Windows and VS Code are installed, and your existing clone of `https://github.com/mirollawa2l/Attendance-System` is on disk.

1. **Unzip** `Attendance-System-github-pages.zip` somewhere temporary, e.g. `C:\Users\<you>\Downloads\Attendance-System-github-pages`.
2. **Open your existing repo folder in VS Code** (File → Open Folder). Open the terminal: **Ctrl+`** (PowerShell).
3. Make sure you are up to date and see your current state (nothing is changed by these two commands):
   ```powershell
   git fetch
   git status -sb
   ```
   Expect `## main...origin/main`, and possibly your own uncommitted edits listed.
4. **Copy the new files over your repo** (adjust the two paths):
   ```powershell
   $src = "$env:USERPROFILE\Downloads\Attendance-System-github-pages"
   Copy-Item -Path "$src\*" -Destination . -Recurse -Force
   Remove-Item Index.html, JsQR.html, QrCode.html
   ```
   (They are replaced by `docs/index.html` and `docs/vendor/*.js`. Git history keeps the old versions.)
5. Check the result:
   ```powershell
   git status
   ```
   Expect: modified `Code.gs`, `appsscript.json`, `.gitignore`; deleted `Index.html`, `JsQR.html`, `QrCode.html` (and `README.md` if you had deleted it earlier); new `docs/`, `tests/`, `DEPLOYMENT.md`.
6. (Optional) run the automated checks (needs Node 18+):
   ```powershell
   cd tests; npm install; npm test; cd ..
   ```
   Expect `# pass 24`, `# fail 0`.
7. Confirm no secrets are staged, then commit and push (normal push, no force):
   ```powershell
   git add -A
   git status
   git commit -m "Host frontend on GitHub Pages; Apps Script becomes JSON API with access code"
   git push origin main
   ```
   If the push is rejected because the remote has newer commits: `git pull` (merge, no rebase/force), resolve if asked, then `git push origin main` again.
8. **Enable Pages** on github.com → your repo → **Settings → Pages**:
   * Build and deployment → Source: **Deploy from a branch**
   * Branch: **main**, Folder: **/docs** → **Save**
   * Wait 1-2 minutes. Progress: **Actions** tab → "pages build and deployment" turns green.
9. **Public URL** (shown at the top of Settings → Pages once ready), expected:
   `https://mirollawa2l.github.io/Attendance-System/`
10. **Test the connection first:** open
    `https://mirollawa2l.github.io/Attendance-System/test-connection.html`
    Expected: checks 1 and 2 show green **PASS**. Type your `ACCESS_CODE` and press *Test code*: check 3 **PASS**.
11. Open the app URL, enter the access code, and test on a phone: Attendance → pick a meeting → *Start camera* → Allow → scan a member card.

### Before the first meeting after switching
* Browser storage is per website. Anything queued offline in the *old* Apps Script page will **not** appear on the new site. Open the old page once while online to let it sync, before you stop using it.
* Printed member QR cards keep working: they contain only the member token, which did not change.

---

## F. Testing report

Legend: **EXECUTED** = actually run and passed in this session. **SIMULATED** = run against a stand-in for Google. **NOT TESTED** = needs you.

| Area | Result | Kind |
|---|---|---|
| JavaScript syntax of every page/script and `Code.gs` | PASS (7 static checks) | EXECUTED |
| No `google.script`, `HtmlService`, `include()` or template tags left in `docs/` | PASS | EXECUTED |
| All asset paths relative and existing; only external host = your `/exec` URL | PASS | EXECUTED |
| Secret scan of tree, publish folder and Git history | PASS (none found; author e-mails only in commit metadata) | EXECUTED |
| `Code.gs` business logic: auth, members, meetings, attendance, duplicates, corrections, points ledger, term filters, import, analytics, reports, deletes | PASS (17 tests) | SIMULATED (in-memory Sheets, real `Code.gs` code) |
| Real browser (Chromium) running `docs/` cross-origin: gate, all 6 views, create meeting/member, QR card generate+decode, CSV import, manual attendance, analytics filters | PASS (48 browser checks) | SIMULATED backend (imitates Apps Script's redirect and missing-preflight behaviour) |
| Camera scan: fake camera video of a QR made by the app's own generator opens the right member; scanning alone writes nothing; re-scanning the same card creates no duplicate | PASS | SIMULATED camera in real Chromium |
| Camera denied / no camera device: clear message, retry button, manual search still works | PASS | EXECUTED in Chromium |
| Network failure → saved on device → synced once on reconnect; lost reply → no duplicate | PASS | SIMULATED |
| Diagnostic page gives PASS/FAIL correctly in 5 scenarios | PASS | SIMULATED |
| Real Apps Script: POST + 302 redirect + CORS from a github.io page | **NOT TESTED** | run `test-connection.html` (step D10) |
| Real Google Sheet reads/writes, Sheets quotas, authorization prompts | **NOT TESTED** | you |
| Real GitHub Pages deployment | **NOT TESTED** | you |
| Real phones (iPhone Safari, Android Chrome) camera, HTTPS prompts | **NOT TESTED** | you |

Observed while simulating: a browser rejects the redirect unless Google's 302 response also carries `Access-Control-Allow-Origin`. The widely used Apps Script pattern relies on that, but I could not confirm it against your live URL from my environment. That is exactly what `test-connection.html` check 2 tells you. If it FAILS with "browser blocked", see Troubleshooting → CORS.

### Existing code problems found and fixed (not deployment-related)
1. **Analytics screen was broken** in your current `Index.html`: a leftover line set a handler on a non-existent `#analytics-form`, throwing an error before the data loaded. Removed.
2. **Scan throttle was disabled**: a `//` comment had swallowed the line break, so `if(Date.now()-lastScanAt<2600||busy)…` was part of the comment. Restored.
3. **Offline queue could jam**: if a save reached the server but the reply was lost, the queued retry got `DUPLICATE` and the queue stopped forever. A duplicate on a non-correction retry is now treated as "already saved". (Verified: reverting this fix makes the queue never drain.)

### Features that do not exist in the current code (not added)
* No screen to edit point rules: configure `Settings` sheet rows directly (as your old README says).
* `listPointsLedger` and `finalize` exist in `Code.gs` but no screen calls them.
* No "Late" status (`late` is always 0). Offline mode cannot start the app from scratch (it needs to load once online). No installable-app/PWA caching.

---

## G. Troubleshooting

**GitHub Pages shows 404**
* Settings → Pages must say *Branch: main, Folder: /docs*. The file must be `docs/index.html` (lowercase; Pages is case-sensitive).
* Wait for the green check in the Actions tab; first publish can take a few minutes.
* The URL has the repo name: `https://<user>.github.io/Attendance-System/` (capital A and S as in the repo).

**Page loads but looks unstyled / "QR" or "jsQR is not defined"**
* Open DevTools (F12) → Network: a red `vendor/jsqr.js` or `config.js` means a wrong path or a file not pushed. Paths must stay relative (no leading `/`). Run `git status` to see unpushed files.

**"The backend returned a web page instead of data"**
* The `/exec` URL is serving the old UI or a Google sign-in page. Redeploy: Deploy → Manage deployments → edit → **New version**; Execute as **Me**; access **Anyone**.

**CORS error / "Failed to fetch" / "Network failure: could not reach the server"**
1. Run `test-connection.html`. If check 1 FAILS: wrong URL in `config.js`, access not *Anyone*, or old version deployed.
2. Apps Script runtime errors return an HTML error page that has **no** CORS headers; the browser reports it as a CORS error. Check Apps Script → **Executions** for the real error.
3. Never change the request to `application/json` or add headers; that triggers a preflight, which Apps Script cannot answer.
4. If check 2 still fails with "blocked" while check 1 passes, Google is not attaching CORS headers to the redirect for your deployment. Tell me the exact message; the fallback is a different transport (hidden-iframe `postMessage`) or a small proxy (Option B, e.g. a free Cloudflare Worker).

**"Access code required or incorrect" / "NOT_CONFIGURED"**
* `NOT_CONFIGURED`: add Script property `ACCESS_CODE` (A4). `UNAUTHORIZED`: wrong code; changing the property signs everyone out.

**Spreadsheet permission errors** (`You do not have permission`, `NOT_INITIALIZED`)
* Deploy "Execute as: **Me**" (the sheet owner), and re-authorize once if prompted. `NOT_INITIALIZED` means a tab is missing: run `setup()` from the editor.

**Camera does not start**
* Must be the `https://` address (not `http://`, not a file opened from disk).
* iPhone: Settings → Safari → Camera → Ask/Allow; use Safari or Chrome, not an in-app browser (WhatsApp/Facebook). Android: Chrome → lock icon → Permissions → Camera → Allow.
* "Camera in use": close other apps/tabs using it. Tap **Ask for camera again**.
* Always available: **Scan from photo** and manual name search.

**Server busy** (`BUSY`) just means two saves collided; retry.

---

## H. Final checklist

Ready (done in this package)
- [x] Frontend separated from Apps Script templating; static `docs/` site with relative paths and `.nojekyll`
- [x] `google.script.run` replaced by a `fetch` client; backend URL in `docs/config.js`
- [x] `Code.gs`: JSON `doPost` API with server-side access code; `doGet` is a health check; schema untouched
- [x] Manifest set to run as you / public; `.gitignore` extended; no secrets in tree or history
- [x] Connection diagnostic page; automated tests (24 + 48 browser checks)

You still need to do
- [ ] A1-A6: update `Code.gs`, set `ACCESS_CODE`, redeploy **New version**, check the `/exec` JSON
- [ ] D1-D7: copy files, commit, push
- [ ] D8: enable Pages (main, /docs)
- [ ] D10: run `test-connection.html` and confirm PASS (this is the real cross-origin test)
- [ ] Try attendance + camera on a real iPhone and Android phone
- [ ] Share the access code with leaders; let the old page sync any offline queue first
