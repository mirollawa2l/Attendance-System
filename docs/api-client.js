// Replaces the old Apps Script in-page call mechanism. Talks to the Apps Script web app with fetch().
//
// Why it is written this way (Apps Script cross-origin rules):
//  * Content-Type is text/plain, NOT application/json. That makes it a CORS "simple request",
//    so the browser sends no OPTIONS preflight (Apps Script cannot answer preflights).
//  * No custom headers and credentials:'omit' (the final response is Access-Control-Allow-Origin:*,
//    which browsers reject when cookies are included).
//  * Apps Script answers with a 302 redirect to script.googleusercontent.com; fetch follows it.
//  * The access code goes in the POST body (never in the URL).
// Every failure is turned into {code,message}. code 'NETWORK' means "could not reach the server"
// and is what the existing offline-queue logic in index.html reacts to.
(function () {
  var KEY_STORE = 'scouts-qr-access-code';
  var cfg = window.SCOUTS_CONFIG || {};

  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (_) { return ''; } }
  function setKey(k) { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (_) {} }
  function fail(code, message) { var e = { code: code, message: message }; return e; }

  async function request(fn, args) {
    if (fn === 'appUrl') return location.href.split('#')[0]; // "open in full page" now just means this page
    if (!cfg.API_URL || /PASTE_|YOUR_/.test(cfg.API_URL)) throw fail('NOT_CONFIGURED', 'The backend URL is not set. Edit docs/config.js (API_URL).');
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, cfg.REQUEST_TIMEOUT_MS || 45000);
    var res, text;
    try {
      res = await fetch(cfg.API_URL, {
        method: 'POST', mode: 'cors', redirect: 'follow', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: args || {}, key: getKey() }),
        signal: ctl.signal
      });
      text = await res.text();
    } catch (e) {
      throw fail('NETWORK', e && e.name === 'AbortError'
        ? 'Network failure: the server took too long to answer.'
        : 'Network failure: could not reach the server (offline, blocked by the browser, or the backend URL is wrong).');
    } finally { clearTimeout(timer); }
    var body;
    try { body = JSON.parse(text); }
    catch (_) {
      throw fail('BAD_RESPONSE', /<html|<!doctype/i.test(text)
        ? 'The backend returned a web page instead of data. Check the Apps Script deployment: Execute as "Me", access "Anyone", and that the latest version is deployed.'
        : 'The backend returned an unreadable response (HTTP ' + res.status + ').');
    }
    if (body && body.ok) return body.data;
    var err = (body && body.error) || {};
    throw fail(err.code || 'SERVER_ERROR', err.message || 'Unknown server error');
  }

  window.ScoutsApi = { call: request, getKey: getKey, setKey: setKey };
})();
