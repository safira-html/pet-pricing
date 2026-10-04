"""Exporta, a partir do motor real, os dados que o front usa sem API.

Uso: python scripts/export_fixtures.py
Gera web/src/data/oficial.json e web/src/data/sintetico.json com server.payload.build_payload.
"""
from __future__ import annotations

import json
from pathlib import Path

from server.payload import build_payload

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "data"


def export(workbook: Path, scenario: str, synthetic_skus: set[str]) -> int:
    payload = build_payload(workbook.read_bytes(), workbook.name, scenario, synthetic_skus)
    payload.pop("avisos_importacao", None)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{scenario}.json").write_text(json.dumps(payload, ensure_ascii=False, default=str))
    return len(payload["recomendacoes"])


if __name__ == "__main__":
    manifest = json.loads((ROOT / "data" / "cenarios-sinteticos.json").read_text())
    synthetic = {item["sku"] for item in manifest["skus"]}
    print("oficial", export(ROOT / "data" / "base-oficial.xlsx", "oficial", set()))
    print("sintetico", export(ROOT / "data" / "cenarios-sinteticos.xlsx", "sintetico", synthetic))
