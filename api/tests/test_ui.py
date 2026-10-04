from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from src.data_loader import ROOT


@pytest.mark.parametrize("page", ["app.py", "pages/1_Recomendacoes.py", "pages/2_Detalhe_SKU.py", "pages/3_Regras.py", "pages/4_Exclusoes.py", "pages/5_Agendamentos.py", "pages/6_Auditoria.py"])
def test_all_pages_start(page, tmp_path, monkeypatch):
    monkeypatch.setenv("PET_PRICING_DB", str(tmp_path / "ui.db"))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app = AppTest.from_file(str(ROOT/"app.py"), default_timeout=45).run()
    if page != "app.py":
        app.switch_page(page).run()
    assert not app.exception, [e.message for e in app.exception]
    assert all(e.value.startswith("Bloqueios: ") for e in app.error), [e.value for e in app.error]
    assert app.title


def test_rule_can_be_simulated_and_saved_in_ui(tmp_path, monkeypatch):
    from src.database import Database
    monkeypatch.setenv("PET_PRICING_DB", str(tmp_path / "ui_rule.db"))
    app = AppTest.from_file(str(ROOT/"app.py"), default_timeout=45).run()
    app.switch_page("pages/3_Regras.py").run()
    def widget(kind,label):
        return next(x for x in getattr(app,kind) if x.label == label)
    widget("multiselect","Valores do escopo").set_value(["A"])
    widget("text_input","Nome da regra").set_value("Curva A com exceção")
    widget("text_area","Justificativa obrigatória da regra").set_value("Teste de operação sem venda")
    widget("checkbox","Habilitar exceção para produto sem venda").check()
    widget("checkbox","Autorizar exceção abaixo da margem mínima original").check()
    widget("button","Simular impacto antes de salvar").click().run()
    assert not app.exception
    assert not app.error
    assert any(x.label == "Salvar regra simulada" for x in app.button)
    widget("button","Salvar regra simulada").click().run()
    assert not app.exception
    rules = Database().all("custom_rules")
    assert len(rules) == 1
    assert rules[0]["margem_minima"] == .25
    assert rules[0]["margem_excecao_sem_venda"] == .15
    assert rules[0]["dias_sem_venda"] == 60


def test_approve_and_schedule_through_ui(service, monkeypatch):
    from src.utils import now
    service.save_config(service.config(), now().date(), "Teste")
    service.generate("Teste")
    recs = service.latest()
    rec = next(r for r in recs if r.get("preco_sugerido") and not r["bloqueios"])
    monkeypatch.setenv("PET_PRICING_DB", str(service.db.path))
    app = AppTest.from_file(str(ROOT/"app.py"), default_timeout=45).run()
    app.switch_page("pages/1_Recomendacoes.py").run()
    def widget(kind,label):
        return next(x for x in getattr(app,kind) if x.label == label)
    widget("selectbox","Recomendação para análise e decisão").set_value(rec).run()
    widget("text_area","Justificativa humana").set_value("Concorrência antiga conferida para demonstração local")
    widget("button","Registrar decisão").click().run()
    assert service.recommendation(rec["id"])["status"] == "Aprovado"
    app.switch_page("pages/5_Agendamentos.py").run()
    assert not app.exception
    widget("text_area","Justificativa e riscos revisados").set_value("Aplicação fictícia local; riscos revisados")
    widget("button","Agendar aplicação local").click().run()
    assert not app.exception
    assert not app.error, [e.value for e in app.error]
    schedules = service.db.all("scheduled_price_changes")
    assert len(schedules) == 1 and schedules[0]["status"] == "Agendado"


def test_exclusion_through_ui(service,monkeypatch):
    monkeypatch.setenv("PET_PRICING_DB",str(service.db.path))
    app = AppTest.from_file(str(ROOT/"app.py"),default_timeout=45).run()
    app.switch_page("pages/4_Exclusoes.py").run()
    next(x for x in app.multiselect if x.label == "SKUs para excluir").set_value(["PP-0001","PP-0002"])
    next(x for x in app.text_area if x.label == "Motivo da exclusão").set_value("Fora da política comercial no teste")
    next(x for x in app.button if x.label == "Registrar exclusão").click().run()
    assert not app.exception and not app.error
    assert len(service.db.all("sku_exclusions")) == 2
    assert sum(r["acao"] == "EXCLUÍDO" for r in service.latest()) == 6
