from decimal import Decimal

import pytest

from src.ai_explainer import explain
from src.models import Settings
from src.pricing_engine import margin, minimum_price, recommend
from src.rule_engine import resolve_rules
from src.signals import competition_signal
from src.utils import money


def calculate(row, signals, rule=None):
    config = Settings()
    resolved = resolve_rules(row, [rule] if rule else [], "2026-09-09", signals["sales"], config)
    return recommend(row, resolved, signals["competition"], signals["sales"], signals["other"], config)


def test_margin():
    assert margin(100,70,.05) == Decimal("0.25")


def test_floor():
    assert minimum_price(70,.05,.25) == 100
    with pytest.raises(ValueError, match="Denominador"):
        minimum_price(70,.75,.25)


def test_respects_minimum_and_variation(row, signals):
    rec = calculate(row,signals)
    assert margin(rec["preco_sugerido"],70,.05) >= Decimal(".20")
    assert abs(Decimal(rec["variacao_percentual"])) <= Decimal(".05")


def test_no_feasible_price_blocks(row, signals):
    row["custo_total_referencia"] = 100
    rec = calculate(row,signals)
    assert rec["acao"] == "REVISAR"
    assert rec["preco_sugerido"] is None
    assert any("incompatível" in b for b in rec["bloqueios"])


def test_max_variation_after_rounding(row, signals):
    row.update(preco_atual=1.01,custo_total_referencia=.5, margem_alvo=.50)
    signals["competition"]["mediana"] = 10
    rec = calculate(row,signals)
    assert Decimal(rec["preco_sugerido"]) <= Decimal("1.0605")


def test_monetary_rounding():
    assert money("1.005") == Decimal("1.01")
    assert money("1.001", "up") == Decimal("1.01")
    assert money("1.009", "down") == Decimal("1.00")
    assert margin(money(minimum_price("3.57", ".025", ".2"),"up"),"3.57",".025") >= Decimal(".2")


def test_active_promotion_review(row,signals):
    signals["other"]["promocoes"] = [{"campanha":"Teste"}]
    rec = calculate(row,signals)
    assert rec["acao"] == "REVISAR" and rec["exige_aprovacao"]


def test_curve_a_relevant_change(row,signals):
    signals["competition"]["mediana"] = 150
    rec = calculate(row,signals)
    assert rec["exige_aprovacao"]
    assert any("R03" in a for a in rec["alertas"])


def test_invalid_competitor_ignored(bundle):
    signal = competition_signal(bundle,"PP-0001",bundle.reference,Settings())
    assert signal["quantidade"] > 0
    copy = bundle.tables["Concorrencia"].copy()
    try:
        mask = bundle.tables["Concorrencia"].sku == "PP-0001"
        bundle.tables["Concorrencia"].loc[mask,"disponivel"] = "Não"
        signal = competition_signal(bundle,"PP-0001",bundle.reference,Settings())
        assert signal["mediana"] is None
        assert all(not r["valido"] for r in signal["observacoes"])
    finally:
        bundle.tables["Concorrencia"] = copy


def test_stale_data_alert(bundle,row,signals):
    comp = competition_signal(bundle,"PP-0001","2026-09-15",Settings())
    assert comp["desatualizado"] and comp["mediana"] is None
    signals["competition"] = comp
    rec = calculate(row,signals)
    assert rec["acao"] == "REVISAR"
    assert any("desatualizada" in a for a in rec["alertas"])


def test_no_api_key_fallback(monkeypatch,row,signals):
    monkeypatch.delenv("OPENAI_API_KEY",raising=False)
    result = explain(calculate(row,signals),use_ai=True)
    assert result["modo"] == "Contingência determinística"
    assert result["principais_fatores"]


def test_api_failure_fallback(row,signals):
    class Broken:
        @property
        def responses(self):
            raise RuntimeError("sensitive-provider-error")
    result = explain(calculate(row,signals),use_ai=True,client=Broken())
    assert result["modo"] == "Contingência determinística"
    assert "sensitive" not in str(result)


def test_all_actions(row,signals):
    row.update(margem_alvo=.25)
    assert calculate(row,signals)["acao"] == "MANTER"
    signals["competition"]["mediana"] = 110
    assert calculate(row,signals)["acao"] == "SUBIR"
    signals["competition"]["mediana"] = 90
    assert calculate(row,signals)["acao"] == "BAIXAR"


def test_low_stock_reduction_and_excess(row, signals):
    row.update(cobertura_dias=5,margem_alvo=.25)
    signals["competition"]["mediana"] = 90
    rec = calculate(row,signals)
    assert any("R11" in a for a in rec["alertas"])
    row["cobertura_dias"] = 100
    signals["sales"]["queda_3_meses"] = True
    rec2 = calculate(row,signals)
    assert any("R12" in a for a in rec2["alertas"])
    assert rec2["prioridade"] > rec["prioridade"]


def test_market_median_and_shipping_are_explicit(bundle):
    from copy import deepcopy
    import pandas as pd
    custom = deepcopy(bundle)
    observations = []
    for i,price in enumerate([95,100,1000]):
        observations.append({"sku":"SKU","concorrente":str(i),"correspondencia":"EAN exato","preco":price,"disponivel":"Sim","frete":10,"data_hora_coleta":"2026-09-09T08:00:00","confiabilidade_matching":"Alta"})
    custom.tables["Concorrencia"] = pd.DataFrame(observations)
    assert competition_signal(custom,"SKU",custom.reference,Settings())["mediana"] == 100
    assert competition_signal(custom,"SKU",custom.reference,Settings(include_competitor_shipping=True))["mediana"] == 110
    custom.tables["Concorrencia"].loc[1,"confiabilidade_matching"] = "Baixa"
    assert competition_signal(custom,"SKU",custom.reference,Settings())["quantidade"] == 2


def test_temporal_anomaly_requires_same_competitor(bundle):
    from copy import deepcopy
    import pandas as pd
    custom = deepcopy(bundle)
    base = {"sku":"SKU","concorrente":"C1","correspondencia":"EAN exato","disponivel":"Sim","frete":0,"confiabilidade_matching":"Alta"}
    custom.tables["Concorrencia"] = pd.DataFrame([{**base,"preco":100,"data_hora_coleta":"2026-09-08T10:00:00"},{**base,"preco":130,"data_hora_coleta":"2026-09-09T08:00:00"}])
    signal = competition_signal(custom,"SKU",custom.reference,Settings())
    assert signal["anomalia"]
    assert signal["quantidade"] == 1
    assert signal["mediana"] == 130


@pytest.mark.parametrize("change", [{"max_increase":.06},{"competition_max_hours":49},{"curve_a_threshold":.04},{"channel_gap":.06},{"anomaly_threshold":.21},{"low_coverage":10},{"high_coverage":100}])
def test_config_cannot_weaken_base_safety(change):
    with pytest.raises(ValueError):
        Settings(**change).validate()
