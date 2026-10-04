"""Base no formato do front, gerada pelo motor do Allan (src/).

Antes vivia em scripts/export_fixtures.py; agora a API e o script usam a mesma função,
para os dados de demonstração e os enviados pelo gestor passarem pela mesma conta.
Campos marcados como ``proposta`` são cálculos da V2 (rampa, elegibilidade ao piloto
automático, margem simples) ainda não incorporados ao motor.
"""
from __future__ import annotations

import io
import json
import math
import os
import tempfile
from decimal import Decimal

import pandas as pd

from src.database import Database
from src.recommendation_service import RecommendationService

AUTOPILOT_CAP = 0.03
INFORMATIVE = ("R10: histórico de 24h insuficiente",)


def num(v):
    if v is None:
        return None
    if isinstance(v, (Decimal, float, int)) and not isinstance(v, bool):
        f = float(v)
        return None if math.isnan(f) else round(f, 6)
    if isinstance(v, str):
        try:
            return round(float(v), 6)
        except ValueError:
            return v
    return v


def rule_code(text: str) -> str | None:
    head = text.split(":")[0].strip()
    return head if head.startswith("R") and head[1:].isdigit() else None


def classify(alerts, blocks):
    out = []
    for a in alerts:
        if a in blocks:
            kind = "bloqueio"
        elif a.startswith(INFORMATIVE):
            kind = "informativo"
        else:
            kind = "aprovacao"
        out.append({"codigo": rule_code(a), "texto": a, "tipo": kind})
    return out


def ramp(current, floor):
    if current is None or floor is None or floor <= current * 1.05:
        return None
    needed = floor / current - 1
    steps = math.ceil(math.log(floor / current) / math.log(1.05))
    first = math.floor(current * 1.05 * 100) / 100
    return {"proposta": True, "aumento_necessario": round(needed, 6), "etapas": steps,
            "preco_etapa_1": first, "intervalo_dias": 3,
            "texto": f"Subir em {steps} etapas de até 5%, a cada 3 dias, até o piso de R$ {floor:.2f}."}


def sheet(raw: bytes, name):
    return pd.read_excel(io.BytesIO(raw), sheet_name=name, header=2)


def build_payload(raw: bytes, filename: str, scenario: str, synthetic_skus: set[str] | None = None) -> dict:
    """Roda o motor do Allan sobre a planilha e devolve a base no formato que o front usa."""
    synthetic_skus = synthetic_skus or set()
    with tempfile.TemporaryDirectory() as tmp:
        service = RecommendationService(Database(os.path.join(tmp, "engine.db")))
        bundle = service.import_excel(raw, filename=filename, user="api")
        service.generate("api")
        recs = service.latest()
    workbook = raw

    sales = sheet(workbook, "Vendas_12m")
    history = sheet(workbook, "Historico_Precos")
    promos = sheet(workbook, "Promocoes")
    indicators = sheet(workbook, "Indicadores_Atuais")
    rules = sheet(workbook, "Regras_Negocio")

    out_recs = []
    for r in recs:
        signals = r.get("sinais_utilizados") or {}
        comp = signals.get("concorrencia") or {}
        current, floor = num(r["preco_atual"]), num(r["preco_minimo"])
        repl = num(r["custo_reposicao"])
        s = sales[(sales["SKU"] == r["sku"]) & (sales["Canal"] == r["canal"])].sort_values("Mês")
        variation = num(r["variacao_percentual"])
        blocks = r.get("bloqueios") or []
        alerts = classify(r.get("alertas") or [], blocks)
        needs = any(a["tipo"] == "aprovacao" for a in alerts)
        eligible_reasons = []
        if r["acao"] not in ("SUBIR", "BAIXAR"):
            eligible_reasons.append("Ação não é SUBIR nem BAIXAR")
        if blocks:
            eligible_reasons.append("Há bloqueio")
        if needs:
            eligible_reasons.append("Uma regra exige aprovação humana")
        if variation is not None and abs(variation) > AUTOPILOT_CAP:
            eligible_reasons.append(f"Variação acima do teto do piloto automático ({AUTOPILOT_CAP:.0%})")
        out_recs.append({
            "id": f"{r['sku']}|{r['canal']}",
            "sku": r["sku"], "produto": r["produto"], "categoria": r["categoria"], "marca": r["marca"],
            "curva": r["curva_abc"], "status_cadastro": r.get("status"), "canal": r["canal"],
            "sintetico": r["sku"] in synthetic_skus,
            "acao": r["acao"], "risco": r["nivel_risco"], "prioridade": r["prioridade"],
            "preco_atual": current, "preco_sugerido": num(r["preco_sugerido"]), "preco_mercado": num(r["preco_mercado"]),
            "preco_minimo": floor, "preco_alvo": num(r["preco_alvo"]),
            "limite_inferior": round(current * 0.95, 2), "limite_superior": round(current * 1.05, 2),
            "variacao": variation, "diferenca_mercado": num(r["diferenca_mercado"]),
            "custo": {"reposicao": repl, "impostos": num(r["impostos_estimados"]), "frete": num(r["frete_rateado"]),
                      "total": num(r["custo_total"]), "taxa_canal": num(r["taxa_canal"])},
            "margem": {"atual": num(r["margem_atual"]), "projetada": num(r["margem_projetada"]),
                       "minima": num(r["margem_minima_aplicada"]), "alvo": num(r["margem_alvo_aplicada"]),
                       "simples_reposicao": round(1 - repl / current, 6) if current else None},
            "estoque": {"atual": num(r["estoque_atual"]), "cobertura_dias": num(r["cobertura_dias"]),
                        "pedido_aberto": num(r["pedido_compra_aberto"]), "previsao": r.get("previsao_recebimento"),
                        "local": r.get("local")},
            "concorrentes": [{"nome": o.get("concorrente"), "preco": num(o.get("preco")), "frete": num(o.get("frete")),
                              "disponivel": o.get("disponivel"), "coleta": str(o.get("data_hora_coleta") or o.get("coleta") or ""),
                              "matching": o.get("confiabilidade_matching"), "correspondencia": o.get("correspondencia"),
                              "valida": o.get("valida", o.get("considerada"))}
                             for o in comp.get("observacoes", [])],
            "concorrencia": {"validos": comp.get("quantidade", comp.get("encontrados")), "desatualizado": comp.get("desatualizado"),
                             "anomalia": comp.get("anomalia")},
            "vendas": [{"mes": m, "quantidade": num(q), "preco_medio": num(p)} for m, q, p in
                       zip(s["Mês"].astype(str), s["Quantidade"], s["Preço médio"])],
            "historico_precos": [{"data": str(d), "preco": num(p), "motivo": mo} for d, p, mo in
                                 history[history["SKU"] == r["sku"]][["Data", "Preço", "Motivo"]].itertuples(index=False)],
            "promocoes": [{"campanha": c, "inicio": str(i), "fim": str(f), "desconto": num(d)} for c, i, f, d in
                          promos[promos["SKU"] == r["sku"]][["Campanha", "Início", "Fim", "Desconto"]].itertuples(index=False)],
            "alertas": alerts, "bloqueios": blocks,
            "exige_aprovacao_motor": bool(r["exige_aprovacao"]),
            "justificativa_motor": r["justificativa"],
            "regra_aplicada": r["regra_aplicada"],
            "proposta": {
                "rampa": ramp(current, floor) if any("Piso de margem" in b for b in blocks) else None,
                "elegivel_piloto_automatico": not eligible_reasons,
                "motivos_inelegivel": eligible_reasons,
            },
            "data_referencia": str(r.get("reference")),
        })

    payload = {
        "cenario": scenario,
        "fonte": filename,
        "data_referencia": out_recs[0]["data_referencia"] if out_recs else None,
        "teto_piloto_automatico": AUTOPILOT_CAP,
        "indicadores": [{"indicador": a, "atual": str(b), "meta": str(c), "frequencia": d, "responsavel": e}
                        for a, b, c, d, e in indicators.itertuples(index=False)],
        "regras": [{"id": a, "tema": b, "regra": c, "acao": d, "criticidade": e} for a, b, c, d, e in rules.itertuples(index=False)],
        "skus_sinteticos": sorted(synthetic_skus),
        "recomendacoes": out_recs,
    }
    payload["fonte"] = filename
    payload["avisos_importacao"] = bundle.issues
    return json.loads(json.dumps(payload, ensure_ascii=False, default=str))


