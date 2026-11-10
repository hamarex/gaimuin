// chapters/*.md -> データ構造への変換（外部依存なし）

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderInline(md) {
  let s = md.replace(/<!--[\s\S]*?-->/g, '');
  s = esc(s).trim();
  s = s.replace(/\*\*(.+?)\*\*/g, '<b class="key">$1</b>');
  s = s.replace(/【ひっかけ】(.*)$/, '<span class="trap">$1</span>');
  return s;
}

const pad = (n) => String(n).padStart(2, '0');

// 簡易 markdown（見出し####・入れ子の箇条書き・段落）→ HTML
function renderBody(lines) {
  let out = '';
  let depth = -1;
  const closeAll = () => { while (depth >= 0) { out += '</li></ul>'; depth--; } };
  for (const line of lines) {
    if (!line.trim()) continue;
    const h = line.match(/^#{3,5} +(.*)$/);
    if (h) { closeAll(); out += `<h4>${renderInline(h[1])}</h4>`; continue; }
    const li = line.match(/^( *)- +(.*)$/);
    if (li) {
      const lv = Math.floor(li[1].length / 2);
      while (depth > lv) { out += '</li></ul>'; depth--; }
      if (depth === lv) out += '</li>';
      else while (depth < lv) { out += '<ul>'; depth++; }
      out += `<li>${renderInline(li[2])}`;
      continue;
    }
    closeAll();
    out += `<p>${renderInline(line)}</p>`;
  }
  closeAll();
  return out;
}

// sections: {title, md, solo?}。章をまたがず順に束ねる。solo または maxChars 超の小項目は単独。
export function bundleLessons(sections, maxChars = 4000) {
  const groups = [];
  let cur = null;
  let len = 0;
  for (const sec of sections) {
    const alone = sec.solo || sec.md.length > maxChars;
    if (alone) { groups.push([sec]); cur = null; continue; }
    if (cur && len + sec.md.length <= maxChars) { cur.push(sec); len += sec.md.length; }
    else { cur = [sec]; len = sec.md.length; groups.push(cur); }
  }
  return groups.map((g) => ({
    title: g.length === 1 ? g[0].title : `${g[0].title}〜${g[g.length - 1].title}`,
    sections: g.flatMap((s) => s.names ?? [s.title]),
    html: g.map((s) => renderBody(s.md.split('\n'))).join(''),
    pages: g.flatMap((s) => (s.pages ?? [{ title: s.title, names: [s.title], md: s.md }]).flatMap((pg) => splitPage(pg))),
  }));
}

export const plainLen = (html) => html.replace(/<[^>]+>/g, '').length;

// 1ページ分の md を html にし、長ければ最上位の箇条書きの境目で「（続き）」ページに分ける
export function splitPage(pg, maxPlain = 1800) {
  const lines = pg.md.split('\n').filter((l) => l.trim());
  if (lines.length && /^#{3,5} /.test(lines[0])) lines.shift(); // 見出しはページタイトルで表示する
  // 最上位の項目（段落、見出し、「- 」とその子）を単位にする
  const units = [];
  for (const l of lines) {
    if (/^ /.test(l) && units.length) units.at(-1).push(l);
    else units.push([l]);
  }
  const html = (us) => renderBody(us.flat());
  const total = plainLen(html(units));
  const n = Math.max(1, Math.ceil(total / maxPlain));
  const target = total / n;
  const chunks = [];
  let cur = [], acc = 0;
  for (const u of units) {
    const w = plainLen(html([u]));
    if (cur.length && acc >= target && chunks.length < n - 1) { chunks.push(cur); cur = []; acc = 0; }
    cur.push(u); acc += w;
  }
  chunks.push(cur);
  return chunks.map((c, i) => ({ title: i ? `${pg.title}（続き）` : pg.title, names: i ? [] : pg.names, cont: i > 0, html: html(c) }));
}

function parseOx(lines, no, ox) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- Q(\d+)[.．]\s*(.*)$/);
    if (!m) continue;
    let answer = null, explain = '';
    for (let j = i + 1; j < lines.length && /^\s+- /.test(lines[j]); j++) {
      const a = lines[j].match(/^\s+- 答え[：:]\s*\**\s*([○×])/);
      if (a) answer = a[1] === '○';
      const e = lines[j].match(/^\s+- 解説[：:]\s*(.*)$/);
      if (e) explain = e[1];
    }
    if (answer === null) throw new Error(`第${no}章 Q${m[1]}: 答えが読めません`);
    const sec = m[2].match(/<!--\s*sec:\s*(.*?)\s*-->/);
    ox.push({ id: `c${pad(no)}-ox-${pad(+m[1])}`, text: renderInline(m[2]), answer, explain: renderInline(explain), sec: sec ? sec[1] : null });
  }
}

function parseMc(text, no) {
  const mc = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- 問(\d+)[.．]\s*(.*)$/);
    if (!m) continue;
    const q = { id: `c${pad(no)}-mc-${pad(+m[1])}`, stem: m[2], items: [], choices: [], answer: 0, explain: [], tip: null };
    const extra = [];
    let inExp = false;
    let j = i + 1;
    for (; j < lines.length && /^\s+- /.test(lines[j]); j++) {
      const l = lines[j];
      const body = l.replace(/^\s+- /, '');
      if (/^答えと解説/.test(body)) { inExp = true; continue; }
      if (inExp) {
        const a = body.match(/^答え[：:]\s*\**\s*(\d)/);
        if (a) q.answer = +a[1];
        else if (/^絞り込みのコツ[：:]/.test(body)) q.tip = renderInline(body.replace(/^絞り込みのコツ[：:]\s*/, ''));
        else q.explain.push(renderInline(body));
        continue;
      }
      let k;
      if ((k = body.match(/^([イロハニ])[.．]\s*(.*)$/))) q.items.push({ label: k[1], text: renderInline(k[2]) });
      else if (/^選択肢[：:]/.test(body)) {
        body.replace(/^選択肢[：:]\s*/, '').split(/[\s　]+(?=\d[.．])/).forEach((c) => q.choices.push(renderInline(c.replace(/^\d[.．]\s*/, ''))));
      } else if ((k = body.match(/^([1-5])[.．]\s*(.*)$/))) q.choices.push(renderInline(k[2]));
      else extra.push(body);
    }
    q.stem = [m[2], ...extra].map(renderInline).join('<br>');
    if (!q.answer || q.choices.length !== 5) throw new Error(`第${no}章 問${m[1]}: 答え/選択肢が読めません`);
    mc.push(q);
    i = j - 1;
  }
  return mc;
}

export function parseChapter(mdText, choiceText, no) {
  const lines = mdText.split('\n');
  const title = (lines.find((l) => /^## /.test(l)) ?? '').replace(/^## (第\d+章\s*)?/, '');
  const headingCount = lines.filter((l) => /^#### /.test(l)).length;

  // ### ブロックに分割
  const blocks = [];
  for (const l of lines) {
    const h = l.match(/^### (\d+)\.\s*(.*)$/);
    if (h) blocks.push({ n: +h[1], title: h[2], lines: [] });
    else if (blocks.length) blocks.at(-1).lines.push(l);
  }

  const sections = [];
  const solos = [];
  for (const b of blocks) {
    if (b.n === 1) {
      let cur = null;
      for (const l of b.lines) {
        const h = l.match(/^#### (.*)$/);
        if (h) { cur = { title: h[1].trim(), lines: [l] }; sections.push(cur); }
        else if (cur) cur.lines.push(l);
      }
    } else if (b.n === 2 || b.n === 3) {
      const names = b.lines.filter((l) => /^#### /.test(l)).map((l) => l.replace(/^#### /, '').trim());
      // ####ごとに1ページ。####が無ければブロック全体で1ページ。最初の####より前の文章は最初のページに含める
      const pages = [];
      let intro = [];
      for (const l of b.lines) {
        const h = l.match(/^#### (.*)$/);
        if (h) pages.push({ title: h[1].trim(), names: [h[1].trim()], lines: [l] });
        else if (pages.length) pages.at(-1).lines.push(l);
        else intro.push(l);
      }
      if (!pages.length) pages.push({ title: b.title, names: [], lines: b.lines });
      else if (intro.some((l) => l.trim())) pages[0].lines = [...pages[0].lines.slice(0, 1), ...intro, ...pages[0].lines.slice(1)];
      pages[0].names = [b.title, ...pages[0].names];
      solos.push({ title: b.title, md: b.lines.join('\n'), solo: true, names: [b.title, ...names], pages: pages.map((p) => ({ title: p.title, names: p.names, md: p.lines.join('\n') })) });
    }
  }
  const secs = sections.map((s) => ({ title: s.title, md: s.lines.join('\n') }));
  const lessons = [...bundleLessons(secs), ...bundleLessons(solos)].map((l, i) => ({ id: `c${pad(no)}-l${pad(i + 1)}`, ...l }));
  let basePages = 0;
  for (const l of lessons) {
    l.pages = l.pages.map((p, i) => ({ id: `${l.id}-p${pad(i + 1)}`, ...p, oxIds: [] }));
    basePages += l.pages.filter((p) => !p.cont).length;
  }

  const ox = [];
  parseOx(lines, no, ox);
  const mc = parseMc(choiceText, no);
  return { no, title, headingCount, basePages, lessons, ox, mc };
}
