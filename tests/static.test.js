// Static checks on the publishable site (docs/) and backend source.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), acorn = require('acorn');
const root = path.join(__dirname, '..'), docs = path.join(root, 'docs');
const html = fs.readFileSync(path.join(docs, 'index.html'), 'utf8');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' || e.name === '.git' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);

test('every inline <script> in index.html and every .js file parses', () => {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]); assert.equal(inline.length, 1);
  for (const code of inline) acorn.parse(code, { ecmaVersion: 'latest' });
  for (const f of walk(docs).filter(f => f.endsWith('.html'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) acorn.parse(m[1], { ecmaVersion: 'latest' });
  for (const f of walk(docs).filter(f => f.endsWith('.js'))) acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest' });
  acorn.parse(fs.readFileSync(path.join(root, 'Code.gs'), 'utf8'), { ecmaVersion: 'latest' });
});
test('no unresolved Apps Script dependencies in the published site', () => {
  for (const f of walk(docs).filter(f => /\.(html|js)$/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/google\.script\./.test(t), f + ' uses google.script'); assert.ok(!/<\?!?=?[^>]*\?>/.test(t.replace(/<\?xml[^>]*\?>/g, '')) || f.includes('vendor'), f + ' scriptlet');
    if (!f.includes('vendor')) { assert.ok(!/HtmlService|include\(['"]/.test(t), f + ' HtmlService/include'); }
  }
  assert.ok(!/<base\s/.test(html));
});
test('script/link/img references are relative and exist', () => {
  const refs = [...html.matchAll(/<(?:script|link|img)[^>]*\s(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith('data:'));
  assert.ok(refs.length >= 4); for (const r of refs) { assert.ok(!/^(https?:)?\/\//.test(r) && !r.startsWith('/'), 'not relative: ' + r); assert.ok(fs.existsSync(path.join(docs, r)), 'missing ' + r); }
  assert.ok(fs.existsSync(path.join(docs, 'index.html')) && !fs.existsSync(path.join(docs, 'Index.html')) || process.platform === 'win32');
});
test('no third-party hosts are contacted: only the configured Apps Script URL', () => {
  for (const f of walk(docs).filter(f => /\.(html|js)$/.test(f) && !f.includes('vendor'))) {
    const urls = (fs.readFileSync(f, 'utf8').replace(/data:[^"')]+/g, '').match(/https?:\/\/[^\s"'`)<]+/g) || []).filter(u => !/w3\.org|openxmlformats/.test(u));
    for (const u of urls) assert.ok(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u), f + ' -> ' + u);
  }
});
test('no secrets or private files in the publish folder or tracked sources', () => {
  const bad = [/private_key/, /client_secret/, /BEGIN [A-Z ]*PRIVATE/, /ghp_[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{30,}/, /ACCESS_CODE\s*[:=]\s*['"][^'"]+['"]/];
  for (const f of [...walk(docs), path.join(root, 'Code.gs'), path.join(root, 'appsscript.json')]) { const t = fs.readFileSync(f, 'utf8'); for (const re of bad) assert.ok(!re.test(t), f + ' matches ' + re); }
  for (const f of walk(docs)) assert.ok(!/\.(gs|env|db|pem|key)$/.test(f) && !/appsscript/.test(f), 'private file in docs: ' + f);
});
test('manifest is set for a public, owner-executed web app', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8')); assert.equal(m.webapp.executeAs, 'USER_DEPLOYING'); assert.equal(m.webapp.access, 'ANYONE_ANONYMOUS');
});
test('the two pre-existing frontend bugs are gone', () => {
  assert.ok(!html.includes('analytics-form')); assert.ok(!/losing the cameraif/.test(html)); assert.ok(/losing the camera\n\s+if\(Date\.now\(\)-lastScanAt<2600\|\|busy\)/.test(html));
});
