// In-memory emulation of the Apps Script services that Code.gs uses, so the real Code.gs can run in Node.
// SIMULATION: it models Sheets/Lock/Properties/ContentService closely enough for logic tests, but it is not Google.
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

function makeEnv({ accessCode = 'test-code' } = {}) {
  const sheets = {}; const props = {}; if (accessCode) props.ACCESS_CODE = accessCode;
  const log = { sleeps: 0 };
  function Sheet(name) {
    const sh = { name, rows: [], filter: false, frozen: 0 };
    const width = () => sh.rows.reduce((m, r) => Math.max(m, r.length), 0);
    const ensure = (r, c) => { while (sh.rows.length < r) sh.rows.push([]); for (const row of sh.rows) while (row.length < Math.max(c, width())) row.push(''); };
    const range = (r, c, nr = 1, nc = 1) => {
      const o = {
        getValues: () => { ensure(r + nr - 1, c + nc - 1); const out = []; for (let i = 0; i < nr; i++) out.push(sh.rows[r - 1 + i].slice(c - 1, c - 1 + nc).map(v => v)); return out; },
        setValues: (v) => { ensure(r + v.length - 1, c + v[0].length - 1); v.forEach((row, i) => row.forEach((x, j) => { sh.rows[r - 1 + i][c - 1 + j] = x; })); return o; },
        setValue: (x) => { ensure(r, c); sh.rows[r - 1][c - 1] = x; return o; },
        setFormula: (x) => o.setValue(x), setFontWeight: () => o, setNumberFormat: () => o, createFilter: () => { sh.filter = true; }
      };
      o.getDisplayValues = () => o.getValues().map(row => row.map(String)); return o;
    };
    Object.assign(sh, {
      getLastRow: () => sh.rows.length, getLastColumn: () => width(), getMaxRows: () => sh.rows.length + 100,
      getRange: range, getDataRange: () => range(1, 1, Math.max(sh.rows.length, 1), Math.max(width(), 1)),
      appendRow: (arr) => { sh.rows.push(arr.slice()); const w = width(); sh.rows.forEach(r => { while (r.length < w) r.push(''); }); },
      deleteRow: (n) => { sh.rows.splice(n - 1, 1); }, setFrozenRows: (n) => { sh.frozen = n; },
      getFilter: () => (sh.filter ? {} : null), createFilter: () => { sh.filter = true; }
    });
    return sh;
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = Sheet(n)), deleteSheet: s => { delete sheets[s.name]; } };
  const tz = 'Africa/Cairo';
  const sandbox = {
    console, Date, Math, JSON, Set, Map, Object, Array, String, Number, Error, RegExp, isNaN,
    SpreadsheetApp: { getActive: () => ss, flush: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null) }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/MOCK/exec' }) },
    Session: { getScriptTimeZone: () => tz },
    Utilities: {
      getUuid: () => crypto.randomUUID(), sleep: () => { log.sleeps++; },
      formatDate: (d, z, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return f === 'yyyy' ? p.year : `${p.year}-${p.month}-${p.day}`; }
    },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  const callApi = (fn, args, key = accessCode) => post({ fn, args: args || {}, key });
  return { sandbox, sheets, props, ss, post, callApi, log, run: (code) => vm.runInContext(code, sandbox) };
}
module.exports = { makeEnv };
