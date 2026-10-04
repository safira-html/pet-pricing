from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from statistics import median

import pandas as pd

from .utils import D, as_date, as_datetime, clean, end_of_day, missing, normalize


def product_rows(bundle, local_history=(), reference=None):
    products = bundle.tables["Produtos"]
    prices = bundle.tables["Precos_Atuais"]
    costs = bundle.tables["Custos_Margens"]
    channels = sorted(set(prices.canal.dropna()) | set(costs.canal.dropna()))
    # Analyze the full catalog x available channels; missing prices are explicit review cases.
    base = products[["sku", "produto", "categoria", "marca", "curva_abc", "status"]].merge(pd.DataFrame({"canal": channels}), how="cross")
    base = base.merge(prices, on=["sku", "canal"], how="left", validate="one_to_one")
    base = base.merge(costs, on=["sku", "canal"], how="left", validate="one_to_one")
    base = base.merge(bundle.tables["Estoque"], on="sku", how="left", validate="many_to_one")
    rows = clean(base.to_dict("records"))
    for row in rows:
        history = [h for h in local_history if h["sku"] == row["sku"] and h["canal"] == row["canal"]
                   and as_date(h["aplicado_em"]) <= as_date(reference or bundle.reference)
                   and as_date(h["aplicado_em"]) >= as_date(row.get("data_referencia") or bundle.reference)]
        if history:
            latest = max(history, key=lambda h: h["id"])
            row["preco_atual"] = latest["preco"]
            row["origem_preco"] = "Aplicado no protótipo"
    return rows


def sales_signal(bundle, sku, canal, reference, overrides=()):
    ref = as_date(reference)
    manual = [r for r in overrides if r["sku"] == sku and r["canal"] == canal and as_date(r["ultima_venda"]) <= ref]
    sales = bundle.tables["Vendas_12m"]
    sales = sales[(sales.sku == sku) & (sales.canal == canal)].copy()
    sales["mes"] = pd.to_datetime(sales.mes)
    sales = sales[sales.mes.dt.date < ref.replace(day=1)].sort_values("mes")
    signal = {"dias_sem_venda": None, "origem": "informação insuficiente", "comprovado": False,
              "ultima_venda": None, "quantidades_recentes": sales.quantidade.tail(4).tolist(), "queda_3_meses": False}
    recent = sales.tail(4)
    if len(recent) == 4 and recent.quantidade.notna().all():
        months = recent.mes.dt.to_period("M").tolist()
        consecutive = all(months[i] + 1 == months[i + 1] for i in range(3))
        quantities = recent.quantidade.tolist()
        signal["queda_3_meses"] = consecutive and all(quantities[i] > quantities[i + 1] for i in range(3))
    if manual:
        latest = max(manual, key=lambda r: r["id"])
        day = as_date(latest["ultima_venda"])
        signal.update(ultima_venda=day.isoformat(), dias_sem_venda=(ref-day).days, origem="informado manualmente", comprovado=True, ajuste_id=latest["id"])
        return signal
    # Explicit source date is reliable only when actually supplied, never synthesized from month.
    for col in ("data_ultima_venda", "ultima_venda", "data_venda"):
        source = bundle.tables["Vendas_12m"]
        if col in source:
            exact = source[(source.sku == sku) & (source.canal == canal) & (source.quantidade > 0)][col].dropna().map(as_date)
            exact = exact[exact <= ref]
            if not exact.empty:
                day = exact.max()
                signal.update(ultima_venda=day.isoformat(), dias_sem_venda=(ref-day).days, origem="calculado", comprovado=True)
                return signal
    positive = sales[sales.quantidade > 0]
    if not positive.empty:
        month = positive.mes.max()
        month_end = (month + pd.offsets.MonthEnd(0)).date()
        signal.update(dias_sem_venda=max(0, (ref-month_end).days), origem="estimado", ultimo_periodo=month.strftime("%Y-%m"))
    return signal


def competition_signal(bundle, sku, reference, settings):
    frame = bundle.tables["Concorrencia"]
    records = clean(frame[frame.sku == sku].to_dict("records"))
    inspected, stale, anomaly = [], False, False
    for record in records:
        reasons = []
        if normalize(record.get("disponivel")) not in ("sim", "true", "1"):
            reasons.append("Indisponível")
        if normalize(record.get("confiabilidade_matching")) not in ("alta", "media"):
            reasons.append("Matching de baixa confiança ou ausente")
        if normalize(record.get("correspondencia")) not in ("correspondencia_alta", "correspondencia_media", "alta", "media", "exata", "valida", "ean_exato"):
            reasons.append("Correspondência inválida")
        if missing(record.get("preco")) or D(record["preco"]) <= 0:
            reasons.append("Preço inválido")
        age = None
        if not record.get("data_hora_coleta"):
            reasons.append("Coleta sem data")
        else:
            age = (end_of_day(reference) - as_datetime(record["data_hora_coleta"])).total_seconds()/3600
            if age < 0:
                reasons.append("Coleta posterior à referência")
            elif age > settings.competition_max_hours:
                reasons.append("Coleta desatualizada")
                stale = True
        price = D(record["preco"]) if not missing(record.get("preco")) else None
        if settings.include_competitor_shipping:
            if missing(record.get("frete")) or D(record["frete"]) < 0:
                reasons.append("Frete ausente ou inválido")
            elif price is not None:
                price += D(record["frete"])
        inspected.append({**record, "idade_horas": round(age, 2) if age is not None else None, "motivo_descarte": "; ".join(reasons), "valido": not reasons, "preco_comparavel": float(price) if price is not None else None})
    # A historical observation is used for anomalies, but only the latest per competitor votes in median.
    valid = [r for r in inspected if r["valido"]]
    latest = {}
    history_available = False
    for record in sorted(valid, key=lambda r: r["data_hora_coleta"]):
        key = record["concorrente"]
        previous = latest.get(key)
        if previous:
            hours = (as_datetime(record["data_hora_coleta"]) - as_datetime(previous["data_hora_coleta"])).total_seconds()/3600
            if 0 < hours <= 24:
                history_available = True
                if abs(D(record["preco"])/D(previous["preco"])-1) > D(settings.anomaly_threshold):
                    anomaly = True
            previous["valido"] = False
            previous["motivo_descarte"] = "Observação anterior do mesmo concorrente; usada apenas no histórico"
        latest[key] = record
    values = [D(r["preco_comparavel"]) for r in latest.values()]
    return {"mediana": median(values) if values else None, "quantidade": len(values), "encontrados": len(records),
            "desatualizado": stale, "anomalia": anomaly, "historico_24h_disponivel": history_available,
            "observacoes": inspected, "frete_incluido": settings.include_competitor_shipping}


def other_signals(bundle, row, reference, local_history, settings):
    ref, sku = as_date(reference), row["sku"]
    promos = clean(bundle.tables["Promocoes"].to_dict("records"))
    active = [p for p in promos if p["sku"] == sku and p.get("inicio") and p.get("fim") and as_date(p["inicio"]) <= ref <= as_date(p["fim"])]
    uncertain_promos = [p for p in promos if p["sku"] == sku and (not p.get("inicio") or not p.get("fim"))]
    prices = clean(bundle.tables["Historico_Precos"].to_dict("records"))
    dates = [as_date(p["data"]) for p in prices if p["sku"] == sku and p.get("data") and as_date(p["data"]) <= ref]
    dates += [as_date(p["aplicado_em"]) for p in local_history if p["sku"] == sku and as_date(p["aplicado_em"]) <= ref]
    recent = max(dates) if dates else None
    return {"promocoes": active, "promocao_incompleta": bool(uncertain_promos),
            "ultima_alteracao": recent.isoformat() if recent else None,
            "alteracao_recente": recent is not None and (ref-recent).days < settings.cooldown_days,
            "estrategico": sku in settings.strategic_skus or "estrateg" in normalize(row.get("status", ""))}
