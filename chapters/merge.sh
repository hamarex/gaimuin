#!/bin/sh
# chapters/ 配下の章ファイルを番号順に結合して gaimuin-ichishu.md を生成する
cd "$(dirname "$0")/.." || exit 1
out=gaimuin-ichishu.md
: > "$out"
for f in chapters/[0-9][0-9]*.md; do
  cat "$f" >> "$out"
  printf '\n' >> "$out"
done
wc -l "$out"
