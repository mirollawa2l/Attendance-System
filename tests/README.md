# Tests

| File | What it runs | How |
|---|---|---|
| `backend.test.js` | The real `Code.gs` on an **in-memory emulation** of Sheets/Lock/Properties (`gas-mock.js`). Simulated, not Google. | `cd tests && npm install && npm test` |
| `static.test.js` | Syntax, leftover Apps Script dependencies, asset paths, external hosts, secrets, manifest. | same |
| `e2e/e2e.py` | Real Chromium (Playwright for Python) driving `docs/` cross-origin against `e2e/mock-apps-script.js`, which imitates Apps Script's redirect/CORS behaviour on top of the real `Code.gs`. Uses a fake camera fed with a QR video. | `pip install playwright numpy pillow`, set `CHROME_PATH` if needed, `python tests/e2e/e2e.py` (written for Linux/macOS paths such as /tmp) |

None of these touch your real Google Sheet.
