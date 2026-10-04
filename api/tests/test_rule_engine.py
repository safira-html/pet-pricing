from copy import deepcopy
from decimal import Decimal

import pytest

from src.models import Settings
from src.rule_engine import resolve_rules, validate_rule


def resolve(row, rules, sales):
    return resolve_rules(row,rules,"2026-09-09",sales,Settings())


def test_curve_rule(row,rule,signals):
    result = resolve(row,[rule],signals["sales"])
    assert result["minimum"] == Decimal(".25")
    assert result["winner"] == "Curva A"


def test_exception_requires_evidence_authorization_approval(row,rule,signals):
    rule.update(condicao_sem_venda_ativa=True, permite_margem_abaixo_base=True)
    signals["sales"].update(dias_sem_venda=70, origem="informado manualmente")
    result = resolve(row,[rule],signals["sales"])
    assert result["exception"] and result["approval"]
    assert result["minimum"] == Decimal(".15")
    rule["permite_margem_abaixo_base"] = False
    assert not resolve(row,[rule],signals["sales"])["exception"]
    rule["permite_margem_abaixo_base"] = True
    rule["exige_aprovacao"] = False
    with pytest.raises(ValueError,match="aprovação"):
        validate_rule(rule,[row])
    assert not resolve(row,[rule],signals["sales"])["exception"]


def test_estimate_does_not_prove_exception(row,rule,signals):
    rule.update(condicao_sem_venda_ativa=True,permite_margem_abaixo_base=True)
    signals["sales"].update(dias_sem_venda=120,origem="estimado",comprovado=False)
    result = resolve(row,[rule],signals["sales"])
    assert not result["exception"]
    assert any("informação insuficiente" in a for a in result["alerts"])


@pytest.mark.parametrize("field,value", [("fim_vigencia","2026-09-08"),("inicio_vigencia","2026-09-10")])
def test_out_of_validity_ignored(row,rule,signals,field,value):
    rule[field] = value
    result = resolve(row,[rule],signals["sales"])
    assert result["minimum"] == Decimal(".2")
    assert not result["rules"]


def test_sku_precedence_and_strict_minimum(row,rule,signals):
    sku_rule = {**rule,"id":2,"nome":"Específica","tipo_escopo":"sku","valores_escopo":[row["sku"]],"prioridade":1,"margem_minima":.22,"margem_alvo":.32}
    result = resolve(row,[rule,sku_rule],signals["sales"])
    assert result["winner"] == "Específica"
    assert result["target"] == Decimal(".32")
    assert result["minimum"] == Decimal(".25")


def test_unresolved_conflict(row,rule,signals):
    other = {**rule,"id":2,"nome":"Conflitante","margem_alvo":.40}
    result = resolve(row,[rule,other],signals["sales"])
    assert result["conflicts"] and result["hard_blocks"]
    from src.pricing_engine import recommend
    rec = recommend(row,result,signals["competition"],signals["sales"],signals["other"],Settings())
    assert rec["acao"] == "REVISAR"


def test_priority(row,rule,signals):
    other = {**rule,"id":2,"nome":"Mais prioritária","prioridade":99,"margem_alvo":.35}
    result = resolve(row,[rule,other],signals["sales"])
    assert result["winner"] == other["nome"]
    assert not result["conflicts"]


@pytest.mark.parametrize("change", [{"margem_minima":1.1}, {"margem_alvo":.2}, {"dias_sem_venda":0}, {"fim_vigencia":"2025-01-01"}, {"margem_alvo":.95}])
def test_invalid_rule_rejected(rule,row,change):
    rule.update(change)
    with pytest.raises(ValueError):
        validate_rule(rule,[row])


def test_simulation_and_persistence(service,rule):
    rule.pop("id")
    preview = service.simulate_rule(rule)
    assert preview["skus"] > 0
    assert len(preview["canais"]) == 3
    assert preview["comparacao"]
    item_id = service.save_rule(rule,"Teste")
    saved = service.db.get("custom_rules",item_id)
    assert saved["margem_minima"] == .25
    service.deactivate_rule(item_id,"Teste")
    assert not service.db.get("custom_rules",item_id)["ativa"]
    assert len(service.db.all("audit_log")) >= 4
