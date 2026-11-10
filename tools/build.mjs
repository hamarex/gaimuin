// chapters/[0-9][0-9]*.md -> app/data.js
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseChapter, plainLen } from './parse.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildData(dir = path.join(root, 'chapters')) {
  const files = readdirSync(dir).filter((f) => /^\d\d.*\.md$/.test(f) && !f.startsWith('00_')).sort();
  const nos = [...new Set(files.map((f) => +f.slice(0, 2)))].sort((a, b) => a - b);
  const chapters = [];
  const errors = [];
  let warnings = 0;
  for (const no of nos) {
    const nn = String(no).padStart(2, '0');
    const main = files.find((f) => f.startsWith(nn) && !/^\d\db_/.test(f));
    const choice = files.find((f) => f.startsWith(nn + 'b_'));
    const ch = parseChapter(readFileSync(path.join(dir, main), 'utf8'), choice ? readFileSync(path.join(dir, choice), 'utf8') : '', no);
    // sec の検証（lesson を引けるよう lesson id も付ける）
    for (const q of ch.ox) {
      if (q.sec === null) { warnings++; q.lesson = null; continue; }
      const les = ch.lessons.find((l) => l.sections.includes(q.sec));
      if (!les) errors.push(`第${no}章 ${q.id}: sec「${q.sec}」に該当する見出しがありません`);
      q.lesson = les ? les.id : null;
      if (les) {
        // 同名見出しが複数あれば最初のページ。一致しなければレッスン最後のページ
        const pg = les.pages.find((p) => p.names.includes(q.sec)) ?? les.pages.at(-1);
        pg.oxIds.push(q.id);
      }
    }
    for (const l of ch.lessons) for (const p of l.pages) delete p.names;
    chapters.push(ch);
  }
  return { data: { chapters }, errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { data, errors, warnings } = buildData();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  mkdirSync(path.join(root, 'app'), { recursive: true });
  writeFileSync(path.join(root, 'app/data.js'), 'window.DATA = ' + JSON.stringify(data) + ';\n');
  const sum = (f) => data.chapters.reduce((a, c) => a + f(c), 0);
  console.log(`ox=${sum((c) => c.ox.length)} mc=${sum((c) => c.mc.length)}`);
  const lens = data.chapters.flatMap((c) => c.lessons.flatMap((l) => l.pages.map((p) => plainLen(p.html))));
  console.log(`ページ合計=${lens.length} 最大文字数=${Math.max(...lens)} 平均=${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)} 2000字超=${lens.filter((n) => n > 2000).length}ページ`);
  console.log(`小項目(####)合計=${sum((c) => c.headingCount)} lessons=${sum((c) => c.lessons.length)} 警告(secなしQ)=${warnings}`);
}
