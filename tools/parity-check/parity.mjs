#!/usr/bin/env node
// D18 parity check: v1 facts (the private data repo, read in place) against v2 (`/api/me/*` and the inbox, reached through the
// admin view-as session). Dependency free (Node 20+). See docs/PARITY-CUTOVER.md.
//
// DATA SAFETY: the console output and the summary contain only MSCBs, counts and field names. Values are written only to the
// --detail file (git-ignored `*.parity-detail.json`), and only when --detail is given. Keep that file outside the repository.
//
// usage:
//   node parity.mjs --path <SupportHCMUSData> --api http://localhost:5361 --dev-login T0001      (Development database)
//   node parity.mjs --path ... --api https://... --cookie "<session cookie header>"             (admin session from a browser)
//   options: --sample 5 --seed 18  --mscb 0001,0002  --edge  --bulk 300  --out summary.json  --detail x.parity-detail.json

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]) : def; };
const repo = opt('path'); const api = (opt('api', 'http://localhost:5361') + '').replace(/\/+$/, '');
if (!repo) { console.error('--path <SupportHCMUSData> is required'); process.exit(2); }
const sampleN = Number(opt('sample', 5)); const seed = Number(opt('seed', 18)); const bulkN = Number(opt('bulk', 0));
const explicit = (opt('mscb', '') + '').split(',').map((s) => s.trim()).filter(Boolean);
const withEdge = opt('edge', false) === true; const outFile = opt('out'); const detailFile = opt('detail');
const devLogin = opt('dev-login'); const cookieArg = opt('cookie');
const NOTIF = existsSync(join(repo, 'notifications')) ? join(repo, 'notifications') : repo;

// ------------------------------------------------------------------ v1 readers
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const strip = (k) => k.replace(/^\{|\}$/g, '');
function loadCategory(name) {
  const dir = join(NOTIF, name);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort((a, b) => (parseInt(a.match(/-(\d+)\.json$/)?.[1] ?? '1e9') - parseInt(b.match(/-(\d+)\.json$/)?.[1] ?? '1e9')) || a.localeCompare(b)) : [];
  const by = new Map();
  for (const f of files) {
    const env = readJson(join(dir, f));
    for (const [mscb, rows] of Object.entries(env.values ?? {})) {
      if (!Array.isArray(rows)) continue;
      const list = by.get(mscb.trim()) ?? by.set(mscb.trim(), []).get(mscb.trim());
      for (const r of rows) {
        const o = {};
        for (const [k, v] of Object.entries(r)) o[strip(k)] = v == null ? '' : String(v).trim();
        list.push(o);
      }
    }
  }
  return by;
}
const cats = {};
for (const c of ['general-profile', 'detailed-profile', 'salary-progress', 'award', 'title', 'position', 'academic-progress', 'training-progress', 'business-mission', 'innovation'])
  cats[c] = loadCategory(c);
const users = readJson(join(repo, 'config', 'users.json'));
const userById = new Map(users.map((u) => [String(u.id).trim(), u]));
const papers = readJson(join(NOTIF, 'paper-details.json'));
const researchEnv = readJson(join(NOTIF, 'research-stats.json'));
const teachingFiles = readdirSync(join(NOTIF, 'teaching-stats')).filter((f) => f.endsWith('.json')).map((f) => readJson(join(NOTIF, 'teaching-stats', f)));
const newsDir = join(NOTIF, 'news');
const newsFiles = readdirSync(newsDir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f, key: f.replace(/\.json$/, ''), env: readJson(join(newsDir, f)) }));
const bannerEnv = readJson(join(NOTIF, 'request-update-info', 'request-update-info-0.json'));

// MSCB normalisation of the D15 datasets (docs/MIGRATION.md): `_0246` -> `0246`, `408` -> `0408` when that makes a known employee.
const knownCodes = new Set([...cats['general-profile'].keys()]);
function normMscb(raw) {
  const s = raw.trim();
  if (knownCodes.has(s)) return s;
  const t = s.replace(/^[_'"`]+/, '');
  if (knownCodes.has(t)) return t;
  if (/^\d{1,3}$/.test(t) && knownCodes.has(t.padStart(4, '0'))) return t.padStart(4, '0');
  return s;
}

// ------------------------------------------------------------------ normalisers
const ws = (s) => (s == null ? null : String(s).replace(/[​-‏⁠﻿]/g, '').replace(/[ \s]+/g, ' ').trim() || null); // the D15 importers clean non-breaking spaces and zero-width characters
const nz = (s) => (s == null || String(s).trim() === '' ? null : String(s).trim());
const numStr = (s) => { const t = nz(s); if (t == null) return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : null; };
const intStr = (s) => { const t = nz(s); return t != null && /^\d+$/.test(t) ? String(parseInt(t, 10)) : null; };
const dec = (n) => (n == null ? null : String(Math.round(Number(n) * 1e6) / 1e6));
function isoDay(y, m, d) { if (y < 1900) return null; /* the Sync tool and the ingest refuse earlier years: a typo such as 1017 is stored as null */ const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; }
/** v1 date text -> {v, ok}: yyyy-MM-dd, yyyy-MM, yyyy (partial), or ok=false for a text nobody can read (stored as null). */
function v1Date(text) {
  const s = nz(text); if (s == null) return { v: null, ok: true };
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = isoDay(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)); return d ? { v: d, ok: true } : { v: null, ok: false }; }
  const p = s.split(/[/\-.]/);
  if (p.every((x) => /^\d+$/.test(x))) {
    if (p.length === 3 && p[2].length === 4) { const d = isoDay(+p[2], +p[1], +p[0]); return d ? { v: d, ok: true } : { v: null, ok: false }; }
    if (p.length === 2 && p[1].length === 4 && +p[0] >= 1 && +p[0] <= 12 && +p[1] >= 1900 && +p[1] <= 2200) return { v: `${p[1]}-${String(+p[0]).padStart(2, '0')}`, ok: true };
    if (p.length === 1 && p[0].length === 4 && +p[0] >= 1900 && +p[0] <= 2200) return { v: p[0], ok: true };
  }
  return { v: null, ok: false };
}
/** What v2 stores in a full-date column: a month or year becomes its first day (docs/INGEST.md), unreadable text becomes null (`bad_date` issue). */
const fullDateExpected = (text) => { const r = v1Date(text); return r.v == null ? null : r.v.length === 10 ? r.v : r.v.length === 7 ? r.v + '-01' : r.v + '-01-01'; };
/** What v2 stores in a partial-date column. */
const partialExpected = (text) => v1Date(text).v;
/** v2 PartialDateDto {date, precision} -> yyyy-MM-dd | yyyy-MM | yyyy */
const v2Partial = (p) => (p == null || p.date == null ? null : p.precision === 'year' ? p.date.slice(0, 4) : p.precision === 'month' ? p.date.slice(0, 7) : p.date);
const v2Day = (d) => (d == null ? null : String(d).slice(0, 10));
const decodeHtml = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ------------------------------------------------------------------ v2 client
let cookie = cookieArg && cookieArg !== true ? cookieArg : '';
const jar = new Map();
function takeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
}
const cookieHeader = () => (cookie ? cookie : [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
async function call(method, path, body, tries = 5) {
  for (let t = 0; t < tries; t++) {
    const headers = { cookie: cookieHeader() };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && jar.has('XSRF-TOKEN')) headers['x-xsrf-token'] = decodeURIComponent(jar.get('XSRF-TOKEN'));
    const res = await fetch(api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    takeCookies(res);
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * (t + 1))); continue; }
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json };
  }
  throw new Error(`rate limited: ${method} ${path}`);
}
const get = async (path) => { const r = await call('GET', path); if (r.status !== 200) throw new Error(`GET ${path} -> ${r.status}`); return r.json; };
async function pages(path, itemsOf) {
  const out = []; let cursor = null;
  for (let i = 0; i < 100; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const j = await get(`${path}${sep}limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    out.push(...itemsOf(j)); cursor = j.nextCursor; if (cursor == null) return out;
  }
  throw new Error('paging did not end: ' + path);
}

// ------------------------------------------------------------------ comparison machinery
const results = []; // {mscb, category, status, v1, v2, notes[], diffs: {field: n}}
const detail = [];  // PII, written only to --detail
const keyOf = (o, fields) => JSON.stringify(fields.map((f) => o[f] ?? null));
/** Compare two row lists as multisets over `fields`; report the unmatched rows and, per field, how many rows differ. */
function compareRows(mscb, category, a, b, fields, notes = []) {
  const count = (list) => { const m = new Map(); for (const r of list) m.set(keyOf(r, fields), (m.get(keyOf(r, fields)) ?? 0) + 1); return m; };
  const ma = count(a), mb = count(b);
  const onlyA = [], onlyB = [];
  for (const [k, n] of ma) { const d = n - (mb.get(k) ?? 0); for (let i = 0; i < d; i++) onlyA.push(JSON.parse(k)); }
  for (const [k, n] of mb) { const d = n - (ma.get(k) ?? 0); for (let i = 0; i < d; i++) onlyB.push(JSON.parse(k)); }
  const diffs = {};
  if (onlyA.length || onlyB.length) {
    fields.forEach((f, i) => {
      const fa = new Map(), fb = new Map();
      for (const r of a) { const v = r[f] ?? null; fa.set(v, (fa.get(v) ?? 0) + 1); }
      for (const r of b) { const v = r[f] ?? null; fb.set(v, (fb.get(v) ?? 0) + 1); }
      let n = 0; for (const [v, c] of fa) n += Math.max(0, c - (fb.get(v) ?? 0));
      if (n) diffs[f] = n;
    });
    detail.push({ mscb, category, onlyV1: onlyA.map((r) => Object.fromEntries(fields.map((f, i) => [f, r[i]]))), onlyV2: onlyB.map((r) => Object.fromEntries(fields.map((f, i) => [f, r[i]]))) });
  }
  const ok = !onlyA.length && !onlyB.length;
  results.push({ mscb, category, status: ok ? 'match' : 'MISMATCH', v1: a.length, v2: b.length, unmatchedV1: onlyA.length, unmatchedV2: onlyB.length, diffs, notes });
}
function compareFacts(mscb, category, pairs, notes = []) {
  // pairs: [field, v1value, v2value]
  const diffs = {}; const rows = [];
  for (const [f, x, y] of pairs) { if ((x ?? null) !== (y ?? null)) { diffs[f] = 1; rows.push({ field: f, v1: x ?? null, v2: y ?? null }); } }
  if (rows.length) detail.push({ mscb, category, facts: rows });
  results.push({ mscb, category, status: rows.length ? 'MISMATCH' : 'match', v1: pairs.length, v2: pairs.length, unmatchedV1: rows.length, unmatchedV2: rows.length, diffs, notes });
}

// ------------------------------------------------------------------ per-category v1 -> canonical, v2 -> canonical
const v1rows = (cat, mscb) => cats[cat].get(mscb) ?? [];

async function checkEmployee(mscb) {
  // ---- salary
  {
    const f = ['grade', 'step', 'coef', 'over', 'decisionNo', 'signedOn', 'effectiveFrom', 'nextRaiseOn', 'note'];
    const a = v1rows('salary-progress', mscb).map((r) => ({ grade: nz(r.Ngach_CongChuc), step: intStr(r.BacCongChuc), coef: numStr(r.HeSoLuong), over: numStr(r.HeSoVuotKhung), decisionNo: nz(r.SoQuyetDinh), signedOn: fullDateExpected(r.NgayKy), effectiveFrom: fullDateExpected(r.NgayHuong), nextRaiseOn: fullDateExpected(r.MocNangLuongTT), note: nz(r.GhiChu) }));
    const j = await get('/api/me/salary');
    const b = j.history.map((r) => ({ grade: nz(r.gradeCode), step: r.step == null ? null : String(r.step), coef: dec(r.coefficient), over: dec(r.overGradePct), decisionNo: nz(r.decisionNo), signedOn: v2Day(r.signedOn), effectiveFrom: v2Day(r.effectiveFrom), nextRaiseOn: v2Day(r.nextRaiseOn), note: nz(r.note) }));
    compareRows(mscb, 'salary', a, b, f);
  }
  // ---- positions
  {
    const f = ['title', 'unit', 'coef', 'appointedOn', 'decisionNo', 'signedOn'];
    const a = v1rows('position', mscb).filter((r) => nz(r.TenChucVu)).map((r) => ({ title: nz(r.TenChucVu), unit: nz(r.MoTa), coef: numStr(r.HSCV), appointedOn: fullDateExpected(r.NgayBoNhiem), decisionNo: nz(r.QuyetDinhBoNhiem), signedOn: fullDateExpected(r.NgayKy) }));
    const j = await get('/api/me/positions');
    const b = j.items.map((r) => ({ title: nz(r.title), unit: nz(r.unitDescription), coef: dec(r.coefficient), appointedOn: v2Day(r.appointedOn), decisionNo: nz(r.decisionNo), signedOn: v2Day(r.signedOn) }));
    compareRows(mscb, 'positions', a, b, f);
  }
  // ---- commendations (award + title)
  {
    const f = ['kind', 'name', 'decisionNo', 'decidedOn'];
    const mk = (kind, cat) => v1rows(cat, mscb).filter((r) => nz(r.LyDo)).map((r) => ({ kind, name: nz(r.LyDo), decisionNo: nz(r.SoQuyetDinh), decidedOn: partialExpected(r.Ngay) }));
    const a = [...mk('award', 'award'), ...mk('title', 'title')];
    const j = await get('/api/me/commendations');
    const flat = (kind, groups) => groups.flatMap((g) => g.items.map((r) => ({ kind, name: nz(r.name), decisionNo: nz(r.decisionNo), decidedOn: v2Partial(r.decidedOn) })));
    const b = [...flat('award', j.awards), ...flat('title', j.titles)];
    compareRows(mscb, 'commendations', a, b, f);
  }
  // ---- degrees
  {
    const f = ['type', 'major', 'institution', 'country', 'form', 'enrolledOn', 'graduatedOn', 'thesis'];
    const a = v1rows('academic-progress', mscb).map((r) => ({ type: nz(r.TenLoaiBangCap), major: nz(r.TenChuyenNganh), institution: nz(r.CoSoDaoTao), country: nz(r.TenQuocTich), form: nz(r.TenHinhThucDaoTao), enrolledOn: partialExpected(r.NgayNhapHoc), graduatedOn: partialExpected(r.NgayTotNghiep), thesis: nz(r.LuanAnTN) }));
    const j = await get('/api/me/degrees');
    const b = j.map((r) => ({ type: nz(r.degreeType), major: nz(r.major), institution: nz(r.institution), country: nz(r.country), form: nz(r.trainingForm), enrolledOn: v2Partial(r.enrolledOn), graduatedOn: v2Partial(r.graduatedOn), thesis: nz(r.thesisTitle) }));
    compareRows(mscb, 'degrees', a, b, f);
  }
  // ---- trainings
  {
    const f = ['content', 'place', 'form', 'startOn', 'endOn'];
    const rows = v1rows('training-progress', mscb); const skipped = rows.filter((r) => !nz(r.NoiDung)).length;
    const a = rows.filter((r) => nz(r.NoiDung)).map((r) => ({ content: nz(r.NoiDung), place: nz(r.NoiBoiDuong), form: nz(r.TenHinhThucDaoTao), startOn: partialExpected(r.NgayBatDau), endOn: partialExpected(r.NgayKetThuc) }));
    const j = await get('/api/me/trainings');
    const b = j.map((r) => ({ content: nz(r.content), place: nz(r.place), form: nz(r.trainingForm), startOn: v2Partial(r.startOn), endOn: v2Partial(r.endOn) }));
    compareRows(mscb, 'trainings', a, b, f, skipped ? [`${skipped} v1 row(s) without NoiDung are skipped by design`] : []);
  }
  // ---- business trips (v1 only holds one debug MSCB)
  {
    const f = ['fromOn', 'toOn', 'place', 'transport', 'decisionNo', 'decidedOn', 'note'];
    const a = v1rows('business-mission', mscb).map((r) => ({ fromOn: fullDateExpected(r.TuNgay), toOn: fullDateExpected(r.DenNgay), place: nz(r.NoiLamViec), transport: nz(r.PhuongTienDiLai), decisionNo: nz(r.SoQuyetDinh1), decidedOn: fullDateExpected(r.NgayQuyetDinh1), note: nz(r.GhiChu) }));
    const j = await get('/api/me/business-trips');
    const b = j.items.map((r) => ({ fromOn: v2Day(r.fromOn), toOn: v2Day(r.toOn), place: nz(r.place), transport: nz(r.transport), decisionNo: nz(r.decisionNo), decidedOn: v2Day(r.decidedOn), note: nz(r.note) }));
    compareRows(mscb, 'business-trips', a, b, f);
  }
  // ---- innovations
  {
    const f = ['code', 'title', 'type', 'decisionNo', 'recognizedOn'];
    const a = v1rows('innovation', mscb).map((r) => { const title = nz(r.mo_ta) ?? nz(r.ma_sk); return { code: nz(r.ma_sk), title, type: nz(r.TenLoaiSangKien), decisionNo: nz(r.SoQuyetDinh), recognizedOn: fullDateExpected(r.ngay) }; }).filter((r) => r.title);
    const items = await pages('/api/me/innovations', (j) => j.items);
    const b = items.map((r) => ({ code: nz(r.code), title: nz(r.title), type: nz(r.type), decisionNo: nz(r.decisionNo), recognizedOn: v2Day(r.recognizedOn) }));
    compareRows(mscb, 'innovations', a, b, f);
  }
  // ---- general profile
  {
    const g = v1rows('general-profile', mscb)[0] ?? {}; const d = v1rows('detailed-profile', mscb)[0] ?? {};
    const dupes = v1rows('general-profile', mscb).length;
    if (dupes > 1) { results.push({ mscb, category: 'profile', status: 'duplicate_mscb', v1: dupes, v2: 0, notes: ['duplicate MSCB in v1: quarantined by design'], diffs: {} }); return; }
    const gen = await get('/api/me/profile/general');
    const parts = (day, month, year) => { const y = nz(year); if (!y) return null; const m = nz(month), dd = nz(day); if (!/^\d{4}$/.test(y)) return null; if (!m) return y; const mm = +m; if (!(mm >= 1 && mm <= 12)) return null; if (!dd) return `${y}-${String(mm).padStart(2, '0')}`; return isoDay(+y, mm, +dd) ?? null; };
    const dobExp = parts(g.NGAYSINH, g.THANGSINH, g.NAMSINH);
    compareFacts(mscb, 'general-profile', [
      ['fullName', `${g.HODEM ?? ''} ${g.TEN ?? ''}`.trim(), gen.fullName], ['dob', dobExp, v2Partial(gen.dateOfBirth)],
      ['gender', nz(g.TENGIOITINH), nz(gen.gender)], ['ethnicity', nz(g.TenDanToc), nz(gen.ethnicity)], ['religion', nz(g.TenTonGiao), nz(gen.religion)], ['nationality', nz(g.TenQuocTich), nz(gen.nationality)],
      ['birthPlace', nz(g.NOISINH), nz(gen.birthPlace)], ['hometown', nz(g.NGUYENQUAN), nz(gen.hometown)],
      ['phoneMobile', nz(g.DIDONG), nz(gen.phoneMobile)], ['phoneHome', nz(g.DIENTHOAI), nz(gen.phoneHome)], ['personalEmail', nz(g.EMAIL), nz(gen.personalEmail)],
      ['permAddress', nz(g.HoKhauThuongTru), nz(gen.permanentAddress?.address)], ['permWard', nz(g.TenPhuongXa), nz(gen.permanentAddress?.ward)], ['permDistrict', nz(g.TenQuanHuyen), nz(gen.permanentAddress?.district)], ['permProvince', nz(g.TenTinhThanhPho), nz(gen.permanentAddress?.province)],
      ['contactAddress', nz(g.DCLL), nz(gen.contactAddress?.address)], ['contactWard', nz(g.TenPhuongXaLienLac), nz(gen.contactAddress?.ward)], ['contactDistrict', nz(g.TenQuanHuyenLienLac), nz(gen.contactAddress?.district)], ['contactProvince', nz(g.TenTinhThanhPhoLienLac), nz(gen.contactAddress?.province)],
    ]);
    // ---- sign-in emails (users.json -> employee_emails; additive, so editors' later additions would only add to v2)
    {
      const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
      const v1 = [...new Set((userById.get(mscb)?.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(validEmail))].sort();
      const v2 = [...new Set((gen.emails ?? []).map((e) => e.toLowerCase()))].sort();
      compareFacts(mscb, 'sign-in emails', [['emails', JSON.stringify(v1), JSON.stringify(v2)], ['count', String(v1.length), String(v2.length)]]);
    }
    // ---- detailed profile (masked values: compare presence and the last four characters, never the value)
    const det = await get('/api/me/profile/detailed');
    const hasLast = (raw, m) => { const r = nz(raw); const last = (r ?? '').slice(-4); return [r != null, m.hasValue, r == null ? null : (m.masked ?? '').endsWith(last)]; };
    const sens = [['nationalId', g.SOCMND, det.nationalId], ['taxCode', d.MST, det.taxCode], ['bankAccount', d.SOTAIKHOAN, det.bankAccount], ['socialInsuranceNo', d.BHXH, det.socialInsuranceNo], ['healthInsuranceNo', d.BHYT, det.healthInsuranceNo]];
    const pairs = [
      ['unit', nz(d.TenDonVi), nz(det.unit)], ['department', nz(d.TenPhongBan), nz(det.department)], ['positionTitle', nz(d.TenChucVu), nz(det.positionTitle)],
      ['gradeCode', nz(d.Ngach_CongChuc), nz(det.salaryGradeCode)], ['step', intStr(d.BacCongChuc), det.salaryStep == null ? null : String(det.salaryStep)], ['coef', numStr(d.HeSoLuong), dec(det.salaryCoefficient)],
      ['academicRank', nz(d.TenHocHam), nz(det.academicRank)], ['degree', nz(d.TenHocVi), nz(det.degree)], ['educationLevel', nz(d.TenTrinhDoHocVan), nz(det.educationLevel)], ['major', nz(d.TenChuyenNganh), nz(det.major)], ['politicalTheory', nz(d.TenChinhTri), nz(det.politicalTheory)],
      ['partyMember', String(nz(d.DANGVIENTEXT) != null), String(det.party.isMember)], ['partyJoinedOn', fullDateExpected(d.NGAYVAODANG), v2Day(det.party.joinedOn)], ['partyFileNo', nz(d.HSDANG), nz(det.party.fileNo)], ['partyCardNo', nz(d.THEDANG), nz(det.party.cardNo)],
      ['youthMember', String(nz(d.DOANVIENTEXT) != null), String(det.youthUnion.isMember)], ['youthFileNo', nz(d.HSDOAN), nz(det.youthUnion.fileNo)], ['youthCardNo', nz(d.THEDOAN), nz(det.youthUnion.cardNo)],
      ['tradeUnionMember', String(nz(d.CongDoanVienText) != null), String(det.tradeUnion.isMember)], ['tradeUnionJoinedOn', fullDateExpected(d.NgayVaoCongDoan), v2Day(det.tradeUnion.joinedOn)], ['tradeUnionCardNo', nz(d.THECONGDOAN), nz(det.tradeUnion.cardNo)],
      ['nationalIdIssuedOn', fullDateExpected(g.NGAYCAP), v2Day(det.nationalIdIssuedOn)], ['nationalIdIssuedBy', nz(g.NOICAP), nz(det.nationalIdIssuedBy)], ['bankName', nz(d.TenNganHang), nz(det.bankName)], ['bankBranch', nz(d.NganHangChiNhanh), nz(det.bankBranch)],
    ];
    for (const [name, raw, m] of sens) { const [x, y, z] = hasLast(raw, m); pairs.push([name + '.hasValue', String(x), String(y)]); if (x) pairs.push([name + '.last4', 'true', String(z)]); }
    compareFacts(mscb, 'detailed-profile', pairs);
  }
  // ---- teaching (per academic year: number of rows and the sum of standard hours; program split is covered by the D15 tests)
  {
    const exp = new Map(); // year -> {n, hours}
    for (const env of teachingFiles) {
      const year = (env.header.match(/(\d{4})\s*-\s*(\d{4})/) ?? []).slice(1, 3).join('-');
      for (const [key, rows] of Object.entries(env.values ?? {})) {
        if (!key.trim() || normMscb(key) !== mscb) continue;
        for (const r of rows) for (const tr of (r['{rows}'] ?? '').matchAll(/<tr>(.*?)<\/tr>/gis)) {
          const cells = [...tr[1].matchAll(/<td>(.*?)<\/td>/gis)].map((m) => decodeHtml(m[1]).trim());
          if (cells.length !== 4 || !cells[0]) continue;
          const h = Number(cells[3].replace(',', '.')); if (!Number.isFinite(h)) continue;
          const e = exp.get(year) ?? exp.set(year, { n: 0, hours: 0 }).get(year); e.n++; e.hours += Math.round(h * 100) / 100;
        }
      }
    }
    const years = await get('/api/me/teaching/years');
    const pairs = [['years', JSON.stringify([...exp.keys()].sort()), JSON.stringify([...years].sort())]];
    for (const y of years) {
      const t = await get('/api/me/teaching?year=' + encodeURIComponent(y));
      const n = t.programs.reduce((s, p) => s + p.terms.reduce((q, x) => q + x.items.length, 0) + p.modules.reduce((q, x) => q + x.items.length, 0), 0);
      const hours = t.programs.reduce((s, p) => s + p.terms.reduce((q, x) => q + x.items.reduce((u, i) => u + i.standardHours, 0), 0) + p.modules.reduce((q, x) => q + x.items.reduce((u, i) => u + i.standardHours, 0), 0), 0);
      const e = exp.get(y) ?? { n: 0, hours: 0 };
      pairs.push([`${y}.rows`, String(e.n), String(n)], [`${y}.hours`, e.hours.toFixed(2), hours.toFixed(2)], [`${y}.statsHours`, e.hours.toFixed(2), Number(t.stats.totalStandardHours).toFixed(2)]);
    }
    for (const y of exp.keys()) if (!years.includes(y)) pairs.push([`${y}.rows`, String(exp.get(y).n), '0']);
    compareFacts(mscb, 'teaching', pairs, [`years v1=${exp.size} v2=${years.length}`]);
  }
  // ---- research projects (one project per code with members; the person's role and the project facts)
  {
    const f = ['code', 'title', 'funding', 'role', 'level', 'result', 'acceptedOn'];
    const roleOf = (t) => (/^(đồng )?chủ nhiệm$/i.test((nz(t) ?? '').normalize('NFC')) ? 'chu_nhiem' : 'thanh_vien');
    const a = [];
    for (const [key, rows] of Object.entries(researchEnv.values ?? {})) {
      if (!key.trim() || normMscb(key) !== mscb) continue;
      for (const r of rows) { const o = {}; for (const [k, v] of Object.entries(r)) o[strip(k)] = v == null ? '' : String(v).trim(); a.push(o); }
    }
    const seen = new Set();
    const aa = []; // v1 has one row per member; a person with two rows on a code is one project in v2
    for (const r of a) { const code = nz(r.ma_so); if (!code || seen.has(code)) continue; seen.add(code); aa.push(r); }
    const exp = aa.map((r) => ({ code: nz(r.ma_so), title: ws(r.ten_de_tai), funding: numStr((r.kinh_phi ?? '').replace(/\./g, '').replace(/,/g, '.')), role: roleOf(r.tu_cach_tham_gia), level: nz(r.TenCapDeTai), result: nz(r.TenKetQuaDT), acceptedOn: (() => { const x = v1Date(r.NgayNghiemThu).v; return x == null ? null : x.length === 10 ? x : x.length === 7 ? x + '-01' : x + '-01-01'; })() }));
    const items = await pages('/api/me/research/projects', (j) => j.items);
    const b = items.map((r) => ({ code: nz(r.code), title: ws(r.title), funding: dec(r.funding), role: r.myRole, level: nz(r.level), result: nz(r.result), acceptedOn: v2Day(r.acceptedOn) }));
    compareRows(mscb, 'research', exp, b, f, a.length !== aa.length ? [`${a.length - aa.length} repeated member row(s) of the same code merged`] : []);
  }
  // ---- publications
  {
    const a = papers.filter((p) => (p.Mscb ?? []).some((m) => normMscb(String(m)) === mscb)).map((p) => ({ eid: nz(p.Eid) }));
    const items = await pages('/api/me/research/publications', (j) => j.items);
    compareRows(mscb, 'publications', a, items.map((p) => ({ eid: nz(p.eid) })), ['eid']);
  }
  // ---- inbox / news
  await checkInbox(mscb);
}

// The v1 notification posts of this person (news files that list the MSCB, plus the banner and the surveys sent to everybody) against the v2 inbox.
const TEST_POST = '2022-12-12-test';
const usesVars = (env) => { const rows = Object.values(env.values ?? {}).find((r) => Array.isArray(r) && r.length); if (!rows) return false; return Object.keys(rows[0]).some((k) => (env.template ?? '').includes(k) || (env.template ?? '').includes('(' + k.replace(/^\{|\}$/g, '') + ')')); };
const placeholderCount = (env) => { const rows = Object.values(env.values ?? {}).find((r) => Array.isArray(r) && r.length); if (!rows) return 0; return Object.keys(rows[0]).reduce((n, k) => n + (env.template.split(k).length - 1) + (env.template.split('(' + k.replace(/^\{|\}$/g, '') + ')').length - 1), 0); };
const withEmail = users.filter((u) => (u.emails ?? []).length).length;
function expectedNews(mscb) {
  const out = [];
  for (const n of newsFiles) {
    if (n.key === TEST_POST) continue;
    const vars = usesVars(n.env);
    const keys = Object.keys(n.env.values ?? {}).map((k) => k.trim());
    const rows = n.env.values?.[mscb];
    const broadcast = !vars && keys.length >= 0.9 * withEmail; // imported as audience_all (docs/MIGRATION.md)
    const listed = Array.isArray(rows);
    if (listed || broadcast) out.push({ key: n.key, title: n.env.header.replace(/\s+/g, ' ').trim(), vars, broadcast, widened: broadcast && !listed, datestr: n.env.datestr, rows: vars && listed ? rows.map((r) => Object.entries(r).filter(([k]) => (n.env.template ?? '').includes(k) || (n.env.template ?? '').includes('(' + k.replace(/^\{|\}$/g, '') + ')')).map(([, v]) => String(v ?? '').trim())) : [], env: n.env });
  }
  return out;
}
const NAMED = { aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', egrave: 'è', ecirc: 'ê', iacute: 'í', igrave: 'ì', oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ugrave: 'ù', yacute: 'ý', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
/** v1 templates sometimes hold `&amp;iacute;` (the person saw the literal text `&iacute;`); v2 shows the character. Decode the second layer too. */
const decodeNamed = (s) => s.replace(/&([a-z]+);/g, (m, n) => NAMED[n] ?? m);
const plain = (s) => decodeNamed(decodeHtml(String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))).replace(/[​-‏⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
const words = (s) => (String(s).toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []);
const vnDay = (iso) => new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 10);
const inboxInfo = [];
async function checkInbox(mscb) {
  const items = await pages('/api/notifications', (j) => j.items);
  const gen = await get('/api/me/profile/general');
  if (!(gen.emails ?? []).length) { // no mapped email (invalid or missing in the v1 sheet): deliveries are only made to people who can sign in
    results.push({ mscb, category: 'inbox', status: items.length ? 'MISMATCH' : 'no_mapped_email', v1: expectedNews(mscb).length, v2: items.length, notes: ['no mapped email: v2 delivers to nobody until HR fixes the v1 sheet entry'], diffs: {} });
    return;
  }
  const exp = expectedNews(mscb);
  const byTitle = new Map(); for (const i of items) { const l = byTitle.get(i.title.trim()) ?? byTitle.set(i.title.trim(), []).get(i.title.trim()); l.push(i); }
  const pairs = []; const usedIds = new Set();
  const countOf = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
  const bannerTitle = nz(bannerEnv.header) ?? (items.find((i) => i.pinned)?.title ?? '').trim(); // v1 left the banner header empty; the importer titled it
  const wantTitles = [...exp.map((e) => e.title), bannerTitle];
  const wantC = countOf(wantTitles); const haveC = countOf(items.map((i) => i.title.trim()));
  for (const [t, c] of wantC) pairs.push([`post.count[${t.slice(0, 50)}]`, String(c), String(haveC.get(t) ?? 0)]);
  pairs.push(['post.pinned', '1', String(items.filter((i) => i.pinned).length)]);
  const extra = items.filter((i) => !wantC.has(i.title.trim()));
  pairs.push(['post.total', String(wantTitles.length), String(items.length)], ['post.unexpected', '0', String(extra.length)]);
  const info = { posts: exp.length, withValues: 0, widenedToAll: exp.filter((e) => e.widened).length, markedRead: items.filter((i) => i.readAt).length, unread: items.filter((i) => !i.readAt).length };
  for (const e of exp) {
    // v1 reuses titles across files (parts 1/2, GVCC and others): pick the unused candidate whose body and values agree
    const cands = (byTitle.get(e.title) ?? []).filter((c) => !usedIds.has(c.id)); if (!cands.length) continue;
    let d = null;
    for (const c of cands) {
      const dd = await get('/api/notifications/' + c.id);
      const rv = Array.isArray(dd.vars) ? dd.vars : Array.isArray(dd.vars?.rows) ? dd.vars.rows : [];
      const f = (rs) => JSON.stringify(rs.map((r) => Object.values(r ?? {}).map((x) => plain(x)).filter((x) => x !== '').sort().join('')).sort());
      if (!d) d = dd;
      if (!e.vars || f(rv) === f(e.rows.map((r) => r))) { d = dd; break; }
    }
    usedIds.add(d.id);
    pairs.push([`${e.key}.date`, e.datestr, vnDay(d.deliveredAt)]);
    // the text the person reads: every word of the v1 template is in the v2 body (placeholders aside)
    const have = new Set(words(plain(d.bodyMd).replace(/[:\[\]\*_`#>|()-]/g, ' ')));
    const missing = [...new Set(words(plain(e.env.template).replace(/\{[^}]*\}/g, ' ').replace(/\(\d+\)/g, ' ')))].filter((w) => !have.has(w));
    pairs.push([`${e.key}.bodyWordsMissing`, '0', String(missing.length)]); if (missing.length) detail.push({ mscb, category: 'inbox', post: e.key, missingWords: missing });
    if (!e.vars) { pairs.push([`${e.key}.noVariables`, 'true', String((d.variables ?? []).length === 0)]); continue; }
    info.withValues++;
    const vars = d.vars; const rowsV2 = Array.isArray(vars) ? vars : Array.isArray(vars?.rows) ? vars.rows : (vars?.[mscb] ?? vars?.row ?? []);
    const v2Rows = (Array.isArray(rowsV2) ? rowsV2 : [rowsV2]).map((r) => Object.values(r ?? {}).map((x) => plain(x)));
    pairs.push([`${e.key}.rows`, String(e.rows.length), String(v2Rows.length)]);
    const flat = (rs) => rs.map((r) => r.map((x) => plain(x)).filter((x) => x !== '').sort().join('\u001f')).sort();
    pairs.push([`${e.key}.values`, JSON.stringify(flat(e.rows)), JSON.stringify(flat(v2Rows))]);
    pairs.push([`${e.key}.placeholders`, String(placeholderCount(e.env)), String((d.bodyMd.match(/:var\[/g) ?? []).length)]);
  }
  compareFacts(mscb, 'inbox', pairs, [`v1 expects ${wantTitles.length} post(s) (${info.widenedToAll} widened to everyone), v2 inbox has ${items.length}`]);
  inboxInfo.push({ mscb, ...info });
}

// ------------------------------------------------------------------ sampling
const catsOf = (m) => {
  const c = [];
  if (v1rows('salary-progress', m).length) c.push('salary'); if (v1rows('award', m).length) c.push('award'); if (v1rows('title', m).length) c.push('title');
  if (v1rows('position', m).length) c.push('position'); if (v1rows('academic-progress', m).length) c.push('degree'); if (v1rows('training-progress', m).length) c.push('training');
  if (v1rows('innovation', m).length) c.push('innovation');
  if (teachingFiles.some((e) => Object.keys(e.values ?? {}).some((k) => normMscb(k) === m))) c.push('teaching');
  if (Object.keys(researchEnv.values ?? {}).some((k) => normMscb(k) === m)) c.push('research');
  if (expectedNews(m).filter((e) => !e.broadcast).length) c.push('news');
  return c;
};
function rng(s) { let x = s >>> 0; return () => { x = (x + 0x6d2b79f5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, r) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
// Real staff: in users.json with an email (they can sign in), one general-profile row (not a duplicate MSCB).
const eligible = users.map((u) => String(u.id).trim()).filter((m) => (userById.get(m).emails ?? []).length && (cats['general-profile'].get(m) ?? []).length === 1);

function pickSample(n) {
  const r = rng(seed); const pool = shuffle(eligible, r).slice(0, 4000).map((m) => ({ m, c: catsOf(m) }));
  const want = ['salary', 'award', 'title', 'position', 'degree', 'training', 'innovation', 'teaching', 'research', 'news'];
  const chosen = []; const covered = new Set();
  while (chosen.length < n && pool.length) {
    // greedy on uncovered categories; ties (and the last picks) favour people with the richest records
    pool.sort((x, y) => (y.c.filter((c) => !covered.has(c)).length - x.c.filter((c) => !covered.has(c)).length) || (y.c.length - x.c.length));
    const p = pool.shift(); chosen.push(p); p.c.forEach((c) => covered.add(c));
  }
  return { chosen, uncovered: want.filter((c) => !covered.has(c)) };
}

// ------------------------------------------------------------------ main
async function main() {
  if (!cookie) {
    if (!devLogin) { console.error('give --dev-login <admin MSCB> (Development) or --cookie "<name>=<value>; ..."'); process.exit(2); }
    const r = await call('POST', '/api/auth/dev-login', { employeeCode: devLogin });
    if (r.status !== 200) throw new Error('dev-login failed: ' + r.status);
  }
  const me = await call('GET', '/api/auth/me'); if (me.status !== 200) throw new Error('not signed in: ' + me.status);
  if (!(me.json.roles ?? []).includes('admin')) throw new Error('the session is not an admin session (view-as needs it)');
  const adminCode = me.json.code;

  const sample = explicit.length ? { chosen: explicit.map((m) => ({ m, c: catsOf(m) })), uncovered: [] } : pickSample(sampleN);
  const list = sample.chosen.map((x) => x.m);
  const edge = [];
  if (withEdge) {
    for (const m of cats['business-mission'].keys()) edge.push(m);                        // the only MSCB with business trips
    for (const p of papers) for (const m of p.Mscb ?? []) edge.push(normMscb(String(m)));  // paper authors
    for (const m of [...cats['general-profile'].entries()].filter(([, r]) => r.length > 1).map(([m]) => m).slice(0, 3)) edge.push(m); // duplicate MSCBs
  }
  const bulk = bulkN ? shuffle(eligible, rng(seed + 1)).slice(0, bulkN) : [];
  const groups = [['sample', list], ['edge', [...new Set(edge)].filter((m) => !list.includes(m))], ['bulk', bulk.filter((m) => !list.includes(m))]];

  const summary = { api, generatedAt: new Date().toISOString(), groups: {} };
  for (const [name, mscbs] of groups) {
    if (!mscbs.length) continue;
    const start = results.length;
    for (const m of mscbs) {
      if (m === adminCode) { console.log(`skip ${m} (the admin session itself)`); continue; }
      const v = await call('POST', '/api/admin/view-as', { employeeCode: m });
      if (v.status === 404 && (cats['general-profile'].get(m) ?? []).length > 1) { results.push({ mscb: m, category: 'duplicate-mscb', status: 'quarantined', v1: (cats['general-profile'].get(m) ?? []).length, v2: 0, notes: ['duplicate MSCB in v1: quarantined by the ingest (not an employee, no sign-in)'], diffs: {} }); continue; }
      if (v.status !== 200) { results.push({ mscb: m, category: 'view-as', status: 'MISMATCH', v1: 1, v2: 0, notes: [`view-as start -> ${v.status}`], diffs: {} }); continue; }
      try { await checkEmployee(m); }
      catch (e) { results.push({ mscb: m, category: 'error', status: 'MISMATCH', v1: 0, v2: 0, notes: [String(e.message)], diffs: {} }); }
      await call('DELETE', '/api/admin/view-as');
    }
    const mine = results.slice(start);
    const byCat = {};
    for (const r of mine) { const c = byCat[r.category] ?? (byCat[r.category] = { checks: 0, match: 0, mismatch: 0, other: 0, v1Rows: 0, v2Rows: 0 }); c.checks++; if (r.status === 'match') c.match++; else if (r.status === 'MISMATCH') c.mismatch++; else c.other++; c.v1Rows += r.v1; c.v2Rows += r.v2; }
    summary.groups[name] = { mscbs: mscbs.length, byCategory: byCat, categoriesCovered: sample.chosen && name === 'sample' ? [...new Set(sample.chosen.flatMap((x) => x.c))] : undefined, uncoveredBySample: name === 'sample' ? sample.uncovered : undefined, perMscb: Object.fromEntries(mscbs.map((m) => [m, results.filter((r) => r.mscb === m).map((r) => `${r.category}:${r.status}:${r.v1}/${r.v2}`)])) };
    console.log(`\n== ${name}: ${mscbs.length} MSCB(s)`);
    for (const [c, s] of Object.entries(byCat)) console.log(`  ${c.padEnd(18)} checks=${s.checks} match=${s.match} MISMATCH=${s.mismatch} other=${s.other}  rows v1=${s.v1Rows} v2=${s.v2Rows}`);
  }
  summary.inbox = { people: inboxInfo.length, posts: inboxInfo.reduce((n, x) => n + x.posts, 0), widenedToAll: inboxInfo.reduce((n, x) => n + x.widenedToAll, 0), markedRead: inboxInfo.reduce((n, x) => n + x.markedRead, 0), unread: inboxInfo.reduce((n, x) => n + x.unread, 0) };
  console.log(`inbox: ${JSON.stringify(summary.inbox)}`);
  summary.mismatches = results.filter((r) => r.status === 'MISMATCH').map((r) => ({ mscb: r.mscb, category: r.category, v1: r.v1, v2: r.v2, unmatchedV1: r.unmatchedV1, unmatchedV2: r.unmatchedV2, fields: r.diffs, notes: r.notes }));
  console.log(`\nMISMATCHES: ${summary.mismatches.length}`);
  for (const m of summary.mismatches.slice(0, 60)) console.log(`  MSCB=${m.mscb} ${m.category} v1=${m.v1} v2=${m.v2} unmatched v1/v2=${m.unmatchedV1}/${m.unmatchedV2} fields=${JSON.stringify(m.fields)} ${m.notes.join('; ')}`);
  if (outFile && outFile !== true) writeFileSync(outFile, JSON.stringify(summary, null, 1));
  if (detailFile && detailFile !== true) { writeFileSync(detailFile, JSON.stringify(detail, null, 1)); console.log(`detail (contains personal data, keep it out of the repository): ${detailFile}`); }
  process.exit(summary.mismatches.length ? 1 : 0);
}
main().catch((e) => { console.error('parity check failed:', e.message); process.exit(2); });
