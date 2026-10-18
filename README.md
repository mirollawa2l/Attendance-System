# Morshedat · Son of Thunder — Attendance & Points

**Selected setup: public Google Apps Script + Google Sheets.** The root `Code.gs` and `Index.html` app runs as the spreadsheet owner's Apps Script deployment and has no per-user login or allowlist. Anyone who can access the web-app URL can use the app to read and change attendance, member profiles, weekly meetings, and points. The separate `server.js` and `public/` app still use SQLite and do not write to Sheets.

The Google Sheets deployment uses the bound Apps Script backend. The app includes meeting-by-meeting reports, a searchable attendance log with each girl's name, and per-girl analytics (unit-specific attendance percentage, status breakdown, missing records, points, uniform/spiritual participation, follow-up flag, and history). Points are read from `PointsLedger`.

## Structure
Sheets deployment: root `Code.gs`, `Index.html`, `JsQR.html`, and `QrCode.html`. Optional SQLite alternative: `server.js`, `public/`, and `test/app.test.js`.

## Optional Node/SQLite version
To run the optional Node app locally, use `npm start` and open http://localhost:3000. The database is created at `./data/scouts.db`.
Node **>= 22.13** is required for this optional SQLite version. `npm test` runs its API tests.

## Deploy the Sheets-backed version
1. Open the destination Google Sheet and choose **Extensions → Apps Script**.
2. Add the root `Code.gs`, `Index.html`, `JsQR.html`, and `QrCode.html` files to the bound Apps Script project. `Index.html` includes the two bundled QR libraries; no QR-code CDN is required.
3. Run `setup()` and approve access. It creates any missing required sheets. When updating an existing deployment, run `setup()` again. It migrates old member/activity group IDs to `Orion` or `Polaris`, then deletes the obsolete `Groups` and `Achievements` tabs. Existing attendance records are preserved.
4. Choose **Deploy → New deployment → Web app**. Select **Execute as: Me** and **Who has access: Anyone** (or the equivalent public/anonymous option shown by Google).
5. Open the deployed web-app URL. Use **Meetings** to see each unit meeting by date, **Attendance Log** to search saved records, and **Analytics** to view each girl's unit-specific attendance percentage, absence breakdown, points, participation, follow-up flag, and meeting history. Add members and create weekly meetings by choosing a date and unit. Member IDs are generated automatically in the random three-letter + three-digit format (e.g. `KRM482`) and used as both the member ID and displayed code. Existing member references in Attendance and PointsLedger are migrated when `setup()` runs. From Members, choose **QR code** to preview and download a designed member card showing the girl’s name, unit, troop, and QR code.

**Public access warning:** the script runs using your Google account's spreadsheet permissions. Anyone with the web-app URL can use the app without signing in, and the app has no role restrictions. Do not deploy this way unless you are comfortable making the attendance data and app operations public to anyone who obtains the URL. Workspace policy may prevent anonymous deployments.

This UI uses `google.script.run` and the `Code.gs` APIs, which read and write Google Sheets. Attendance rows now store `member_name` alongside `member_id`; running `setup()` backfills names for historical rows. Points pages and point-related API methods have been removed from the app; point values, settings, and ledger are managed in the spreadsheet tabs only. Point-based attendance requires configuring the `Settings` tab directly: set each `attendance:S1` through `attendance:S7` row's `points` value and `configured` to `TRUE`, or set `allow_without_points` to `TRUE` in the `value` column. Points transactions remain in `PointsLedger`.

Apps Script `ContentService` cannot set arbitrary CORS headers for a separate browser-hosted frontend. The Apps Script-hosted page does not use the PWA service worker and is not guaranteed to reopen offline. Scans and completed forms can be queued in that browser's `localStorage` after the page has loaded; queued QR scans still need to be reviewed and submitted through the attendance form.

## Optional Node hosting (SQLite only)
1. Push this folder to GitHub.
2. Render → New Web Service; runtime Node 22+, empty build command, start command `npm start`.
3. Add a **Disk** (requires a paid instance) mounted at `/var/data`.
4. Set env var `DATA_DIR=/var/data`.
5. Open the `https://…onrender.com` URL (HTTPS is required for the camera).

Railway/Fly.io work the same way with a volume. **Without a persistent disk the SQLite file is lost on redeploy.** Run a single instance only. Not actually deployed or verified on Render by me.

## Security
The selected public deployment has **no authentication**. Protect student data by choosing a signed-in-user deployment instead if public access is not appropriate. In the public configuration, keep the URL private where possible, knowing that URL secrecy is not a security boundary. Anyone with the URL can view and modify app data, including student names and QR tokens. QR codes contain random member tokens.

## Optional Node/SQLite data model
Names are the user-facing keys (group name, activity name + date). Members have a hidden numeric id and token, so renames and group changes never break QR codes or history. Attendance primary key = (member, activity), so duplicates are impossible at database level; a correction is `correct:true` (upsert). Points are an append-only table; totals are sums; corrections append the difference. `rules` holds one nullable value per exact status (NULL = unconfigured → submission blocked, unless "Allow attendance without points" is ticked).

## Acceptance checklist (manual, phone, HTTPS)
- Run `setup()` on the bound Apps Script project and confirm the required tabs and appended columns appear in the Google Sheet.
- Add/edit a girl with name, unit, troop, year, phone, national ID, mother/father numbers, and notes; verify the system-generated random six-character member code is stable on edits.
- Confirm Attendance and PointsLedger rows show the member name. The obsolete Groups and Achievements tabs are deleted by `setup()`.
- Open analytics and confirm every member appears with attendance percentage and points; select a girl to see her detailed profile and meeting history.
- Deploy the web app publicly, then verify the public page loads without a sign-in prompt.
- Add a member and a dated weekly meeting for Orion or Polaris; Orion troops are كروان، نمر، فيل، نحلة, and Polaris troops are كوبرا، صقر، سنجاب، اسد. Download the designed member QR card and scan it from the Apps Script web-app URL.
- Choose **Scan from photo** and select an image containing a member QR; confirm it opens the same attendance form as a camera scan.
- Scanning alone saves nothing; the attendance form validates the selected activity and writes the submitted record to the `Attendance` sheet.
- Duplicate rejected; correction updates the attendance record.
- Configure attendance point rules directly in `Settings`; verify generated transactions in `PointsLedger`.
- Verify there are no points pages or point totals in the app UI.
- Camera denied → manual search still works.

## Limitations
- The Apps Script web app was not deployed or verified with a live Sheet or phone camera here. Test camera access using the deployed HTTPS web-app URL.
- Apps Script HTML Service does not provide this app with a service-worker cached shell. Offline use is limited to the already-loaded page and queued data in the same browser.
- The automated `npm test` suite exercises the optional Node/SQLite API, not the Apps Script service.


## Terms and meeting names

New weekly meetings require a season and year, such as `Spring 2026`, `Fall 2026`, or `Summer 2026`. The selector includes multiple years so old and future terms can be recorded. Member analytics can be filtered by each season-year, while points remain cumulative across all terms.

Meeting names are generated consistently as `<Unit> <Season> <DD-MM-YYYY>`, for example `Orion Spring 17-10-2026`. The meeting selector, meeting list, and meeting report use this same display name. Troops are fixed by unit: Orion = كروان، نمر، فيل، نحلة; Polaris = كوبرا، صقر، سنجاب، اسد.

When upgrading an existing spreadsheet, run `setup()` again. It appends the `term` column if needed, converts existing season-only terms such as `Spring` to a season-year based on the meeting date, and refreshes existing meeting names without deleting attendance records or points. Meetings with no recognizable term remain `Legacy`. To publish changes at the same URL, use **Deploy → Manage deployments → Edit → New version → Deploy** rather than creating a new deployment.


### Girl profile fields
Each girl's profile supports `birthday_date` (date, stored as `YYYY-MM-DD`) and `location` (free-text area/neighborhood). Run `setup()` after updating the Apps Script files; it adds these columns to the existing Members sheet without deleting existing records, attendance, or points. The Add/Edit Member form saves both fields and the profile view displays them.
