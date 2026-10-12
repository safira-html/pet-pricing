"""Evidências de comportamento seguro da IA (Semana 4): coleta desatualizada, fidelidade numérica e revisão humana."""
from __future__ import annotations

import json
from pathlib import Path

from server.explain import faithful, fallback
from server.payload import build_payload

OUT = Path.home() / "Documents/popular-pet/[04] outputs/semana-4/data"
OUT.mkdir(parents=True, exist_ok=True)
evidence = {}
for name, formula_note in (("oficial", "contribuição"),):
    p = build_payload(Path("../data/base-oficial.xlsx").read_bytes(), "base-oficial.xlsx", name)
    recs = p["recomendacoes"]
    stale = [r for r in recs if r["concorrencia"]["desatualizado"]]
    facts = ["Preço atual R$ 10,00", "Mediana de mercado R$ 9,50"]
    evidence = {
        "stale_total": len(stale),
        "stale_review": sum(1 for r in stale if r["acao"] == "REVISAR"),
        "fewer_than_3_competitors": sum(1 for r in recs if r["concorrencia"]["validos"] < 3),
        "review_total_contribution": sum(1 for r in recs if r["acao"] == "REVISAR"),
        "invented_number_rejected": faithful("Suba para R$ 12,34", facts) is False,
        "faithful_answer_accepted": faithful("O preço atual é R$ 10,00 e o mercado, R$ 9,50", facts) is True,
        "fallback_text": fallback(facts),
    }
(OUT / "ai-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=1))
print(evidence)
assert evidence["invented_number_rejected"] and evidence["faithful_answer_accepted"]
