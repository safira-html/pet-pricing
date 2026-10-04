"""Gera a base de cenários sintéticos a partir da base oficial.

Só o custo de alguns SKUs é alterado, para que o próprio motor chegue a SUBIR,
BAIXAR ou MANTER. Os SKUs alterados ficam listados em ``SYNTHETIC_SKUS`` e são
marcados como sintéticos na interface. A base oficial nunca é modificada.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "base-oficial.xlsx"
TARGET = ROOT / "data" / "cenarios-sinteticos.xlsx"
MANIFEST = ROOT / "data" / "cenarios-sinteticos.json"
NEUTRALITY = 0.005
MARKET_WEIGHT = 0.5


def header_map(ws, header_row=3):
    return {ws.cell(header_row, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(header_row, c).value}


def rows(ws, header_row=3):
    for r in range(header_row + 1, ws.max_row + 1):
        if ws.cell(r, 1).value:
            yield r


def market_medians(wb):
    ws = wb["Concorrencia"]
    h = header_map(ws)
    prices: dict[str, list[float]] = {}
    for r in rows(ws):
        if str(ws.cell(r, h["Disponível"]).value).strip().lower() != "sim":
            continue
        prices.setdefault(ws.cell(r, h["SKU"]).value, []).append(float(ws.cell(r, h["Preço"]).value))
    out = {}
    for sku, values in prices.items():
        values.sort()
        n = len(values)
        out[sku] = values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2
    return out


def cost_for(goal: str, current: float, market: float, minimum: float, target: float) -> float | None:
    """Custo total que faz o motor chegar ao objetivo na loja física (taxa 0%)."""
    k = 1 - target
    if goal == "MANTER":
        cost = (current - MARKET_WEIGHT * market) / (1 - MARKET_WEIGHT) * k
    elif goal == "BAIXAR":
        cost = (current * 0.965 - MARKET_WEIGHT * market) / (1 - MARKET_WEIGHT) * k
    else:  # SUBIR
        cost = (current * 1.03 - MARKET_WEIGHT * market) / (1 - MARKET_WEIGHT) * k
    floor = cost / (1 - minimum)
    limit = current * 0.95 if goal == "BAIXAR" else current
    if cost <= 0 or floor > limit:
        return None
    return round(cost, 2)


def main():
    goals = json.loads(sys.argv[1]) if len(sys.argv) > 1 else None
    shutil.copyfile(SOURCE, TARGET)
    wb = openpyxl.load_workbook(TARGET)
    med = market_medians(wb)
    prod = wb["Produtos"]
    hp = header_map(prod)
    product_rows = {prod.cell(r, hp["SKU"]).value: r for r in rows(prod)}
    prices = wb["Precos_Atuais"]
    hpr = header_map(prices)
    store_price = {prices.cell(r, hpr["SKU"]).value: float(prices.cell(r, hpr["Preço atual"]).value)
                   for r in rows(prices) if prices.cell(r, hpr["Canal"]).value == "Loja física"}
    costs = wb["Custos_Margens"]
    hc = header_map(costs)
    changed = []
    for sku, goal in goals.items():
        r = next(r for r in rows(costs) if costs.cell(r, hc["SKU"]).value == sku and costs.cell(r, hc["Canal"]).value == "Loja física")
        minimum = float(costs.cell(r, hc["Margem mínima"]).value)
        target = float(costs.cell(r, hc["Margem alvo"]).value)
        old_total = float(costs.cell(r, hc["Custo total referência"]).value)
        new_total = cost_for(goal, store_price[sku], med[sku], minimum, target)
        if new_total is None:
            print(f"{sku}: objetivo {goal} inviável", file=sys.stderr)
            continue
        factor = new_total / old_total
        for cr in rows(costs):
            if costs.cell(cr, hc["SKU"]).value != sku:
                continue
            parts = [round(float(costs.cell(cr, hc[k]).value) * factor, 2) for k in ("Custo reposição", "Impostos estimados", "Frete rateado")]
            for key, value in zip(("Custo reposição", "Impostos estimados", "Frete rateado"), parts):
                costs.cell(cr, hc[key]).value = value
            costs.cell(cr, hc["Custo total referência"]).value = round(sum(parts), 2)
        prod.cell(product_rows[sku], hp["Custo reposição"]).value = round(float(prod.cell(product_rows[sku], hp["Custo reposição"]).value) * factor, 2)
        changed.append({"sku": sku, "objetivo_loja_fisica": goal, "fator_custo": round(factor, 4),
                        "custo_total_original": old_total, "custo_total_sintetico": round(new_total, 2)})
    wb.save(TARGET)
    MANIFEST.write_text(json.dumps({
        "descricao": "Cenários sintéticos: custos alterados apenas nestes SKUs para demonstrar as quatro ações. Não são dados da Popular Pet.",
        "origem": SOURCE.name, "skus": changed}, ensure_ascii=False, indent=2))
    print(json.dumps(changed, ensure_ascii=False))


if __name__ == "__main__":
    main()
