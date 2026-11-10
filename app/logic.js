(function (root) {
  'use strict';

  var KEY = 'gaimuin.progress.v1';
  var OX_N = 70, MC_N = 30, OX_PT = 2, MC_PT = 10, PASS_PT = 308;

  function gradeOx(q, ans) { return { correct: ans === q.answer }; }
  function gradeMc(q, ans) { return { correct: ans === q.answer }; }

  function emptyProgress() {
    return {
      version: 1,
      position: null,
      lessonsDone: [],
      quizResults: {},
      wrongLog: [],
      chapterTest: {},
      reports: [],
      settings: { passRate: 0.7, unlockAll: false }
    };
  }

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function isStrArr(x) { return Array.isArray(x) && x.every(function (s) { return typeof s === 'string'; }); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  // 不正なら理由の文字列、正しければ null
  function validate(p) {
    if (!isObj(p)) return '進捗ファイルの形式が正しくありません';
    if (p.version !== 1) return '対応していないバージョンです';
    if (p.position !== null && !(isObj(p.position) && isNum(p.position.ch) && typeof p.position.lessonId === 'string' &&
      (p.position.page === undefined || (typeof p.position.page === 'number' && isFinite(p.position.page) && p.position.page >= 0 && Math.floor(p.position.page) === p.position.page)))) return 'position が不正です';
    if (!isStrArr(p.lessonsDone)) return 'lessonsDone が不正です';
    if (!isObj(p.quizResults) || !Object.keys(p.quizResults).every(function (k) {
      var r = p.quizResults[k]; return isObj(r) && typeof r.correct === 'boolean' && isNum(r.ts);
    })) return 'quizResults が不正です';
    if (!isStrArr(p.wrongLog)) return 'wrongLog が不正です';
    if (!isObj(p.chapterTest) || !Object.keys(p.chapterTest).every(function (k) {
      var r = p.chapterTest[k]; return isObj(r) && isNum(r.score) && typeof r.passed === 'boolean';
    })) return 'chapterTest が不正です';
    if (!Array.isArray(p.reports) || !p.reports.every(function (r) {
      return isObj(r) && typeof r.id === 'string' && typeof r.memo === 'string';
    })) return 'reports が不正です';
    if (!isObj(p.settings) || !isNum(p.settings.passRate) || typeof p.settings.unlockAll !== 'boolean') return 'settings が不正です';
    return null;
  }

  function loadProgress(storage) {
    var raw;
    try { raw = storage.getItem(KEY); } catch (e) { return { progress: emptyProgress(), ok: false }; }
    if (raw === null || raw === undefined) return { progress: emptyProgress(), ok: true };
    try {
      var p = JSON.parse(raw);
      if (validate(p) === null) return { progress: p, ok: true };
    } catch (e) { /* 壊れたJSON */ }
    return { progress: emptyProgress(), ok: false };
  }

  function saveProgress(storage, p) {
    try { storage.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }

  function importProgress(json, current) {
    var p;
    try { p = JSON.parse(json); } catch (e) { return { progress: current, error: 'JSONとして読めませんでした' }; }
    var err = validate(p);
    if (err) return { progress: current, error: err };
    return { progress: p, error: null };
  }

  function isChapterUnlocked(p, no) {
    if (no <= 1 || p.settings.unlockAll) return true;
    var t = p.chapterTest[no - 1];
    return !!(t && t.passed);
  }

  function examUnlocked(p, data) {
    if (p.settings.unlockAll) return true;
    return data.chapters.every(function (c) { var t = p.chapterTest[c.no]; return !!(t && t.passed); });
  }

  // 章ごとの問題数に比例した配分（最大剰余法、各章の問題数が上限）
  function allocate(sizes, n) {
    var total = sizes.reduce(function (a, b) { return a + b; }, 0);
    n = Math.min(n, total);
    var alloc = sizes.map(function (s) { return total ? Math.min(s, Math.floor(s * n / total)) : 0; });
    var left = n - alloc.reduce(function (a, b) { return a + b; }, 0);
    var order = sizes.map(function (s, i) { return i; }).sort(function (a, b) {
      return (sizes[b] * n / total - alloc[b]) - (sizes[a] * n / total - alloc[a]);
    });
    while (left > 0) {
      var moved = false;
      for (var k = 0; k < order.length && left > 0; k++) {
        var i = order[k];
        if (alloc[i] < sizes[i]) { alloc[i]++; left--; moved = true; }
      }
      if (!moved) break;
    }
    return alloc;
  }

  function sample(arr, k, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, k);
  }

  function pick(chapters, field, n, rng) {
    var alloc = allocate(chapters.map(function (c) { return c[field].length; }), n);
    var out = [];
    chapters.forEach(function (c, i) { out = out.concat(sample(c[field], alloc[i], rng)); });
    return sample(out, out.length, rng);
  }

  function buildExam(data, rng) {
    rng = rng || Math.random;
    return { ox: pick(data.chapters, 'ox', OX_N, rng), mc: pick(data.chapters, 'mc', MC_N, rng) };
  }

  function chapterOf(id) {
    var m = /^c(\d+)-/.exec(id);
    return m ? parseInt(m[1], 10) : 0;
  }

  // answers: { [問題ID]: boolean(○×) | number(五肢の選択) }。キーが無い問題は未回答で0点。
  function scoreExam(exam, answers) {
    answers = answers || {};
    var points = 0, byChapter = {};
    function one(q, pt, grade) {
      var ch = chapterOf(q.id);
      var b = byChapter[ch] || (byChapter[ch] = { correct: 0, total: 0 });
      b.total++;
      if (Object.prototype.hasOwnProperty.call(answers, q.id) && answers[q.id] !== null && answers[q.id] !== undefined &&
          grade(q, answers[q.id]).correct) {
        b.correct++; points += pt;
      }
    }
    exam.ox.forEach(function (q) { one(q, OX_PT, gradeOx); });
    exam.mc.forEach(function (q) { one(q, MC_PT, gradeMc); });
    return { points: points, max: 440, pass: points >= PASS_PT, byChapter: byChapter };
  }

  var api = {
    STORAGE_KEY: KEY,
    gradeOx: gradeOx, gradeMc: gradeMc,
    emptyProgress: emptyProgress, loadProgress: loadProgress, saveProgress: saveProgress, importProgress: importProgress,
    isChapterUnlocked: isChapterUnlocked, examUnlocked: examUnlocked,
    buildExam: buildExam, scoreExam: scoreExam
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
