"""Pure deterministic pricing; money rounded only at the final feasible interval."""
from __future__ import annotations

from .utils import D, clean, missing, money


def margin(price, cost, fee):
    price, cost, fee = D(price), D(cost), D(fee)
    if price <= 0 or cost < 0 or not 0 <= fee < 1:
        raise ValueError("Preço, custo ou taxa inválidos.")
    return (price * (1-fee)-cost)/price


def minimum_price(cost, fee, minimum):
    denominator = 1-D(fee)-D(minimum)
    if denominator <= 0 or D(cost) < 0:
        raise ValueError("Denominador do cálculo de preço deve ser maior que zero.")
    return D(cost)/denominator


def recommend(row, rule, competition, sales, other, settings):
    alerts = list(rule["alerts"])
    blocks = list(rule["hard_blocks"])
    current, cost, fee = D(row["preco_atual"]), D(row["custo_total_referencia"]), D(row["taxa_canal"])
    current_margin = margin(current, cost, fee)
    floor = money(minimum_price(cost, fee, rule["minimum"]), "up")
    target = minimum_price(cost, fee, rule["target"])
    market = competition["mediana"]
    candidate = target if market is None else target * (1-D(settings.market_weight)) + D(market)*D(settings.market_weight)
    lower = max(floor, money(current * (1-rule["max_down"]), "up"))
    upper = money(current * (1+rule["max_up"]), "down")
    suggested, projected, variation = None, None, None
    if lower > upper:
        blocks.append("Piso de margem incompatível com o limite de variação. Corrija custo/regra ou faça nova análise.")
    else:
        suggested = max(lower, min(upper, money(candidate)))
        variation = suggested/current-1
        # MANTER means truly keep the price, provided it respects the floor.
        if abs(variation) <= D(settings.neutrality) and current >= floor:
            suggested, variation = current, D(0)
        projected = margin(suggested, cost, fee)
    approval = rule["approval"] or rule["exception"]
    review = bool(rule["conflicts"]) or any("informação insuficiente" in x for x in alerts)
    quantities = sales.get("quantidades_recentes")
    if quantities is not None and (not quantities or any(missing(q) or D(q) < 0 for q in quantities)):
        alerts.append("Histórico recente de vendas ausente ou inconsistente; verificar antes de decidir.")
        review = approval = True
    if competition["desatualizado"]:
        alerts.append("R06: concorrência desatualizada; observações antigas ignoradas.")
        review = approval = True
    if market is None:
        alerts.append("Sem concorrente válido; preço calculado apenas pela margem alvo.")
        review = approval = True
    if not competition["historico_24h_disponivel"]:
        alerts.append("R10: histórico de 24h insuficiente para verificar anomalia temporal.")
    if competition["anomalia"]:
        alerts.append("R10: anomalia concorrencial superior ao limite em 24h.")
        review = approval = True
    if other["promocoes"] or other["promocao_incompleta"]:
        alerts.append("R09: promoção ativa ou incompleta; requer revisão e aprovação humana.")
        review = approval = True
    if other["alteracao_recente"]:
        blocks.append("R08: SKU alterado há menos do intervalo mínimo entre decisões.")
    if other["estrategico"]:
        alerts.append("R04: produto estratégico exige aprovação humana.")
        approval = True
    if row["curva_abc"] == "A" and variation is not None and abs(variation) > D(settings.curve_a_threshold):
        alerts.append("R03: alteração relevante em Curva A exige aprovação.")
        approval = True
    coverage = row.get("cobertura_dias")
    if missing(coverage) or missing(row.get("estoque_atual")):
        alerts.append("Informação de estoque/cobertura ausente.")
        review = approval = True
    elif variation is not None and variation < 0 and D(coverage) < D(settings.low_coverage):
        alerts.append("R11: redução com baixa cobertura de estoque.")
        approval = True
    if (not missing(coverage) and D(coverage) < 0) or (not missing(row.get("estoque_atual")) and D(row["estoque_atual"]) < 0):
        blocks.append("Estoque ou cobertura negativos; corrigir informação de origem.")
    excess = not missing(coverage) and D(coverage) > D(settings.high_coverage) and sales["queda_3_meses"]
    if excess:
        alerts.append("R12: excesso de estoque e três quedas mensais consecutivas; priorizar análise.")
    if row["curva_abc"] not in ("A", "B", "C") or missing(row.get("status")):
        blocks.append("Cadastro sem curva ABC/status válido.")
    if str(row.get("status", "")).lower() == "inativo":
        blocks.append("Produto inativo no cadastro.")
    action = "REVISAR" if review or blocks else ("SUBIR" if variation > D(settings.neutrality) else "BAIXAR" if variation < -D(settings.neutrality) else "MANTER")
    risk = "Alto" if blocks or review or rule["exception"] else "Médio" if approval or (variation is not None and variation < 0) else "Baixo"
    priority = min(100, settings.priority_base + (settings.priority_margin if current_margin < rule["minimum"] else 0)
                   + (settings.priority_excess if excess else 0) + (settings.priority_curve_a if row["curva_abc"] == "A" else 0)
                   + (settings.priority_high_risk if risk == "Alto" else 0))
    rationale = f"{action}: margem atual {current_margin:.2%}; piso {floor:.2f}; alvo {target:.2f}. "
    rationale += f"Mercado: {market:.2f} ({competition['quantidade']} concorrentes válidos). " if market is not None else "Mercado sem sinal válido. "
    rationale += f"Regra: {rule['winner']}. {rule['reason']}"
    return clean({**row, "custo_total": cost, "preco_mercado": market, "margem_atual": current_margin,
            "margem_minima_original": row["margem_minima"], "margem_minima_aplicada": rule["minimum"],
            "margem_excecao": rule["minimum"] if rule["exception"] else None, "margem_alvo_aplicada": rule["target"],
            "preco_minimo": floor, "preco_alvo": money(target), "preco_sugerido": suggested, "margem_projetada": projected,
            "variacao_percentual": variation, "diferenca_mercado": current/D(market)-1 if market else None,
            "acao": action, "nivel_risco": risk, "prioridade": priority, "justificativa": rationale,
            "exige_aprovacao": approval or bool(blocks) or review, "excecao_utilizada": rule["exception"],
            "alertas": alerts + blocks, "bloqueios": blocks, "regra_aplicada": rule["winner"],
            "snapshot_regras": rule, "status": "Pendente de análise", "sinais_utilizados": {"vendas": sales, "concorrencia": competition, **other}})
