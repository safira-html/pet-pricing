from __future__ import annotations

import json

from .utils import D, active_on, as_date, missing

SCOPES = {"todos": 0, "curva_abc": 1, "categoria": 2, "marca": 2, "canal": 2, "sku": 3}
PERCENT_FIELDS = ["margem_minima", "margem_alvo", "variacao_maxima_subida", "variacao_maxima_reducao", "margem_excecao_sem_venda"]


def scope_values(rule):
    value = rule.get("valores_escopo", [])
    return json.loads(value) if isinstance(value, str) else value


def matches(rule, row):
    scope = rule["tipo_escopo"]
    return scope == "todos" or str(row.get(scope)) in scope_values(rule)


def validate_rule(rule, affected_rows=()):
    if not rule.get("nome", "").strip() or not rule.get("justificativa", "").strip():
        raise ValueError("Nome e justificativa são obrigatórios.")
    if rule.get("tipo_escopo") not in SCOPES:
        raise ValueError("Escopo inválido.")
    if rule["tipo_escopo"] != "todos" and not scope_values(rule):
        raise ValueError("Selecione ao menos um valor de escopo.")
    for field in PERCENT_FIELDS:
        if not 0 <= D(rule[field]) <= 1:
            raise ValueError(f"{field}: percentual deve estar entre 0% e 100%.")
    if D(rule["margem_alvo"]) < D(rule["margem_minima"]):
        raise ValueError("Margem alvo deve ser maior ou igual à mínima.")
    if int(rule["dias_sem_venda"]) <= 0:
        raise ValueError("Dias sem venda deve ser maior que zero.")
    if not as_date(rule.get("inicio_vigencia")):
        raise ValueError("Informe o início de vigência.")
    if rule.get("fim_vigencia") and as_date(rule["fim_vigencia"]) < as_date(rule["inicio_vigencia"]):
        raise ValueError("Fim de vigência anterior ao início.")
    if rule["condicao_sem_venda_ativa"]:
        if not rule["exige_aprovacao"]:
            raise ValueError("Exceção exige aprovação humana.")
        if D(rule["margem_excecao_sem_venda"]) > D(rule["margem_minima"]):
            raise ValueError("Margem da exceção não pode superar a margem mínima normal.")
    for row in affected_rows:
        if matches(rule, row) and not missing(row.get("taxa_canal")):
            for field in ("margem_minima", "margem_alvo", "margem_excecao_sem_venda"):
                if 1 - D(row["taxa_canal"]) - D(rule[field]) <= 0:
                    raise ValueError(f"Denominador inválido para {row['sku']} / {row['canal']} ({field}).")
    if any(D(rule[f]) >= 1 for f in ("margem_minima", "margem_alvo", "margem_excecao_sem_venda")):
        raise ValueError("Margem de 100% torna o cálculo impossível.")
    return rule


def resolve_rules(row, rules, reference, sales, settings):
    applicable = [r for r in rules if active_on(r, reference) and matches(r, row)]
    applicable.sort(key=lambda r: (-SCOPES[r["tipo_escopo"]], -int(r["prioridade"]), int(r.get("id", 0))))
    original = D(row["margem_minima"])
    minimum, target = original, D(row["margem_alvo"])
    up, down = D(settings.max_increase), D(settings.max_decrease)
    alerts, conflicts, hard = [], [], []
    winner = applicable[0] if applicable else None
    approval, exception = False, False
    if winner:
        target = D(winner["margem_alvo"])
        # Precedence picks the target; all normal minima remain protective.
        minimum = max([original] + [D(r["margem_minima"]) for r in applicable])
        up = min([up] + [D(r["variacao_maxima_subida"]) for r in applicable])
        down = min([down] + [D(r["variacao_maxima_reducao"]) for r in applicable])
        approval = any(r["exige_aprovacao"] for r in applicable)
        rank = (SCOPES[winner["tipo_escopo"]], winner["prioridade"])
        peers = [r for r in applicable if (SCOPES[r["tipo_escopo"]], r["prioridade"]) == rank]
        signatures = {(r["margem_alvo"], r["condicao_sem_venda_ativa"], r["margem_excecao_sem_venda"], r["permite_margem_abaixo_base"]) for r in peers}
        if len(signatures) > 1:
            conflicts.append("Conflito não resolvido entre regras de mesma precedência: " + ", ".join(r["nome"] for r in peers))
            hard.extend(conflicts)
        if len(applicable) > 1:
            alerts.append("Sobreposição: " + ", ".join(r["nome"] for r in applicable) + ". Piso normal mais restritivo preservado.")
        if winner["condicao_sem_venda_ativa"]:
            days = sales.get("dias_sem_venda")
            if not sales.get("comprovado"):
                alerts.append("REVISAR — informação insuficiente para comprovar a condição de dias sem venda.")
            elif days is not None and days >= winner["dias_sem_venda"]:
                exc = D(winner["margem_excecao_sem_venda"])
                if exc < original and not winner["permite_margem_abaixo_base"]:
                    alerts.append("Exceção abaixo da margem original não autorizada; piso original mantido.")
                elif winner["exige_aprovacao"] and not conflicts:
                    minimum, exception, approval = exc, True, True
                    alerts.append(f"Exceção explícita: {days} dias sem venda ({sales['origem']}); aprovação humana obrigatória.")
        target = max(target, minimum)
    return {"minimum": minimum, "target": target, "max_up": up, "max_down": down,
            "exception": exception, "approval": approval, "alerts": alerts, "conflicts": conflicts, "hard_blocks": hard,
            "winner": winner["nome"] if winner else "Valores originais da base",
            "reason": "Escopo mais específico; maior prioridade numérica; piso normal mais restritivo e limites menores." if winner else "Nenhuma regra customizada vigente.",
            "rules": applicable}
