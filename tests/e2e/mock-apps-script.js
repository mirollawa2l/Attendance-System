// SIMULATED Apps Script web app: real Code.gs logic + imitation of Google's HTTP behaviour.
//  - OPTIONS (CORS preflight) gets 405 and no CORS headers  (Apps Script has no doOptions)
//  - POST /macros/s/MOCK/exec -> 302 -> http://127.0.0.1:8083/macros/echo?id=N  (different origin) -> JSON + ACAO:*
//  - variant A: the 302 also carries ACAO:*   variant B: it does not
const http = require('http'), fs = require('fs'), path = require('path');
const { makeEnv } = require('../gas-mock');
let apiUrl='http://127.0.0.1:8082/macros/s/MOCK/exec', env, results = {}, n = 0, mode = 'normal', variant = 'A', stats = { options: 0, posts: 0, contentTypes: [] };
const CODE = 'scouts-test-code';
function reset() {
  env = makeEnv({ accessCode: CODE }); env.run('setup()');
  env.sheets.Settings.rows.forEach(r => { const m = /^attendance:(S\d)$/.exec(r[0]); if (m) { r[2] = { S1: 10, S2: 5, S3: 3, S4: 2, S5: 0, S6: 0, S7: 0 }[m[1]]; r[3] = 'TRUE'; } });
  const ok = r => r.data;
  const m1 = ok(env.callApi('saveMember', { full_name: 'منى جرجس', unit: 'Orion', troop: 'كروان', active: true, phone_number: '0100000001' }));
  const m2 = ok(env.callApi('saveMember', { full_name: 'Mariam Samir', unit: 'Polaris', troop: 'كوبرا', active: true }));
  const act = ok(env.callApi('saveActivity', { activity_date: '2026-03-13', group_id: 'Orion', term: 'Spring 2026' }));
  stats = { options: 0, posts: 0, contentTypes: [] }; mode = 'normal';
  const seed = { code: CODE, m1, m2, act }; fs.writeFileSync('/tmp/seed.json', JSON.stringify(seed)); return seed;
}
let seed = reset();
const cors = { 'Access-Control-Allow-Origin': '*' };
const json = (res, code, o, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...h }); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/__ctl/')) {
    const c = u.pathname.slice(7);
    if (c === 'reset') { seed = reset(); return json(res, 200, seed); }
    if (c === 'sheets') return json(res, 200, Object.fromEntries(Object.entries(env.sheets).map(([k, v]) => [k, v.rows])));
    if (c === 'mode') { mode = u.searchParams.get('m'); return json(res, 200, { mode }); }
    if (c === 'variant') { variant = u.searchParams.get('v'); return json(res, 200, { variant }); }
    if (c === 'api') { apiUrl = u.searchParams.get('u') || apiUrl; return json(res, 200, { apiUrl }); }
    if (c === 'stats') return json(res, 200, stats);
    return json(res, 404, {});
  }
  if (u.pathname !== '/macros/s/MOCK/exec') return json(res, 404, { ok: false });
  if (mode === 'html') { res.writeHead(200, { 'Content-Type': 'text/html', ...cors }); return res.end('<!DOCTYPE html><html><body>Sign in - Google Accounts</body></html>'); }
  if (req.method === 'OPTIONS') { stats.options++; res.writeHead(405); return res.end('Method Not Allowed'); }
  if (req.method === 'GET') { const id = ++n; results[id] = env.sandbox.doGet().getContent(); res.writeHead(302, { Location: 'http://127.0.0.1:8083/macros/echo?id=' + id, ...(variant === 'A' ? cors : {}) }); return res.end(); }
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    stats.posts++; stats.contentTypes.push(req.headers['content-type']);
    if (mode === 'offline') return req.socket.destroy();
    const out = env.sandbox.doPost({ postData: { contents: body } }).getContent();
    if (mode === 'dropreply') return req.socket.destroy(); // server APPLIED the write but the answer never arrives
    const id = ++n; results[id] = out;
    res.writeHead(302, { Location: 'http://127.0.0.1:8083/macros/echo?id=' + id, ...(variant === 'A' ? cors : {}) }); res.end();
  });
}).listen(8082, '127.0.0.1');
http.createServer((req, res) => { const id = new URL(req.url, 'http://x').searchParams.get('id'); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...cors }); res.end(results[id] || '{}'); }).listen(8083, '127.0.0.1');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
http.createServer((req, res) => { let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': mime['.js'] }); return res.end('window.SCOUTS_CONFIG={API_URL:"' + apiUrl + '",REQUEST_TIMEOUT_MS:8000};'); } const f = path.join(__dirname, '..', '..', 'docs', p);
  if (!f.startsWith(path.join(__dirname, '..', '..', 'docs')) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8081, 'localhost');
console.log('READY');
