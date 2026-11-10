import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../app/logic.js');

const pad = (n) => String(n).padStart(2, '0');
function dummyChapter(no, nOx, nMc) {
  const ox = [], mc = [];
  for (let i = 1; i <= nOx; i++) ox.push({ id: `c${pad(no)}-ox-${pad(i)}`, text: 't', answer: i % 2 === 0, explain: 'e', sec: null });
  for (let i = 1; i <= nMc; i++) mc.push({ id: `c${pad(no)}-mc-${pad(i)}`, stem: 's', items: [], choices: ['a', 'b', 'c', 'd', 'e'], answer: i % 5, explain: [], tip: null });
  return { no, title: 'ch' + no, lessons: [], ox, mc };
}
const data = { chapters: [dummyChapter(1, 40, 12), dummyChapter(2, 30, 10), dummyChapter(3, 25, 8)] };
const correctAnswers = (exam) => {
  const a = {};
  exam.ox.forEach((q) => (a[q.id] = q.answer));
  exam.mc.forEach((q) => (a[q.id] = q.answer));
  return a;
};

test('gradeOx / gradeMc', () => {
  assert.equal(L.gradeOx({ answer: true }, true).correct, true);
  assert.equal(L.gradeOx({ answer: true }, false).correct, false);
  assert.equal(L.gradeMc({ answer: 2 }, 2).correct, true);
  assert.equal(L.gradeMc({ answer: 0 }, 0).correct, true);
  assert.equal(L.gradeMc({ answer: 2 }, 3).correct, false);
});

test('emptyProgress の形', () => {
  const p = L.emptyProgress();
  assert.equal(p.version, 1);
  assert.equal(p.position, null);
  assert.deepEqual(p.lessonsDone, []);
  assert.deepEqual(p.quizResults, {});
  assert.deepEqual(p.wrongLog, []);
  assert.deepEqual(p.chapterTest, {});
  assert.deepEqual(p.reports, []);
  assert.equal(typeof p.settings.passRate, 'number');
  assert.equal(p.settings.unlockAll, false);
  assert.notEqual(L.emptyProgress(), L.emptyProgress());
});

// Review Focus 1: localStorage が使えない / 壊れたJSON
test('loadProgress: 壊れたJSON -> ok:false, 空の進捗', () => {
  const r = L.loadProgress({ getItem: () => '{broken' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.progress, L.emptyProgress());
});
test('loadProgress: getItem が例外 / storage が null / 形が不正', () => {
  assert.equal(L.loadProgress({ getItem: () => { throw new Error('denied'); } }).ok, false);
  assert.equal(L.loadProgress(null).ok, false);
  assert.equal(L.loadProgress(undefined).ok, false);
  assert.equal(L.loadProgress({ getItem: () => '{"version":2}' }).ok, false);
  assert.equal(L.loadProgress({ getItem: () => '[]' }).ok, false);
});
test('loadProgress: 未保存は ok:true で空の進捗', () => {
  const r = L.loadProgress({ getItem: () => null });
  assert.equal(r.ok, true);
  assert.deepEqual(r.progress, L.emptyProgress());
});
test('saveProgress -> loadProgress の往復、キーは gaimuin.progress.v1', () => {
  const mem = {};
  const st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  const p = L.emptyProgress();
  p.lessonsDone.push('c01-l01');
  p.position = { ch: 1, lessonId: 'c01-l02' };
  assert.equal(L.saveProgress(st, p), true);
  assert.ok('gaimuin.progress.v1' in mem);
  const r = L.loadProgress(st);
  assert.equal(r.ok, true);
  assert.deepEqual(r.progress, p);
});
test('saveProgress: 失敗しても例外を投げず false', () => {
  assert.equal(L.saveProgress({ setItem: () => { throw new Error('quota'); } }, L.emptyProgress()), false);
  assert.equal(L.saveProgress(null, L.emptyProgress()), false);
  assert.equal(L.saveProgress(undefined, L.emptyProgress()), false);
});

// Review Focus 2: 不正な進捗ファイルのインポート拒否
test('importProgress: 正常な進捗を受け入れる', () => {
  const p = L.emptyProgress();
  p.lessonsDone = ['c01-l01'];
  p.quizResults['c01-ox-01'] = { correct: true, ts: 1 };
  p.chapterTest[1] = { score: 8, passed: true };
  p.reports = [{ id: 'c01-ox-01', memo: 'm' }];
  const r = L.importProgress(JSON.stringify(p), L.emptyProgress());
  assert.equal(r.error, null);
  assert.deepEqual(r.progress, p);
});
test('importProgress: 不正な入力は error ありで current を維持', () => {
  const cur = L.emptyProgress();
  cur.lessonsDone = ['keep'];
  const bads = [
    '{"version":2}', '{broken', '', 'null', '[]', '"str"', '123',
    '{}',
    JSON.stringify({ ...L.emptyProgress(), lessonsDone: 'x' }),
    JSON.stringify({ ...L.emptyProgress(), quizResults: [] }),
    JSON.stringify({ ...L.emptyProgress(), quizResults: { a: { correct: 'yes', ts: 1 } } }),
    JSON.stringify({ ...L.emptyProgress(), wrongLog: [1] }),
    JSON.stringify({ ...L.emptyProgress(), chapterTest: { 1: { score: 'a', passed: true } } }),
    JSON.stringify({ ...L.emptyProgress(), reports: [{ id: 1 }] }),
    JSON.stringify({ ...L.emptyProgress(), settings: { passRate: 'x', unlockAll: false } }),
    JSON.stringify({ ...L.emptyProgress(), position: { ch: 'x' } }),
  ];
  for (const b of bads) {
    const r = L.importProgress(b, cur);
    assert.ok(r.error, 'error expected for ' + b);
    assert.equal(r.progress, cur);
    assert.deepEqual(cur.lessonsDone, ['keep']);
  }
  assert.ok(L.importProgress(undefined, cur).error);
});

test('isChapterUnlocked', () => {
  const p = L.emptyProgress();
  assert.equal(L.isChapterUnlocked(p, 1), true);
  assert.equal(L.isChapterUnlocked(p, 2), false);
  p.chapterTest[1] = { score: 3, passed: false };
  assert.equal(L.isChapterUnlocked(p, 2), false);
  p.chapterTest[1] = { score: 8, passed: true };
  assert.equal(L.isChapterUnlocked(p, 2), true);
  assert.equal(L.isChapterUnlocked(p, 3), false);
  p.settings.unlockAll = true;
  assert.equal(L.isChapterUnlocked(p, 3), true);
  assert.equal(L.isChapterUnlocked(p, 10), true);
});

test('examUnlocked: 全章 passed か unlockAll', () => {
  const p = L.emptyProgress();
  assert.equal(L.examUnlocked(p, data), false);
  p.chapterTest[1] = { score: 1, passed: true };
  p.chapterTest[2] = { score: 1, passed: true };
  assert.equal(L.examUnlocked(p, data), false);
  p.chapterTest[3] = { score: 1, passed: true };
  assert.equal(L.examUnlocked(p, data), true);
  const q = L.emptyProgress();
  q.settings.unlockAll = true;
  assert.equal(L.examUnlocked(q, data), true);
});

test('buildExam: ox70 mc30 重複なし、章の比率、決定的な rng', () => {
  let s = 1;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const e = L.buildExam(data, rng);
  assert.equal(e.ox.length, 70);
  assert.equal(e.mc.length, 30);
  assert.equal(new Set(e.ox.map((q) => q.id)).size, 70);
  assert.equal(new Set(e.mc.map((q) => q.id)).size, 30);
  const cnt = (arr, ch) => arr.filter((q) => q.id.startsWith('c' + pad(ch))).length;
  assert.ok(cnt(e.ox, 1) > cnt(e.ox, 3)); // 40 vs 25 問
  assert.ok(cnt(e.ox, 3) >= 1);
  // 同じ rng 系列なら同じ結果
  s = 1;
  const e2 = L.buildExam(data, rng);
  assert.deepEqual(e2.ox.map((q) => q.id), e.ox.map((q) => q.id));
  // Math.random でも壊れない
  assert.equal(L.buildExam(data, Math.random).ox.length, 70);
});

test('buildExam: 問題が足りなければ有るだけ（例外なし）', () => {
  const small = { chapters: [dummyChapter(1, 5, 2)] };
  const e = L.buildExam(small, Math.random);
  assert.equal(e.ox.length, 5);
  assert.equal(e.mc.length, 2);
});

// Review Focus 5: 未回答の採点
test('scoreExam: ox全正解+mc0 -> 140点・不合格', () => {
  const e = L.buildExam(data, Math.random);
  const a = correctAnswers(e);
  e.mc.forEach((q) => delete a[q.id]);
  const r = L.scoreExam(e, a);
  assert.equal(r.points, 140);
  assert.equal(r.max, 440);
  assert.equal(r.pass, false);
});
test('scoreExam: 全正解 -> 440点・合格', () => {
  const e = L.buildExam(data, Math.random);
  const r = L.scoreExam(e, correctAnswers(e));
  assert.equal(r.points, 440);
  assert.equal(r.pass, true);
  const total = Object.values(r.byChapter).reduce((n, c) => n + c.total, 0);
  const corr = Object.values(r.byChapter).reduce((n, c) => n + c.correct, 0);
  assert.equal(total, 100);
  assert.equal(corr, 100);
});
test('scoreExam: 未回答のみ -> 0点、例外なし、null/undefined answers も可', () => {
  const e = L.buildExam(data, Math.random);
  for (const a of [{}, null, undefined]) {
    const r = L.scoreExam(e, a);
    assert.equal(r.points, 0);
    assert.equal(r.pass, false);
    assert.equal(Object.values(r.byChapter).reduce((n, c) => n + c.correct, 0), 0);
  }
});
test('scoreExam: 合格ライン308点の境界、false/0 の回答は回答済み扱い', () => {
  const e = L.buildExam(data, Math.random);
  // ox 70 正解(140) + mc 17 正解(170) = 310 -> 合格、16 正解 = 300 -> 不合格
  const mk = (nMc) => {
    const a = correctAnswers(e);
    e.mc.forEach((q, i) => { if (i >= nMc) delete a[q.id]; });
    return L.scoreExam(e, a);
  };
  assert.equal(mk(17).points, 310);
  assert.equal(mk(17).pass, true);
  assert.equal(mk(16).pass, false);
  // 誤答
  const wrong = {};
  e.ox.forEach((q) => (wrong[q.id] = !q.answer));
  e.mc.forEach((q) => (wrong[q.id] = (q.answer + 1) % 5));
  assert.equal(L.scoreExam(e, wrong).points, 0);
  // 正解が 0 / false の問題を正しく採点する
  const z = { ox: [{ id: 'c01-ox-01', answer: false }], mc: [{ id: 'c01-mc-01', answer: 0 }] };
  assert.equal(L.scoreExam(z, { 'c01-ox-01': false, 'c01-mc-01': 0 }).points, 12);
});

test('position.page: あり/なし両方読める、不正な page は拒否', () => {
  const st = (p) => ({ getItem: () => JSON.stringify(p) });
  const base = L.emptyProgress();
  const old = { ...base, position: { ch: 1, lessonId: 'c01-l02' } };
  assert.deepEqual(L.loadProgress(st(old)).progress.position, { ch: 1, lessonId: 'c01-l02' });
  const withPage = { ...base, position: { ch: 1, lessonId: 'c01-l02', page: 3 } };
  const r = L.loadProgress(st(withPage));
  assert.equal(r.ok, true);
  assert.equal(r.progress.position.page, 3);
  assert.equal(L.importProgress(JSON.stringify(withPage), base).error, null);
  assert.equal(L.importProgress(JSON.stringify({ ...base, position: { ch: 1, lessonId: 'a', page: 0 } }), base).error, null);
  for (const bad of [-1, 1.5, '2', null, NaN]) {
    const j = JSON.stringify({ ...base, position: { ch: 1, lessonId: 'a', page: bad } });
    assert.ok(L.importProgress(j, base).error, 'bad page ' + bad);
    assert.equal(L.loadProgress(st({ ...base, position: { ch: 1, lessonId: 'a', page: bad } })).ok, false);
  }
});
