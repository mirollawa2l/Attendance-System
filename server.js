'use strict';
// Scouts QR – zero-dependency Node (>=22.13) server + SQLite (node:sqlite). Serves ./public and a JSON API.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const STATUSES = ['حضر في الميعاد','محضرش في الميعاد ومعتذر','محضرش في الميعاد ومعتذر عذر غير مقبول','محضرش في الميعاد ومعتذرش','محضرش ومعتذر','محضرش ومعتذر عذر غير مقبول','محضرش ومعتذرش'];
const UNIFORM = ['التزام بالزي','عدم التزام بالزي ومش معتذر','عدم التزام بالزي ومعتذر'];
const YN = ['أيوه','لأ','لم يُسجّل'];
const q = a => a.map(x => `'${x}'`).join(',');
class E extends Error { constructor(s, c, m) { super(m || c); this.status = s; this.code = c; } }

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  const yn = c => `${c} TEXT NOT NULL DEFAULT '${YN[2]}' CHECK(${c} IN (${q(YN)}))`;
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS teams(name TEXT PRIMARY KEY CHECK(trim(name)<>''));
  CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(trim(name)<>''),
    team TEXT NOT NULL REFERENCES teams(name) ON UPDATE CASCADE, year TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1, token TEXT NOT NULL UNIQUE, UNIQUE(name,team,year));
  CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(trim(name)<>''),
    date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    team TEXT REFERENCES teams(name) ON UPDATE CASCADE, UNIQUE(name,date));
  CREATE TABLE IF NOT EXISTS attendance(member_id INTEGER NOT NULL REFERENCES members(id), activity_id INTEGER NOT NULL REFERENCES activities(id),
    status TEXT NOT NULL CHECK(status IN (${q(STATUSES)})), uniform TEXT NOT NULL CHECK(uniform IN (${q(UNIFORM)})),
    ${yn('mass')}, ${yn('sunday')}, ${yn('confession')}, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
    PRIMARY KEY(member_id,activity_id));
  CREATE TABLE IF NOT EXISTS points(id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id),
    activity_id INTEGER REFERENCES activities(id), delta INTEGER NOT NULL, reason TEXT NOT NULL CHECK(trim(reason)<>''),
    kind TEXT NOT NULL CHECK(kind IN ('auto','manual')), date TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS achievements(id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id),
    title TEXT NOT NULL CHECK(trim(title)<>''), description TEXT NOT NULL DEFAULT '', date TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rules(status TEXT PRIMARY KEY, points INTEGER);   -- NULL = unconfigured
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR IGNORE INTO settings VALUES('allow_no_points','0');`);
  const ins = db.prepare('INSERT OR IGNORE INTO rules(status) VALUES(?)'); STATUSES.forEach(s => ins.run(s));
  return db;
}

function makeApp(db) {
  const get = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a), run = (s, ...a) => db.prepare(s).run(...a);
  const tx = f => { db.exec('BEGIN IMMEDIATE'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; } };
  const str = (v, n) => { v = String(v ?? '').trim(); if (!v) throw new E(400, 'INVALID', n + ' is required'); return v; };
  const int = (v, n) => { if (!/^-?\d+$/.test(String(v ?? '').trim())) throw new E(400, 'INVALID', n + ' must be an integer'); return Number(v); };
  const date = v => { v = String(v || new Date().toISOString().slice(0, 10)); if (!/^\d{4}-\d\d-\d\d$/.test(v)) throw new E(400, 'INVALID', 'Bad date'); return v; };
  const member = id => get('SELECT * FROM members WHERE id=?', id) || (() => { throw new E(404, 'NOT_FOUND', 'Member not found'); })();
  const activity = id => get('SELECT * FROM activities WHERE id=?', id) || (() => { throw new E(404, 'NOT_FOUND', 'Activity not found'); })();
  const eligible = (a, m) => { if (a.team && a.team !== m.team) throw new E(409, 'NOT_ELIGIBLE', 'Member is not in this activity\'s group'); };
  const total = id => get('SELECT COALESCE(SUM(delta),0) t FROM points WHERE member_id=?', id).t;

  return function handle(method, url, b) {
    try {
      const u = new URL(url, 'http://x'), p = u.searchParams, key = method + ' ' + u.pathname; b = b || {};
      switch (key) {
        case 'GET /api/config': return { statuses: STATUSES, uniform: UNIFORM, yn: YN };
        case 'GET /api/groups': return all('SELECT name FROM teams ORDER BY name');
        case 'POST /api/groups': { const n = str(b.name, 'Name');
          if (b.old) { if (!run('UPDATE teams SET name=? WHERE name=?', n, b.old).changes) throw new E(404, 'NOT_FOUND', 'Group not found'); }
          else run('INSERT INTO teams(name) VALUES(?)', n); return { ok: true }; }
        case 'GET /api/members': return all(`SELECT m.id,m.name,m.team,m.year,m.active,m.token,(SELECT COALESCE(SUM(delta),0) FROM points WHERE member_id=m.id) points FROM members m ORDER BY m.name`);
        case 'POST /api/members': { const n = str(b.name, 'Name'), t = str(b.team, 'Group'), y = String(b.year ?? '').trim(), a = b.active === false || b.active === 0 ? 0 : 1;
          if (b.id) { member(b.id); run('UPDATE members SET name=?,team=?,year=?,active=? WHERE id=?', n, t, y, a, b.id); return { ok: true }; }
          run('INSERT INTO members(name,team,year,active,token) VALUES(?,?,?,?,?)', n, t, y, a, crypto.randomBytes(16).toString('hex')); return { ok: true }; }
        case 'GET /api/scan': { const m = get('SELECT * FROM members WHERE token=?', p.get('token') || '');
          if (!m) throw new E(404, 'INVALID_TOKEN', 'Unknown QR code'); const a = activity(p.get('activity'));
          if (!m.active) throw new E(409, 'MEMBER_INACTIVE', m.name + ' is inactive'); eligible(a, m);   // read-only: saves nothing
          return { member: { id: m.id, name: m.name, team: m.team, year: m.year }, existing: get('SELECT * FROM attendance WHERE member_id=? AND activity_id=?', m.id, a.id) || null }; }
        case 'GET /api/activities': return all('SELECT * FROM activities ORDER BY date DESC, name');
        case 'POST /api/activities': { const n = str(b.name, 'Name'), d = date(b.date), t = b.team || null;
          if (b.id) { activity(b.id); run('UPDATE activities SET name=?,date=?,team=? WHERE id=?', n, d, t, b.id); } else run('INSERT INTO activities(name,date,team) VALUES(?,?,?)', n, d, t);
          return { ok: true }; }
        case 'GET /api/roster': { const a = activity(p.get('activity'));
          return all(`SELECT m.id,m.name,m.team,m.year,at.status,at.uniform,at.mass,at.sunday,at.confession,at.notes FROM members m
            LEFT JOIN attendance at ON at.member_id=m.id AND at.activity_id=? WHERE (m.active=1 OR at.status IS NOT NULL) AND (?1 IS NULL OR m.team=?2) ORDER BY m.name`.replace('?1', '?').replace('?2', '?'), a.id, a.team, a.team); }
        case 'POST /api/attendance': {
          const m = member(b.member), a = activity(b.activity); eligible(a, m);
          if (!STATUSES.includes(b.status)) throw new E(400, 'INVALID', 'Attendance status is required');
          if (!UNIFORM.includes(b.uniform)) throw new E(400, 'INVALID', 'Uniform status is required');
          const f = k => { const v = b[k] ?? YN[2]; if (!YN.includes(v)) throw new E(400, 'INVALID', 'Bad value: ' + k); return v; };
          const [mass, sunday, conf] = [f('mass'), f('sunday'), f('confession')];
          return tx(() => {
            const rule = get('SELECT points FROM rules WHERE status=?', b.status).points;
            if (rule == null && get("SELECT value FROM settings WHERE key='allow_no_points'").value !== '1')
              throw new E(409, 'RULE_UNCONFIGURED', 'No point value is configured for this status (Points page)');
            const old = get('SELECT status FROM attendance WHERE member_id=? AND activity_id=?', m.id, a.id);
            if (old && !b.correct) throw new E(409, 'DUPLICATE', 'Attendance already recorded for this member and activity');
            if (!old && !m.active) throw new E(409, 'MEMBER_INACTIVE', m.name + ' is inactive');
            run(`INSERT INTO attendance(member_id,activity_id,status,uniform,mass,sunday,confession,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
              ON CONFLICT(member_id,activity_id) DO UPDATE SET status=excluded.status,uniform=excluded.uniform,mass=excluded.mass,sunday=excluded.sunday,confession=excluded.confession,notes=excluded.notes,updated_at=excluded.updated_at`,
              m.id, a.id, b.status, b.uniform, mass, sunday, conf, String(b.notes || '').slice(0, 500), new Date().toISOString());
            const net = get("SELECT COALESCE(SUM(delta),0) n FROM points WHERE member_id=? AND activity_id=? AND kind='auto'", m.id, a.id).n, d = (rule ?? 0) - net;
            if (d) run("INSERT INTO points(member_id,activity_id,delta,reason,kind,date) VALUES(?,?,?,?,'auto',?)", m.id, a.id, d,
              old ? `Correction: ${old.status} → ${b.status}` : 'Attendance: ' + b.status, new Date().toISOString().slice(0, 10));
            return { ok: true, points_change: d };
          }); }
        case 'GET /api/rules': return { rules: all('SELECT status,points FROM rules ORDER BY rowid'), allow: get("SELECT value FROM settings WHERE key='allow_no_points'").value === '1' };
        case 'POST /api/rules': return tx(() => { for (const s of STATUSES) { const v = String((b.rules || {})[s] ?? '').trim();
            run('UPDATE rules SET points=? WHERE status=?', v === '' ? null : int(v, 'Points'), s); }
          run("UPDATE settings SET value=? WHERE key='allow_no_points'", b.allow ? '1' : '0'); return { ok: true }; });
        case 'POST /api/points': { const m = member(b.member); if (b.activity) activity(b.activity);
          run("INSERT INTO points(member_id,activity_id,delta,reason,kind,date) VALUES(?,?,?,?,'manual',?)", m.id, b.activity || null, int(b.delta, 'Points'), str(b.reason, 'Reason'), new Date().toISOString().slice(0, 10)); return { ok: true }; }
        case 'GET /api/points': { const m = member(p.get('member')); return { total: total(m.id), rows: all('SELECT delta,reason,kind,date FROM points WHERE member_id=? ORDER BY id DESC', m.id) }; }
        case 'POST /api/achievements': { const m = member(b.member);
          run('INSERT INTO achievements(member_id,title,description,date) VALUES(?,?,?,?)', m.id, str(b.title, 'Title'), String(b.description || ''), date(b.date)); return { ok: true }; }
        case 'GET /api/achievements': return all('SELECT title,description,date FROM achievements WHERE member_id=? ORDER BY date DESC,id DESC', member(p.get('member')).id);
        default: throw new E(404, 'NOT_FOUND', 'Unknown endpoint');
      }
    } catch (e) {
      const m = String(e.message);
      if (e instanceof E) throw e;
      if (/UNIQUE/.test(m)) throw new E(409, 'DUPLICATE', 'That record already exists');
      if (/FOREIGN KEY/.test(m)) throw new E(400, 'INVALID', 'Unknown or in-use reference');
      if (/CHECK/.test(m)) throw new E(400, 'INVALID', 'Invalid value');
      throw e;
    }
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function createServer(db) {
  const handle = makeApp(db), PUB = path.join(__dirname, 'public');
  return http.createServer((req, res) => {
    const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/api/')) {
      let body = '', big = false;
      req.on('data', c => { body += c; if (body.length > 1e5) { big = true; req.destroy(); } });
      req.on('end', () => { if (big) return;
        try { send(200, handle(req.method, req.url, body ? JSON.parse(body) : {})); }
        catch (e) { if (e.status) send(e.status, { code: e.code, message: e.message }); else { console.error(e); send(500, { code: 'SERVER_ERROR', message: 'Server error' }); } } });
      return;
    }
    let f = path.normalize(path.join(PUB, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
  });
}
module.exports = { openDb, createServer, STATUSES, UNIFORM, YN };
if (require.main === module) {
  const file = process.env.DB_FILE || path.join(process.env.DATA_DIR || './data', 'scouts.db');
  createServer(openDb(file)).listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Listening on :' + (process.env.PORT || 3000) + ', db ' + file));
}
