from datetime import datetime, timedelta

import pytest

from src.scheduler_service import SchedulerService
from src.utils import TZ

CLOCK = datetime(2026,9,9,12,tzinfo=TZ)
WHEN = datetime(2026,9,10,12,tzinfo=TZ)
UNTIL = datetime(2026,9,11,12,tzinfo=TZ)


def schedule(approved):
    service, rec = approved
    scheduler = SchedulerService(service)
    item = scheduler.schedule(rec["id"],rec["preco_sugerido"],WHEN,UNTIL,"Riscos revisados","Teste",clock=CLOCK)
    return scheduler, item, rec


def test_invalid_price_blocked(approved):
    service,rec = approved
    with pytest.raises(ValueError):
        service.decide(rec["id"],"Editar e aprovar","Teste","Tentativa abaixo do piso",.01)
    with pytest.raises(ValueError,match="diferente"):
        SchedulerService(service).schedule(rec["id"],.01,WHEN,UNTIL,"Teste","Teste",clock=CLOCK)


def test_schedule_conflict(approved):
    scheduler,item,rec = schedule(approved)
    with pytest.raises(ValueError,match="Conflito"):
        scheduler.schedule(rec["id"],rec["preco_sugerido"],WHEN,UNTIL,"Teste","Teste",clock=CLOCK)
    assert len(scheduler.db.all("scheduled_price_changes")) == 1


def test_execute_local_idempotent_and_audited(approved):
    scheduler,item,rec = schedule(approved)
    outcomes = scheduler.execute_due(clock=WHEN)
    assert outcomes == [{"id":item,"status":"Aplicado no protótipo","falha":None}]
    assert scheduler.execute_due(clock=WHEN) == []
    assert len(scheduler.db.all("local_price_history")) == 1
    assert any(r["acao"] == "Aplicado no protótipo" for r in scheduler.db.all("audit_log"))


def test_schedule_expiry(approved):
    scheduler,item,rec = schedule(approved)
    assert scheduler.execute_due(clock=UNTIL+timedelta(seconds=1))[0]["status"] == "Expirado"
    assert not scheduler.db.all("local_price_history")


def test_exclusion_cancels_pending(approved):
    scheduler,item,rec = schedule(approved)
    scheduler.service.exclude([rec["sku"]],"Bloquear",WHEN.date(),None,"Teste")
    assert scheduler.db.get("scheduled_price_changes",item)["status"] == "Cancelado"
    assert not scheduler.execute_due(clock=WHEN)


def test_rules_changed_before_execution(approved,rule):
    scheduler,item,rec = schedule(approved)
    rule.pop("id")
    rule.update(tipo_escopo="sku",valores_escopo=[rec["sku"]])
    scheduler.service.save_rule(rule,"Teste")
    result = scheduler.execute_due(clock=WHEN)
    assert result[0]["status"] == "Falhou"
    assert not scheduler.db.all("local_price_history")


def test_decision_audit_and_mandatory_reason(approved):
    service,rec = approved
    assert service.db.all("decisions")[0]["preco_original_sugerido"] == float(rec["preco_sugerido"])
    assert any(r["entidade"] == "decisao" for r in service.db.all("audit_log"))
    with pytest.raises(ValueError,match="justificativa"):
        service.decide(rec["id"],"Rejeitar","Teste")
    service.decide(rec["id"],"Rejeitar","Teste","Decisão comercial")
    assert service.recommendation(rec["id"])["status"] == "Rejeitado"
    assert len(service.db.all("decisions")) == 2


def test_stale_analysis_cannot_approve(service):
    service.generate()
    rec = service.latest()[0]
    service.exclude(["PP-0001"],"Teste","2026-09-01",None,"Teste")
    with pytest.raises(ValueError,match="desatualizada"):
        service.decide(rec["id"],"Aprovar","Teste","Verificado")


def test_schedule_outside_recommendation_validity(approved):
    service,rec = approved
    with pytest.raises(ValueError,match="validade"):
        SchedulerService(service).schedule(rec["id"],rec["preco_sugerido"],WHEN,UNTIL+timedelta(days=20),"Teste","Teste",clock=CLOCK)


def test_cooldown_is_72_hours_for_local_events(approved):
    scheduler,item,rec = schedule(approved)
    scheduler.execute_due(clock=WHEN)
    with scheduler.db.connect() as con:
        with pytest.raises(ValueError,match="intervalo mínimo em horas"):
            scheduler._fresh(rec,WHEN+timedelta(days=3,hours=-1),con)
        assert scheduler._fresh(rec,WHEN+timedelta(days=3),con)


def test_future_exclusion_prevents_schedule(approved):
    service,rec = approved
    service.exclude([rec["sku"]],"Bloqueio futuro","2026-09-10",None,"Teste")
    service.generate("Teste")
    fresh = next(r for r in service.latest() if r["sku"] == rec["sku"] and r["canal"] == rec["canal"])
    service.decide(fresh["id"],"Aprovar","Teste","Riscos revisados")
    with pytest.raises(ValueError,match="excluído"):
        SchedulerService(service).schedule(fresh["id"],fresh["preco_sugerido"],WHEN,UNTIL,"Teste","Teste",clock=CLOCK)


def test_canceled_schedule_keeps_history(approved):
    scheduler,item,rec = schedule(approved)
    scheduler.cancel(item,"Teste","Mudança de estratégia")
    assert scheduler.db.get("scheduled_price_changes",item)["status"] == "Cancelado"
    assert not scheduler.execute_due(clock=WHEN)
    assert any(a["acao"] == "Cancelar" for a in scheduler.db.all("audit_log"))


def test_delayed_execution_revalidates_promotion(approved, monkeypatch):
    import pandas as pd
    service,rec = approved
    bundle = service.bundle()
    bundle.tables["Promocoes"] = pd.concat([bundle.tables["Promocoes"],pd.DataFrame([{"sku":rec["sku"],"campanha":"Campanha futura de teste","inicio":"2026-09-11","fim":"2026-09-15","desconto":.1,"regra":"Revisão humana"}])],ignore_index=True)
    monkeypatch.setattr(service,"bundle",lambda con=None:bundle)
    scheduler,item,rec = schedule(approved)
    result = scheduler.execute_due(clock=WHEN+timedelta(days=1))
    assert result[0]["status"] == "Falhou"
    assert "riscos mudaram" in result[0]["falha"]
    assert not scheduler.db.all("local_price_history")
    assert service.recommendation(rec["id"])["status"] == "Em revisão"
    with pytest.raises(ValueError,match="Aprove"):
        scheduler.schedule(rec["id"],rec["preco_sugerido"],WHEN+timedelta(days=1),UNTIL,"Reagendar sem nova aprovação","Teste",clock=CLOCK)


def test_below_original_margin_only_after_explicit_exception_approval(service, rule):
    from src.pricing_engine import margin
    rule.pop("id")
    rule.update(tipo_escopo="sku",valores_escopo=["PP-0001"],condicao_sem_venda_ativa=True,permite_margem_abaixo_base=True)
    service.save_rule(rule,"Teste")
    service.set_last_sale("PP-0001","Loja física","2026-06-01","Contagem manual para teste","Teste")
    service.generate("Teste")
    rec = next(r for r in service.latest() if r["sku"] == "PP-0001" and r["canal"] == "Loja física")
    assert rec["excecao_utilizada"] and rec["exige_aprovacao"]
    scheduler = SchedulerService(service)
    with pytest.raises(ValueError,match="Aprove"):
        scheduler.schedule(rec["id"],4.38,WHEN,UNTIL,"Teste","Teste",clock=CLOCK)
    service.decide(rec["id"],"Editar e aprovar","Teste","Aprovo margem excepcional comprovada e promoção conferida",4.38)
    assert float(margin(4.38,rec["custo_total"],rec["taxa_canal"])) < float(rec["margem_minima_original"])
    assert not service.db.all("local_price_history")
    item = scheduler.schedule(rec["id"],4.38,WHEN,UNTIL,"Exceção explicitamente aprovada","Teste",clock=CLOCK)
    assert scheduler.execute_due(clock=WHEN)[0]["status"] == "Aplicado no protótipo"
    assert any("Exceção de margem" in a["acao"] for a in service.db.all("audit_log"))
