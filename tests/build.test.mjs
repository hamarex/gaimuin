import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildData } from '../tools/build.mjs';
import { plainLen } from '../tools/parse.mjs';

const { data, errors } = buildData();
const sum = (f) => data.chapters.reduce((a, c) => a + f(c), 0);

test('件数', () => {
  assert.deepEqual(errors, []);
  assert.equal(data.chapters.length, 10);
  assert.ok(sum((c) => c.ox.length) >= 286); // 元286問 + 新規追加分
  assert.equal(sum((c) => c.mc.length), 87);
  assert.equal(sum((c) => c.headingCount), 714);
});

test('小項目は必ずどれかのレッスンに入る / ID重複なし', () => {
  const ids = data.chapters.flatMap((c) => [...c.lessons, ...c.ox, ...c.mc].map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(sum((c) => c.lessons.reduce((a, l) => a + l.sections.length, 0)) > 0);
});

test('全Qがレッスンに割り当て済み / 全レッスンに○×が1問以上', () => {
  for (const c of data.chapters) {
    assert.deepEqual(c.ox.filter((q) => !q.lesson).map((q) => q.id), []);
    for (const l of c.lessons) {
      assert.ok(c.ox.some((q) => q.lesson === l.id), `${l.id} に問題なし`);
    }
  }
});

test('ページ: ID形式・小項目数との整合・全Oxが1ページに属する', () => {
  const dir = new URL('../chapters/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /^\d\d_.*\.md$/.test(f) && !f.startsWith('00_'));
  for (const c of data.chapters) {
    // md から独立に「#### の数（### 1〜3 内）＋ #### の無い ### 2,3」を数える
    const f = files.find((x) => x.startsWith(String(c.no).padStart(2, '0')));
    let n = -1, expect = 0; const heads = {};
    for (const l of readFileSync(new URL(f, dir), 'utf8').split('\n')) {
      const b = l.match(/^### (\d+)\./);
      if (b) { n = +b[1]; heads[n] = 0; } else if (/^#### /.test(l) && n >= 1 && n <= 3) { expect++; heads[n]++; }
    }
    expect += [2, 3].filter((k) => k in heads && heads[k] === 0).length;
    const pages = c.lessons.flatMap((l) => l.pages);
    assert.equal(pages.filter((p) => !p.cont).length, expect, `第${c.no}章 ページ数`);
    for (const l of c.lessons) {
      l.pages.forEach((p, i) => assert.equal(p.id, `${l.id}-p${String(i + 1).padStart(2, '0')}`));
    }
    const owned = pages.flatMap((p) => p.oxIds);
    assert.deepEqual([...owned].sort(), c.ox.map((q) => q.id).sort(), `第${c.no}章 Oxはちょうど1ページに属する`);
    for (const q of c.ox) {
      const l = c.lessons.find((x) => x.id === q.lesson);
      assert.ok(l.pages.some((p) => p.oxIds.includes(q.id)), `${q.id} は自レッスン内のページ`);
    }
  }
});

test('ページの文字量は上限付近に収まる', () => {
  const lens = data.chapters.flatMap((c) => c.lessons.flatMap((l) => l.pages.map((p) => plainLen(p.html))));
  assert.ok(Math.max(...lens) <= 2000);
});
