from src.signals import sales_signal


def test_excluded_sku_no_price(service):
    service.exclude(["PP-0001"],"Teste", "2026-09-01",None,"Teste")
    recs = service.analyze()
    excluded = [r for r in recs if r["sku"] == "PP-0001"]
    assert len(excluded) == 3
    assert all(r["acao"] == "EXCLUÍDO" and r["preco_sugerido"] is None for r in excluded)
    assert len(recs) == 120


def test_future_exclusion_and_reactivate(service):
    service.exclude(["PP-0001"],"Teste", "2026-10-01",None,"Teste")
    assert all(r["acao"] != "EXCLUÍDO" for r in service.analyze())
    assert sum(r["acao"] == "EXCLUÍDO" for r in service.analyze(reference="2026-10-02")) == 3
    record = service.db.all("sku_exclusions")[0]
    service.end_exclusion(record["id"],"Teste")
    assert all(r["acao"] != "EXCLUÍDO" for r in service.analyze(reference="2026-10-02"))
    assert len(service.db.all("sku_exclusions")) == 1


def test_manual_sale_audited(service):
    service.set_last_sale("PP-0001","Loja física","2026-06-01","Evidência manual para teste","Teste")
    signal = sales_signal(service.bundle(),"PP-0001","Loja física",service.reference(),service.db.all("manual_sales"))
    assert signal["origem"] == "informado manualmente" and signal["comprovado"]
    assert signal["dias_sem_venda"] == 100
    assert any(r["entidade"] == "ultima_venda" for r in service.db.all("audit_log"))
