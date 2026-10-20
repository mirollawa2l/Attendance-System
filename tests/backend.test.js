// Backend regression tests: real Code.gs logic running on an in-memory Sheets emulation (SIMULATED, not Google).
const test = require('node:test'), assert = require('node:assert/strict');
const { makeEnv } = require('./gas-mock');

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const bad = (r, code) => { assert.equal(r.ok, false, 'expected failure ' + code); assert.equal(r.error.code, code, JSON.stringify(r)); };
function fresh() { const e = makeEnv(); e.run('setup()'); return e; }
function setRules(e, points = { S1: 10, S2: 5, S3: 3, S4: 2, S5: 0, S6: 0, S7: 0 }) {
  const sh = e.sheets.Settings;
  sh.rows.forEach(r => { const m = /^attendance:(S\d)$/.exec(r[0]); if (m) { r[2] = points[m[1]]; r[3] = 'TRUE'; } });
}
function mkMember(e, name = 'منى جرجس', unit = 'Orion', troop = 'كروان') { return ok(e.callApi('saveMember', { full_name: name, unit, troop, active: true })); }
function mkMeeting(e, date = '2025-03-14', unit = 'Orion', term = 'Spring 2025') { return ok(e.callApi('saveActivity', { activity_date: date, group_id: unit, term })); }
const att = (m, a, code = 'S1', extra = {}) => ({ member_id: m.member_id, activity_id: a.activity_id, attendance_status_code: code, uniform_status: 'التزام بالزي', mass_participation: 'أيوه', sunday_school_participation: 'لأ', confession_participation: 'لم يُسجّل', ...extra });

test('doGet is a JSON health check and serves no HTML UI', () => {
  const e = makeEnv(); const out = JSON.parse(e.sandbox.doGet().getContent());
  assert.equal(out.ok, true); assert.equal(out.service, 'scouts-qr-api');
  assert.equal(typeof e.sandbox.include, 'undefined'); assert.equal(e.run('typeof HtmlService'), 'undefined');
});

test('doPost: malformed / missing fn / unknown fn / auth', () => {
  const e = makeEnv();
  bad(e.post('not json'), 'INVALID_JSON'); bad(e.post({ args: {} }), 'BAD_CALL');
  bad(e.callApi('init', {}, ''), 'UNAUTHORIZED'); bad(e.callApi('init', {}, 'wrong'), 'UNAUTHORIZED');
  assert.ok(e.log.sleeps >= 2, 'failed attempts are slowed');
  bad(e.callApi('nope'), 'BAD_CALL'); bad(e.callApi('constructor'), 'BAD_CALL'); bad(e.callApi('__proto__'), 'BAD_CALL');
  const open = makeEnv({ accessCode: null }); bad(open.callApi('init', {}, ''), 'NOT_CONFIGURED'); // fails closed when no ACCESS_CODE
});

test('doPost: a thrown internal error still returns JSON (no HTML error page)', () => {
  const e = makeEnv(); // no setup() -> sheets missing -> NOT_INITIALIZED, returned as JSON
  bad(e.callApi('listMembers'), 'NOT_INITIALIZED');
});

test('init returns the 7 Arabic attendance statuses, uniform and yes/no options', () => {
  const e = fresh(); const d = ok(e.callApi('init'));
  assert.equal(d.att.length, 7); assert.deepEqual(d.att[0], ['S1', 'حضر في الميعاد']); assert.equal(d.att[6][1], 'محضرش ومعتذرش');
  assert.deepEqual(d.uni, ['التزام بالزي', 'عدم التزام بالزي ومش معتذر', 'عدم التزام بالزي ومعتذر']);
  assert.deepEqual(d.yn, ['أيوه', 'لأ', 'لم يُسجّل']);
  assert.ok(d.terms.some(t => /^Spring \d{4}$/.test(t)) && d.terms.some(t => /^Fall \d{4}$/.test(t)) && d.terms.some(t => /^Summer \d{4}$/.test(t)));
  assert.deepEqual(ok(e.callApi('listGroups')).map(g => g.group_name), ['Orion', 'Polaris']);
});

test('setup creates all tabs with expected headers', () => {
  const e = fresh(); for (const n of ['Members', 'Activities', 'Attendance', 'PointsLedger', 'Settings', 'Report']) assert.ok(e.sheets[n], n);
  assert.equal(e.sheets.Attendance.rows[0].length >= 15, true); assert.ok(e.sheets.Settings.rows.some(r => r[0] === 'attendance:S7'));
});

test('members: create, validate, edit keeps code + QR token, list', () => {
  const e = fresh(); const m = mkMember(e);
  assert.match(m.member_id, /^[A-Z]{3}\d{3}$/); assert.equal(m.qr_token.length, 64); assert.equal(m.group_id, 'Orion');
  bad(e.callApi('saveMember', { full_name: '', unit: 'Orion', troop: 'كروان' }), 'INVALID');
  bad(e.callApi('saveMember', { full_name: 'x', unit: 'Mars', troop: 'كروان' }), 'INVALID');
  bad(e.callApi('saveMember', { full_name: 'x', unit: 'Orion', troop: 'كوبرا' }), 'INVALID'); // Polaris troop in Orion
  const edited = ok(e.callApi('saveMember', { member_id: m.member_id, full_name: 'منى جرجس يوسف', unit: 'Orion', troop: 'نمر', active: true }));
  assert.equal(edited.member_id, m.member_id); assert.equal(edited.qr_token, m.qr_token);
  const list = ok(e.callApi('listMembers')); assert.equal(list.length, 1); assert.equal(list[0].full_name, 'منى جرجس يوسف'); assert.equal(list[0].group_name, 'Orion');
  bad(e.callApi('saveMember', { member_id: 'ZZZ999', full_name: 'x', unit: 'Orion', troop: 'كروان' }), 'NOT_FOUND');
});

test('meetings: validation, naming, edit, unit locked once attendance exists', () => {
  const e = fresh();
  bad(e.callApi('saveActivity', { activity_date: '14/03/2025', group_id: 'Orion', term: 'Spring 2025' }), 'INVALID');
  bad(e.callApi('saveActivity', { activity_date: '2025-03-14', group_id: 'Orion', term: 'Winter 2025' }), 'INVALID');
  bad(e.callApi('saveActivity', { activity_date: '2025-03-14', group_id: 'Mars', term: 'Spring 2025' }), 'INVALID');
  bad(e.callApi('saveActivity', { activity_date: '2025-03-14', group_id: 'Orion', term: 'Spring 1999' }), 'INVALID');
  const a = mkMeeting(e); assert.equal(a.activity_name, 'Orion Spring 14-03-2025'); assert.equal(a.status, 'open');
  const up = ok(e.callApi('updateActivity', { activity_id: a.activity_id, activity_date: '2025-03-21', group_id: 'Orion', term: 'Spring 2025' })); assert.equal(up.activity_name, 'Orion Spring 21-03-2025');
  setRules(e); const m = mkMember(e); ok(e.callApi('submit', att(m, a)));
  bad(e.callApi('updateActivity', { activity_id: a.activity_id, activity_date: '2025-03-21', group_id: 'Polaris', term: 'Spring 2025' }), 'HAS_ATTENDANCE');
});

test('attendance: blocked until a point rule is configured, and nothing is written', () => {
  const e = fresh(); const m = mkMember(e), a = mkMeeting(e);
  bad(e.callApi('submit', att(m, a)), 'RULE_UNCONFIGURED'); assert.equal(e.sheets.Attendance.rows.length, 1); assert.equal(e.sheets.PointsLedger.rows.length, 1);
});

test('attendance: record, duplicate rejected, fields stored, points ledger', () => {
  const e = fresh(); setRules(e); const m = mkMember(e), a = mkMeeting(e);
  const r = ok(e.callApi('submit', att(m, a, 'S1', { notes: 'ok', scanned_at: '2025-03-14T16:05:00.000Z' }))); assert.match(r.attendance_id, /^A-/);
  const row = ok(e.callApi('listAttendance'))[0];
  assert.equal(row.attendance_status_label, 'حضر في الميعاد'); assert.equal(row.uniform_status, 'التزام بالزي'); assert.equal(row.mass_participation, 'أيوه');
  assert.equal(row.sunday_school_participation, 'لأ'); assert.equal(row.confession_participation, 'لم يُسجّل'); assert.equal(row.recorded_at, '2025-03-14T16:05:00Z'); assert.equal(row.member_name, 'منى جرجس');
  bad(e.callApi('submit', att(m, a, 'S2')), 'DUPLICATE'); assert.equal(e.sheets.Attendance.rows.length, 2, 'no second row');
  const led = ok(e.callApi('listPointsLedger')); assert.equal(led.length, 1); assert.equal(Number(led[0].points_delta), 10);
  bad(e.callApi('submit', att(m, a, 'S9')), 'INVALID'); bad(e.callApi('submit', att(m, a, 'S1', { uniform_status: 'x' })), 'INVALID'); bad(e.callApi('submit', att(m, a, 'S1', { mass_participation: 'ربما' })), 'INVALID');
});

test('attendance: correction needs matching version; points reconcile by compensating tx', async () => {
  const e = fresh(); setRules(e); const m = mkMember(e), a = mkMeeting(e); ok(e.callApi('submit', att(m, a, 'S1')));
  const ex = ok(e.callApi('listAttendance'))[0];
  bad(e.callApi('submit', att(m, a, 'S5', { correction: true, expected_updated_at: '1999-01-01T00:00:00Z' })), 'CONFLICT');
  ok(e.callApi('submit', att(m, a, 'S5', { correction: true, expected_updated_at: ex.updated_at })));
  assert.equal(ok(e.callApi('listAttendance'))[0].attendance_status_code, 'S5'); assert.equal(e.sheets.Attendance.rows.length, 2);
  const led = ok(e.callApi('listPointsLedger')); assert.equal(led.reduce((s, x) => s + Number(x.points_delta), 0), 0); assert.equal(led.length, 2);
  bad(e.callApi('submit', att({ member_id: m.member_id }, { activity_id: 'ACT-none' }, 'S1', { correction: true })), 'NOT_FOUND');
});

test('eligibility: unit mismatch, inactive member, closed meeting, ALL-unit meeting', () => {
  const e = fresh(); setRules(e); const orion = mkMember(e), pol = mkMember(e, 'مريم', 'Polaris', 'كوبرا');
  const aO = mkMeeting(e, '2025-03-14', 'Orion'), aAll = mkMeeting(e, '2025-03-21', 'ALL');
  bad(e.callApi('submit', att(pol, aO)), 'NOT_ELIGIBLE'); ok(e.callApi('submit', att(pol, aAll))); ok(e.callApi('submit', att(orion, aAll)));
  assert.equal(ok(e.callApi('eligible', { activity_id: aO.activity_id })).length, 1); assert.equal(ok(e.callApi('eligible', { activity_id: aAll.activity_id })).length, 2);
  ok(e.callApi('saveMember', { member_id: orion.member_id, full_name: orion.full_name, unit: 'Orion', troop: 'كروان', active: false }));
  bad(e.callApi('submit', att(orion, aO)), 'MEMBER_INACTIVE');
  ok(e.callApi('finalize', { activity_id: aO.activity_id, status: 'closed', force: true })); bad(e.callApi('submit', att(pol, aO)), 'NOT_ELIGIBLE');
});

test('QR lookup (byToken) is read-only and validates token/meeting', () => {
  const e = fresh(); setRules(e); const m = mkMember(e), a = mkMeeting(e);
  bad(e.callApi('byToken', { token: 'bogus', activity_id: a.activity_id }), 'INVALID_TOKEN');
  const d = ok(e.callApi('byToken', { token: m.qr_token, activity_id: a.activity_id })); assert.equal(d.member.member_id, m.member_id); assert.equal(d.existing, null);
  assert.equal(e.sheets.Attendance.rows.length, 1, 'scan alone writes nothing');
  ok(e.callApi('submit', att(m, a))); assert.ok(ok(e.callApi('byToken', { token: m.qr_token, activity_id: a.activity_id })).existing);
  ok(e.callApi('finalize', { activity_id: a.activity_id, status: 'closed', force: true })); bad(e.callApi('byToken', { token: m.qr_token, activity_id: a.activity_id }), 'ACTIVITY_CLOSED');
});

test('attendance maths: statuses 1-4 attended, 5-7 absent, percentage, class, watch status, points', () => {
  const e = fresh(); setRules(e); const m = mkMember(e); const codes = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  codes.forEach((c, i) => { const a = mkMeeting(e, `2025-03-${String(i + 1).padStart(2, '0')}`, 'Orion', 'Spring 2025'); ok(e.callApi('submit', att(m, a, c, { uniform_status: i < 2 ? 'التزام بالزي' : '' }))); });
  mkMeeting(e, '2025-04-01', 'Orion', 'Spring 2025'); // meeting with no record -> missing
  const g = ok(e.callApi('girlAnalytics', { member_id: m.member_id }));
  assert.equal(g.total_meetings, 8); assert.equal(g.attended, 4); assert.equal(g.absences, 3); assert.equal(g.on_time, 1); assert.equal(g.recorded_meetings, 7); assert.equal(g.missing_records, 1);
  assert.equal(g.attendance_percent, 50); assert.equal(g.class_name, 'C'); assert.equal(g.watch_status, 'يحتاج متابعة'); assert.equal(g.total_points, 20); assert.equal(g.uniform_compliance, 2); assert.equal(g.mass_yes, 7);
  assert.equal(Object.keys(g.status_counts).length, 7); assert.equal(g.history.length, 8);
  const all = ok(e.callApi('allMemberAnalytics', {})); assert.equal(all[0].attendance_percent, 50); assert.equal(all[0].total_points, 20);
});

test('term filtering: season, year, season+year, All (attendance filtered, points lifetime)', () => {
  const e = fresh(); setRules(e); const m = mkMember(e);
  const mk = (d, t) => { const a = mkMeeting(e, d, 'Orion', t); ok(e.callApi('submit', att(m, a, 'S1'))); };
  mk('2025-02-07', 'Spring 2025'); mk('2025-10-10', 'Fall 2025'); mk('2025-07-04', 'Summer 2025'); mk('2026-02-06', 'Spring 2026');
  const t = term => ok(e.callApi('allMemberAnalytics', { term }))[0];
  assert.equal(t('All').total_meetings, 4); assert.equal(t('Spring').total_meetings, 2); assert.equal(t('Fall').total_meetings, 1); assert.equal(t('Summer').total_meetings, 1);
  assert.equal(t('2025').total_meetings, 3); assert.equal(t('2026').total_meetings, 1); assert.equal(t('Spring 2025').total_meetings, 1); assert.equal(t('Fall 2026').total_meetings, 0);
  assert.equal(t('Spring 2025').total_points, 40, 'points stay lifetime across terms');
  assert.equal(ok(e.callApi('girlAnalytics', { member_id: m.member_id, term: 'Spring' })).total_meetings, 2);
});

test('delete attendance keeps manual points; delete meeting/member cascade', () => {
  const e = fresh(); setRules(e); const m = mkMember(e), a = mkMeeting(e), b = mkMeeting(e, '2025-03-21'); ok(e.callApi('submit', att(m, a))); ok(e.callApi('submit', att(m, b)));
  e.sheets.PointsLedger.rows.push(['T-manual', m.member_id, a.activity_id, 7, 'manual', '', 'bonus', '', '2025-03-14T00:00:00Z', 'x', m.full_name]);
  const rec = ok(e.callApi('listAttendance')).find(r => r.activity_id === a.activity_id); ok(e.callApi('deleteAttendance', { attendance_id: rec.attendance_id }));
  const led = ok(e.callApi('listPointsLedger')); assert.ok(led.some(x => x.source === 'manual')); assert.equal(led.filter(x => x.activity_id === a.activity_id && x.source === 'automatic_attendance').length, 0);
  ok(e.callApi('deleteActivity', { activity_id: b.activity_id })); assert.equal(ok(e.callApi('listAttendance')).length, 0);
  ok(e.callApi('deleteMember', { member_id: m.member_id })); assert.equal(ok(e.callApi('listMembers')).length, 0); assert.equal(ok(e.callApi('listPointsLedger')).length, 0);
  bad(e.callApi('deleteMember', { member_id: 'NOPE' }), 'NOT_FOUND'); bad(e.callApi('deleteAttendance', { attendance_id: 'NOPE' }), 'NOT_FOUND');
});

test('import members: Arabic aliases, troop identifies unit, duplicates, errors, 50-row cap', () => {
  const e = fresh();
  const r = ok(e.callApi('importMembers', { rows: [
    { row: 2, full_name: 'سارة', unit: 'اوريون', troop: 'كروان', phone_number: '0100' },
    { row: 3, full_name: 'نورا', troop: 'كوبرا' },
    { row: 4, full_name: 'سارة', unit: 'Orion', troop: 'نمر' },
    { row: 5, full_name: 'ليلى', unit: 'Orion', troop: 'كوبرا' },
    { row: 6, full_name: '', troop: 'نمر' }, { row: 7, full_name: 'هدى', troop: '' } ] }));
  assert.equal(r.added, 2); assert.equal(r.duplicates.length, 1); assert.equal(r.errors.length, 3);
  const l = ok(e.callApi('listMembers')); assert.equal(l.find(m => m.full_name === 'نورا').unit, 'Polaris');
  bad(e.callApi('importMembers', { rows: new Array(51).fill({ full_name: 'a', troop: 'نمر' }) }), 'INVALID');
});

test('reports: meetingReport counts and finalize rules', () => {
  const e = fresh(); setRules(e); const m1 = mkMember(e), m2 = mkMember(e, 'ثانية'), a = mkMeeting(e); ok(e.callApi('submit', att(m1, a, 'S2')));
  const r = ok(e.callApi('meetingReport', { activity_id: a.activity_id })); assert.equal(r.eligible_count, 2); assert.equal(r.recorded_count, 1); assert.equal(r.missing_count, 1); assert.equal(r.status_counts['محضرش في الميعاد ومعتذر'], 1);
  bad(e.callApi('finalize', { activity_id: a.activity_id, status: 'closed' }), 'MISSING_ATTENDANCE'); bad(e.callApi('finalize', { activity_id: a.activity_id, status: 'weird', force: true }), 'INVALID');
  assert.equal(ok(e.callApi('finalize', { activity_id: a.activity_id, status: 'finalized', force: true })).status, 'finalized');
});
