#!/usr/bin/env bash
# Monta a pasta do Space do Hugging Face com só o que a API precisa.
# Uso: deploy/build_space.sh [pasta-destino]   (padrão: deploy/out/space)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/deploy/out/space}"
rm -rf "$OUT"
mkdir -p "$OUT/api" "$OUT/data"
cp "$ROOT/deploy/huggingface/Dockerfile" "$ROOT/deploy/huggingface/README.md" "$OUT/"
cp "$ROOT/api/requirements-api.txt" "$OUT/api/"
rsync -a --exclude '__pycache__' --exclude 'ui.py' --exclude 'ui_pages.py' --exclude 'ai_explainer.py' "$ROOT/api/src" "$OUT/api/"
rsync -a --exclude '__pycache__' "$ROOT/api/server" "$OUT/api/"
cp "$ROOT/data/base-oficial.xlsx" "$ROOT/data/cenarios-sinteticos.xlsx" "$ROOT/data/cenarios-sinteticos.json" "$OUT/data/"
echo "Space pronto em $OUT"
