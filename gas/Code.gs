// 自宅筋トレ記録の写しを受け取る Google Apps Script。
// スプレッドシートの「拡張機能 → Apps Script」に貼り付け、ウェブアプリとして公開して使う。
// 下の合言葉はアプリの連携コードと同じものにする（このファイルを公開の場所に置くときは空にしておく）。
const KEY = '';

const KEEP_DAYS = 90;     // 写しは1日1行、90日分残す
const CHUNK = 45000;      // 1セルの上限（5万文字）より小さく分けて入れる

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!KEY || req.key !== KEY) return reply({ok: false, error: '合言葉が違います'});
    if (req.action === 'save') return reply(saveSnapshot(req.day, req.data));
    if (req.action === 'list') return reply({ok: true, list: listSnapshots()});
    if (req.action === 'get') return reply(getSnapshot(req.day));
    return reply({ok: false, error: '知らない操作です'});
  } catch (err) {
    return reply({ok: false, error: String(err)});
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:A').setNumberFormat('@');   // 日付を文字のまま入れる（勝手に日付型にしない）
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

const SNAP_HEADER = ['日付', '送った時刻', 'セット数', '記録の数', '文字数', '分割数', '中身'];
const countOf = d => (d.logs || []).length + (d.bodyLogs || []).length
  + Object.keys(d.snacks || {}).length + Object.keys(d.protein || {}).length;

function saveSnapshot(day, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !data || !Array.isArray(data.logs) || !Array.isArray(data.exercises)) {
    return {ok: false, error: '記録の形が違います'};
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const json = JSON.stringify(data);
    const parts = [];
    for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
    const row = [day, new Date(), data.logs.length, countOf(data), json.length, parts.length].concat(parts);

    const sh = sheet('写し', SNAP_HEADER);
    const days = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0]) : [];
    const at = days.indexOf(day);
    if (at >= 0) {
      sh.getRange(at + 2, 1, 1, sh.getLastColumn()).clearContent();
      sh.getRange(at + 2, 1, 1, row.length).setValues([row]);
    } else {
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    }
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort({column: 1, ascending: true});
    const extra = sh.getLastRow() - 1 - KEEP_DAYS;
    if (extra > 0) sh.deleteRows(2, extra);

    writeReadable(data);
    return {ok: true, savedAt: new Date().toISOString()};
  } finally {
    lock.releaseLock();
  }
}

function listSnapshots() {
  const sh = sheet('写し', SNAP_HEADER);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .map(r => ({day: String(r[0]), savedAt: new Date(r[1]).toISOString(), sets: r[2], records: r[3]}))
    .reverse();
}

function getSnapshot(day) {
  const sh = sheet('写し', SNAP_HEADER);
  if (sh.getLastRow() < 2) return {ok: false, error: '写しがありません'};
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const r = rows.find(x => String(x[0]) === day);
  if (!r) return {ok: false, error: 'その日の写しがありません'};
  const json = r.slice(6, 6 + Number(r[5])).join('');
  return {ok: true, data: JSON.parse(json)};
}

// 人が見るための表（毎回作り直す）
function writeReadable(d) {
  const name = id => ((d.exercises || []).find(x => x.id === id) || {}).name || id;
  const tz = Session.getScriptTimeZone();
  const sets = d.logs.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(l => {
    const t = new Date(l.date);
    return [Utilities.formatDate(t, tz, 'yyyy-MM-dd'), Utilities.formatDate(t, tz, 'HH:mm'), name(l.ex), l.reps, l.weight === 0 ? '自重' : l.weight];
  });
  fill(sheet('セット記録', ['日付', '時刻', '種目', '回数', '重さ(kg)']), sets);

  const SN = {none: 'ゼロ', little: '少し', much: '食べた'};
  const days = {};
  const at = k => days[k] || (days[k] = [k, '', '', '']);
  (d.bodyLogs || []).forEach(b => { if (b.weight != null) at(b.day)[1] = b.weight; });
  Object.entries(d.snacks || {}).forEach(([k, v]) => { at(k)[2] = SN[v] || v; });
  Object.entries(d.protein || {}).forEach(([k, v]) => { at(k)[3] = v.length; });
  fill(sheet('毎日の記録', ['日付', '朝の体重(kg)', 'お菓子', 'プロテインの回数']), Object.values(days).sort((a, b) => a[0] < b[0] ? -1 : 1));
}

function fill(sh, rows) {
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}
