#!/usr/bin/env bash
# Сборка архива для загрузки в Консоль разработчика Яндекс Игр.
#
# В архив попадает только то, что нужно игре: index.html в корне (п.1.22),
# стили, исходники и ассеты. Документация, промоматериалы и git — не попадают.
set -euo pipefail

cd "$(dirname "$0")"
OUT="nomeron.zip"

rm -f "$OUT"
zip -r -q "$OUT" \
  index.html \
  styles.css \
  src \
  assets \
  -x '*.DS_Store' '*/.*'

SIZE_KB=$(du -k "$OUT" | cut -f1)
UNPACKED_KB=$(du -sk index.html styles.css src assets | awk '{s+=$1} END {print s}')

echo "Архив: $OUT"
echo "Сжатый размер:      ${SIZE_KB} КБ"
echo "В разархивированном: ${UNPACKED_KB} КБ (лимит 102400 КБ, п.1.21)"

if [ "$UNPACKED_KB" -gt 102400 ]; then
  echo "ОШИБКА: превышен лимит 100 МБ" >&2
  exit 1
fi

echo "Проверка структуры:"
unzip -l "$OUT" | head -20
