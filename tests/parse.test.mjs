import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderInline, parseChapter, bundleLessons, splitPage, plainLen } from '../tools/parse.mjs';

test('renderInline', () => {
  assert.equal(renderInline('**12時間**'), '<b class="key">12時間</b>');
  assert.ok(!renderInline('<script>').includes('<script>'));
  assert.equal(renderInline('a<!-- x -->b'), 'ab');
  assert.equal(renderInline('【ひっかけ】免許制→×'), '<span class="trap">免許制→×</span>');
});

test('parseChapter 第2章', () => {
  const r = (f) => readFileSync(new URL('../chapters/' + f, import.meta.url), 'utf8');
  const ch = parseChapter(r('02_fiea.md'), r('02b_choice.md'), 2);
  assert.equal(ch.ox.length, 169);
  assert.equal(ch.mc.length, 10);
  assert.equal(ch.ox[0].answer, true);
  assert.equal(ch.ox[4].id, 'c02-ox-05');
  assert.equal(ch.mc[2].id, 'c02-mc-03');
  assert.equal(ch.lessons[0].id, 'c02-l01');
  assert.equal(ch.mc[0].answer, 2);
  assert.equal(ch.mc[0].items.length, 4);
  assert.equal(ch.mc[0].choices.length, 5);
});

test('bundleLessons', () => {
  const s = (t, n) => ({ title: t, md: 'あ'.repeat(n) });
  const ls = bundleLessons([s('a', 1000), s('b', 1000), s('big', 5000), s('c', 1000), s('d', 3500)], 4000);
  assert.deepEqual(ls.map((l) => l.sections), [['a', 'b'], ['big'], ['c'], ['d']]);
  const solo = bundleLessons([s('a', 10)]).concat(bundleLessons([{ ...s('x', 10), solo: true }]));
  assert.equal(solo.length, 2);
});

test('splitPage: 長いページは最上位の箇条書きの境目で（続き）に分ける', () => {
  const item = (i) => `- 項目${i}\n  - ` + 'あ'.repeat(500);
  const md = '#### 見出し\n' + [1, 2, 3, 4, 5, 6].map(item).join('\n');
  const ps = splitPage({ title: '見出し', names: ['見出し'], md });
  assert.ok(ps.length >= 2);
  assert.equal(ps[0].title, '見出し');
  assert.equal(ps[1].title, '見出し（続き）');
  assert.deepEqual(ps.map((p) => p.cont), ps.map((_, i) => i > 0));
  assert.ok(ps.every((p) => plainLen(p.html) <= 1800));
  assert.ok(!ps[0].html.includes('<h4>見出し'));
  assert.equal(splitPage({ title: 'x', names: [], md: '- a\n- b' }).length, 1);
});
