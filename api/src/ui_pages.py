from __future__ import annotations

import json
from datetime import datetime, timedelta

import pandas as pd
import plotly.express as px
import streamlit as st

from .ai_explainer import explain
from .audit_service import timeline
from .models import SCHEDULE_STATUSES
from .rule_engine import matches, scope_values
from .scheduler_service import SchedulerService
from .signals import product_rows
from .ui import csv_bytes, decision_controls, operator, run_action, setup, show_table, table_frame
from .utils import TZ, as_date, brl, dumps, fingerprint, now, validity


def dashboard():
    service = setup("Pet Pricing")
    st.markdown("### Copiloto Inteligente de Precificação")
    st.write("Transforme margem, mercado e estoque em decisões de preço explicáveis.")
    recs = service.latest()
    df = pd.DataFrame(recs)
    active = df[df.acao != "EXCLUÍDO"]
    cols = st.columns(4)
    cols[0].metric("SKUs analisados", active.sku.nunique())
    cols[1].metric("Combinações SKU / canal", len(recs))
    cols[2].metric("SKUs excluídos", df[df.acao == "EXCLUÍDO"].sku.nunique())
    cols[3].metric("Alterações agendadas", len(service.db.query("SELECT id FROM scheduled_price_changes WHERE status='Agendado'")))
    for col, action in zip(st.columns(4), ["SUBIR", "BAIXAR", "MANTER", "REVISAR"]):
        col.metric(action.capitalize(), int((df.acao == action).sum()))
    left, right = st.columns([1, 2])
    with left:
        current = pd.to_numeric(active.margem_atual, errors="coerce")
        projected = pd.to_numeric(active.margem_projetada, errors="coerce")
        st.metric("Margem média atual", f"{current.mean():.1%}" if current.notna().any() else "—")
        st.metric("Margem média projetada", f"{projected.mean():.1%}" if projected.notna().any() else "—")
        st.caption(f"Médias simples, sem ponderação de vendas. Projeção disponível em {projected.notna().sum()} de {len(active)} combinações; casos sem preço viável ficam fora da média projetada.")
    with right:
        counts = active.nivel_risco.value_counts().rename_axis("Risco").reset_index(name="Combinações")
        chart = px.bar(counts, x="Risco", y="Combinações", color="Risco", color_discrete_map={"Alto":"#EBAD65", "Médio":"#A7B7C6", "Baixo":"#8EF05B"})
        chart.update_layout(height=300, margin=dict(t=20, b=10), showlegend=False, paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(chart, use_container_width=True)
    st.subheader("Prioridades para o analista")
    show_table([r for r in recs if r["acao"] != "EXCLUÍDO"][:12])
    st.page_link("pages/1_Recomendacoes.py", label="Abrir todas as recomendações →")
    with st.expander("Importação, qualidade e hipóteses técnicas"):
        bundle = service.bundle()
        st.write(f"Arquivo: {bundle.source_name} · Referência original: {bundle.reference:%d/%m/%Y}")
        st.code(f"SHA-256: {bundle.source_hash}", language=None)
        st.dataframe(pd.DataFrame([{"Aba": k, "Registros": len(v), "Linha do cabeçalho": bundle.headers[k]} for k,v in bundle.tables.items()]), hide_index=True)
        for issue in bundle.issues:
            st.write(issue)
        upload = st.file_uploader("Atualizar com novo Excel da mesma estrutura", type=["xlsx"])
        if st.button("Validar e importar nova base", disabled=upload is None):
            run_action(lambda: service.import_excel(upload, user=operator()))
    with st.expander("Configurações da análise"):
        settings = service.config()
        with st.form("settings"):
            reference = st.date_input("Data de referência", value=service.reference())
            st.caption("A idade da concorrência usa o fim desse dia. Agendamentos usam o relógio real e revalidam regras na data futura.")
            a, b, c = st.columns(3)
            weight = a.number_input("Peso do mercado (%)", 0.0, 100.0, settings.market_weight*100)
            neutral = b.number_input("Faixa de neutralidade (%)", 0.0, 100.0, settings.neutrality*100, step=.1)
            hours = c.number_input("Coleta válida por até (horas)", 1, 48, settings.competition_max_hours)
            a, b, c = st.columns(3)
            up = a.number_input("Aumento máximo (%)", 0.0, 5.0, settings.max_increase*100, step=.1)
            down = b.number_input("Redução máxima (%)", 0.0, 5.0, settings.max_decrease*100, step=.1)
            days = c.number_input("Validade da recomendação (dias)", 1, 90, settings.recommendation_valid_days)
            a, b, c = st.columns(3)
            curve = a.number_input("Curva A: aprovação acima de (%)", 0.0, 3.0, min(3.0, settings.curve_a_threshold*100), step=.1)
            gap = b.number_input("Diferença entre canais (%)", 0.0, 5.0, min(5.0, settings.channel_gap*100), step=.1)
            cooldown = c.number_input("Intervalo entre alterações (dias)", 3, 90, settings.cooldown_days)
            a, b, c = st.columns(3)
            low = a.number_input("Cobertura baixa (dias)", 15.0, 90.0, float(settings.low_coverage))
            high = b.number_input("Cobertura excessiva (dias)", 15.0, 90.0, float(settings.high_coverage))
            anomaly = c.number_input("Anomalia em 24h (%)", 0.0, 20.0, min(20.0, settings.anomaly_threshold*100))
            shipping = st.checkbox("Considerar frete concorrencial como custo de UM item", value=settings.include_competitor_shipping)
            st.caption("Ative somente se o frete observado puder ser atribuído integralmente a um item. O valor original continua visível no detalhe.")
            products = service.bundle().tables["Produtos"]
            strategic = st.multiselect("SKUs estratégicos", products.sku.tolist(), default=[x for x in settings.strategic_skus if x in set(products.sku)])
            st.markdown("**Pesos da prioridade de análise (0–100)**")
            priority_fields = {"priority_base":"Base", "priority_margin":"Margem abaixo do piso", "priority_excess":"Excesso com queda de vendas", "priority_curve_a":"Curva A", "priority_high_risk":"Risco alto"}
            priority_values = {}
            for column, (field, label) in zip(st.columns(5), priority_fields.items()):
                priority_values[field] = column.number_input(label, 0, 100, int(getattr(settings, field)))
            save = st.form_submit_button("Salvar configurações e recalcular", type="primary")
        if save:
            settings.market_weight, settings.neutrality = weight/100, neutral/100
            settings.max_increase, settings.max_decrease = up/100, down/100
            settings.curve_a_threshold, settings.channel_gap = curve/100, gap/100
            settings.competition_max_hours, settings.cooldown_days = int(hours), int(cooldown)
            settings.low_coverage, settings.high_coverage, settings.anomaly_threshold = low, high, anomaly/100
            settings.include_competitor_shipping, settings.recommendation_valid_days = shipping, int(days)
            settings.strategic_skus = strategic
            for field, value in priority_values.items():
                setattr(settings, field, value)
            run_action(lambda: service.save_config(settings, reference, operator()))


def recommendations_page():
    service = setup("Recomendações")
    recs = service.latest()
    with st.expander("Filtros", expanded=True):
        a, b = st.columns(2)
        query = a.text_input("Buscar SKU ou produto")
        excluded = b.checkbox("Mostrar excluídos")
        df = pd.DataFrame(recs)
        for index, field in enumerate(["categoria", "marca", "curva_abc", "canal", "acao", "nivel_risco", "status", "regra_aplicada"]):
            if index % 4 == 0:
                columns = st.columns(4)
            label = {"curva_abc": "Curva", "acao": "Ação", "nivel_risco": "Risco", "regra_aplicada": "Regra aplicada"}.get(field, field.capitalize())
            values = columns[index%4].multiselect(label, sorted(df[field].dropna().unique()), key=f"filter_{field}")
            if values:
                recs = [r for r in recs if r.get(field) in values]
        if query:
            recs = [r for r in recs if query.casefold() in f"{r['sku']} {r['produto']}".casefold()]
        if not excluded:
            recs = [r for r in recs if r["acao"] != "EXCLUÍDO"]
    st.caption(f"{len(recs)} combinações no filtro. Margens e variações em percentuais.")
    selected = show_table(recs, selection=True)
    st.download_button("Exportar recomendações filtradas · CSV", csv_bytes(table_frame(recs)), "pet_pricing_recomendacoes.csv", "text/csv")
    choices = selected or recs
    if choices:
        chosen = st.selectbox("Recomendação para análise e decisão", choices, format_func=lambda r: f"{r['sku']} · {r['produto']} · {r['canal']} · {r['acao']}")
        st.info(chosen["justificativa"])
        for alert in chosen.get("alertas", []):
            st.caption(alert)
        decision_controls(service, chosen)
        if st.button("Abrir detalhe do SKU"):
            st.session_state["detail_sku"] = chosen["sku"]
            st.switch_page("pages/2_Detalhe_SKU.py")
    else:
        st.info("Nenhuma combinação corresponde aos filtros.")


def detail_page():
    service = setup("Detalhe do SKU")
    bundle, recs = service.bundle(), service.latest()
    products = bundle.tables["Produtos"].to_dict("records")
    skus = [p["sku"] for p in products]
    names = {p["sku"]: p["produto"] for p in products}
    default = st.session_state.get("detail_sku", skus[0])
    sku = st.selectbox("Produto", skus, index=skus.index(default) if default in skus else 0, format_func=lambda s:f"{s} · {names[s]}")
    records = [r for r in recs if r["sku"] == sku]
    show_table(records)
    rec = st.selectbox("Canal em análise", records, format_func=lambda r:r["canal"])
    facts, signals_tab, rules_tab, history_tab = st.tabs(["Diagnóstico", "Mercado, estoque e vendas", "Regras e explicação", "Decisões e histórico"])
    with facts:
        st.write(next(p for p in products if p["sku"] == sku))
        st.info(rec["justificativa"])
        metrics = ["custo_reposicao", "impostos_estimados", "frete_rateado", "taxa_canal", "custo_total", "margem_atual", "margem_minima_original", "margem_minima_aplicada", "margem_excecao", "margem_alvo_aplicada", "preco_minimo", "preco_alvo", "diferenca_mercado", "margem_projetada"]
        def format_metric(key):
            val = rec.get(key)
            if val is None:
                return "Indisponível"
            if key.startswith("margem") or key in ("taxa_canal", "diferenca_mercado"):
                return f"{float(val):.2%}"
            return brl(val)
        st.dataframe(pd.DataFrame([{"Medida": key.replace("_", " ").capitalize(), "Valor": format_metric(key)} for key in metrics]), hide_index=True, use_container_width=True)
        for alert in rec.get("alertas", []):
            st.warning(alert)
        decision_controls(service, rec, "detail_decision")
    with signals_tab:
        signals = rec.get("sinais_utilizados", {})
        comp = signals.get("concorrencia", {})
        st.subheader("Concorrência")
        st.write(f"Encontrados: {comp.get('encontrados', 0)} · Válidos: {comp.get('quantidade', 0)} · Mediana: {brl(comp.get('mediana'))}")
        st.caption("Frete " + ("incluído por item por configuração explícita." if comp.get("frete_incluido") else "exibido separadamente, sem composição silenciosa do preço."))
        st.dataframe(pd.DataFrame(comp.get("observacoes", [])), hide_index=True, use_container_width=True)
        st.subheader("Estoque e demanda")
        st.write({"Estoque": rec.get("estoque_atual"), "Cobertura (dias)": rec.get("cobertura_dias"), **signals.get("vendas", {})})
        sales = bundle.tables["Vendas_12m"]
        sales = sales[(sales.sku == sku) & (sales.canal == rec["canal"])].copy()
        if not sales.empty:
            chart = px.line(sales, x="mes", y="quantidade", markers=True, color_discrete_sequence=["#8EF05B"], labels={"mes":"Mês", "quantidade":"Unidades vendidas"})
            st.plotly_chart(chart, use_container_width=True)
        with st.form("manual_sale"):
            st.markdown("#### Ajuste auditado da última venda")
            sale_day = st.date_input("Última venda informada manualmente", service.reference(), max_value=service.reference())
            reason = st.text_area("Evidência ou justificativa do ajuste")
            submit = st.form_submit_button("Registrar ajuste")
        if submit:
            run_action(lambda: service.set_last_sale(sku, rec["canal"], sale_day, reason, operator()))
        st.subheader("Promoções")
        st.dataframe(bundle.tables["Promocoes"].query("sku == @sku"), hide_index=True, use_container_width=True)
    with rules_tab:
        st.write("Regra prevalente: " + rec["regra_aplicada"])
        st.json(rec.get("snapshot_regras", {}), expanded=False)
        ai = st.button("Gerar explicação com IA, se configurada")
        explanation = explain(rec, use_ai=ai)
        st.caption(explanation["modo"])
        st.markdown("#### " + explanation["resumo"])
        for factor in explanation["principais_fatores"]:
            st.write(factor)
        st.write(explanation["explicacao_para_analista"])
        if explanation["dados_faltantes"]:
            st.write("Dados faltantes", explanation["dados_faltantes"])
        if ai:
            st.caption("Texto gerado para conferência: os cálculos e bloqueios exibidos no diagnóstico continuam sendo a fonte de verdade.")
    with history_tab:
        st.subheader("Histórico de preços da planilha")
        st.dataframe(bundle.tables["Historico_Precos"].query("sku == @sku"), hide_index=True, use_container_width=True)
        st.subheader("Aplicações locais")
        st.dataframe(pd.DataFrame(service.db.query("SELECT * FROM local_price_history WHERE sku=? ORDER BY id DESC", (sku,))), hide_index=True)
        st.subheader("Decisões humanas")
        st.dataframe(pd.DataFrame(service.db.query("SELECT d.* FROM decisions d JOIN recommendations r ON d.recommendation_id=r.id WHERE r.sku=? ORDER BY d.id DESC", (sku,))), hide_index=True, use_container_width=True)
        st.subheader("Agendamentos")
        st.dataframe(pd.DataFrame(service.db.query("SELECT * FROM scheduled_price_changes WHERE sku=? ORDER BY data_hora_agendada", (sku,))), hide_index=True, use_container_width=True)


def rules_page():
    service = setup("Regras de precificação")
    st.caption("Precedência: exclusão → segurança → SKU → categoria/marca/canal → curva → global → base. Maior prioridade numérica vence dentro do mesmo nível; piso normal mais restritivo permanece protegido.")
    rules = service.db.all("custom_rules")
    rows = product_rows(service.bundle())
    overview = [{"id": r["id"], "Nome": r["nome"], "Situação": validity(r, service.reference()), "Escopo": r["tipo_escopo"],
                 "Valores": ", ".join(scope_values(r)), "Prioridade": r["prioridade"], "SKUs no escopo": len({p["sku"] for p in rows if matches(r,p)}),
                 "Início": r["inicio_vigencia"], "Fim": r["fim_vigencia"]} for r in rules]
    st.dataframe(pd.DataFrame(overview), hide_index=True, use_container_width=True)
    conflicts = [{"SKU":r["sku"], "Canal":r["canal"], "Regra prevalente":r["regra_aplicada"],
                  "Conflitos":"; ".join(r.get("snapshot_regras",{}).get("conflicts",[]))}
                 for r in service.latest() if r.get("snapshot_regras",{}).get("conflicts")]
    with st.expander(f"Conflitos na análise atual ({len(conflicts)} combinações)"):
        if conflicts:
            st.dataframe(pd.DataFrame(conflicts), hide_index=True, use_container_width=True)
        else:
            st.caption("Nenhum conflito irresolúvel identificado na referência atual.")
    with st.expander("12 regras obrigatórias da base"):
        st.dataframe(service.bundle().tables["Regras_Negocio"], hide_index=True, use_container_width=True)
        st.caption("R01–R12 têm verificações determinísticas no motor. Regras novas sem mapeamento bloqueiam aplicação. Configurações podem tornar limites mais restritivos.")
    operations = ["Criar"] + (["Editar", "Duplicar"] if rules else [])
    operation = st.radio("Operação", operations, horizontal=True)
    existing = st.selectbox("Regra de origem", rules, format_func=lambda r:f"#{r['id']} · {r['nome']}") if operation != "Criar" else {}
    rule_id = existing.get("id") if operation == "Editar" else None
    editor_key = f"rule_{operation}_{existing.get('id',0)}"
    def value(field, default):
        return existing.get(field, default)
    scope_labels = {"todos":"Todos os produtos", "curva_abc":"Curva ABC", "categoria":"Categoria", "marca":"Marca", "canal":"Canal", "sku":"SKU específico"}
    scope = st.selectbox("Tipo de escopo", list(scope_labels), index=list(scope_labels).index(value("tipo_escopo", "curva_abc")), format_func=scope_labels.get, key=editor_key+"scope")
    options = sorted({r[scope] for r in rows if r.get(scope) is not None}) if scope != "todos" else []
    initial_values = [v for v in scope_values(existing) if v in options] if existing else []
    selected = st.multiselect("Valores do escopo", options, default=initial_values, key=editor_key+scope)
    with st.form(editor_key):
        name = st.text_input("Nome da regra", value=(value("nome", "") + (" (cópia)" if operation == "Duplicar" else "")))
        description = st.text_area("Descrição", value=value("descricao", ""))
        a,b,c = st.columns(3)
        priority = a.number_input("Prioridade (maior prevalece)", 0, 10000, int(value("prioridade", 10)))
        minimum = b.number_input("Margem mínima (%)", 0.0, 100.0, float(value("margem_minima", .25))*100)
        target = c.number_input("Margem alvo (%)", 0.0, 100.0, float(value("margem_alvo", .30))*100)
        a,b = st.columns(2)
        up = a.number_input("Variação máxima de subida (%)", 0.0, 100.0, float(value("variacao_maxima_subida", .05))*100)
        down = b.number_input("Variação máxima de redução (%)", 0.0, 100.0, float(value("variacao_maxima_reducao", .05))*100)
        st.caption("O teto obrigatório de 5% da base continua prevalecendo se um limite maior for informado.")
        a,b = st.columns(2)
        start = a.date_input("Início de vigência", as_date(value("inicio_vigencia", service.reference())))
        end = b.date_input("Fim de vigência (opcional)", as_date(value("fim_vigencia", None)))
        enabled = st.checkbox("Ativa", value=bool(value("ativa", True)))
        approval = st.checkbox("Exige aprovação humana", value=bool(value("exige_aprovacao", True)))
        exception = st.checkbox("Habilitar exceção para produto sem venda", value=bool(value("condicao_sem_venda_ativa", False)))
        a,b = st.columns(2)
        days = a.number_input("Quantidade de dias sem venda", 1, 3650, int(value("dias_sem_venda", 60)))
        exception_margin = b.number_input("Margem mínima na exceção (%)", 0.0, 100.0, float(value("margem_excecao_sem_venda", .15))*100)
        below = st.checkbox("Autorizar exceção abaixo da margem mínima original", value=bool(value("permite_margem_abaixo_base", False)))
        st.caption("A exceção só será usada com condição comprovada e aprovação humana. Vendas mensais permanecem identificadas como estimativa.")
        justification = st.text_area("Justificativa obrigatória da regra", value=value("justificativa", ""))
        simulate = st.form_submit_button("Simular impacto antes de salvar", type="primary")
    candidate = {"nome":name, "descricao":description, "prioridade":int(priority), "tipo_escopo":scope, "valores_escopo":selected,
        "margem_minima":minimum/100, "margem_alvo":target/100, "variacao_maxima_subida":up/100, "variacao_maxima_reducao":down/100,
        "inicio_vigencia":start.isoformat(), "fim_vigencia":end.isoformat() if end else None, "ativa":enabled, "exige_aprovacao":approval,
        "condicao_sem_venda_ativa":exception, "dias_sem_venda":int(days), "margem_excecao_sem_venda":exception_margin/100,
        "permite_margem_abaixo_base":below, "justificativa":justification}
    preview_key = editor_key+"preview"
    if simulate:
        try:
            preview = service.simulate_rule(candidate, rule_id)
            st.session_state[preview_key] = {"candidate":candidate, "preview":preview, "signature":service.input_signature()}
        except ValueError as exc:
            st.error(str(exc))
            st.session_state.pop(preview_key, None)
    preview_state = st.session_state.get(preview_key)
    if preview_state:
        preview = preview_state["preview"]
        st.subheader("Simulação para conferência")
        st.caption(f"Data simulada: {preview['reference']} · Regra: {preview_state['candidate']['nome']}")
        a,b,c = st.columns(3)
        a.metric("SKUs no escopo", preview["skus"])
        b.metric("Canais no escopo", len(preview["canais"]))
        c.metric("Novos casos com aprovação", preview["aprovacoes"])
        st.write("Canais: " + ", ".join(preview["canais"]))
        if preview["conflitos"]:
            st.warning("Sobreposição potencial de escopo/vigência: " + ", ".join(preview["conflitos"]))
        st.dataframe(pd.DataFrame(preview["comparacao"]), hide_index=True, use_container_width=True)
        st.caption("Salvar usa exatamente os valores simulados. Após alterar o formulário, simule novamente.")
        if st.button("Salvar regra simulada", type="primary", disabled=preview_state["signature"] != service.input_signature()):
            def save_simulated_rule():
                service.save_rule(preview_state["candidate"], operator(), rule_id)
                st.session_state.pop(preview_key, None)
            run_action(save_simulated_rule)
    if operation == "Editar" and existing.get("ativa") and st.button("Inativar esta regra"):
        run_action(lambda: service.deactivate_rule(rule_id, operator()))


def exclusions_page():
    service = setup("Exclusões de produtos")
    st.write("A exclusão usa o código SKU e vale para todos os canais. O histórico permanece disponível.")
    products = service.bundle().tables["Produtos"]
    search = st.text_input("Buscar código ou nome")
    matched = products[products.sku.str.contains(search, case=False, regex=False) | products.produto.str.contains(search, case=False, regex=False)]
    names = dict(zip(products.sku, products.produto))
    with st.form("exclude"):
        skus = st.multiselect("SKUs para excluir", matched.sku.tolist(), format_func=lambda s:f"{s} · {names[s]}")
        reason = st.text_area("Motivo da exclusão")
        a,b = st.columns(2)
        start = a.date_input("Início da exclusão", service.reference())
        end = b.date_input("Fim da exclusão (opcional)", None)
        submit = st.form_submit_button("Registrar exclusão", type="primary")
    if submit:
        run_action(lambda: service.exclude(skus, reason, start, end, operator()))
    exclusions = service.db.all("sku_exclusions")
    st.subheader("Exclusões cadastradas")
    status = st.multiselect("Situação da exclusão", ["Vigente", "Futura", "Expirada", "Inativa"])
    display = [{**r, "situação":validity(r,service.reference()), "produto":names.get(r["sku"])} for r in exclusions]
    st.dataframe(pd.DataFrame([r for r in display if not status or r["situação"] in status]), hide_index=True, use_container_width=True)
    active = [r for r in exclusions if validity(r,service.reference()) in ("Vigente", "Futura")]
    if active:
        selected = st.selectbox("Exclusão para encerrar", active, format_func=lambda r:f"#{r['id']} · {r['sku']} · {r['motivo']}")
        if st.button("Encerrar exclusão e reativar SKU"):
            run_action(lambda: service.end_exclusion(selected["id"], operator()))


def schedules_page():
    service = setup("Agendamentos de preço")
    scheduler = SchedulerService(service)
    st.info("Aplicado no protótipo significa registro no SQLite local. Nenhum preço é enviado ao ERP, e-commerce ou marketplace.")
    st.caption(f"Relógio real: {now():%d/%m/%Y %H:%M} · America/Sao_Paulo. Recomendações históricas precisam de referência atualizada antes de agendar para hoje.")
    approved = [r for r in service.latest() if r["status"] == "Aprovado"]
    if approved:
        default = st.session_state.get("schedule_rec")
        chosen = st.selectbox("Recomendação aprovada (SKU / canal)", approved,
            index=next((i for i,r in enumerate(approved) if r["id"] == default), 0),
            format_func=lambda r:f"{r['sku']} · {r['produto']} · {r['canal']}")
        decisions = service.db.query("SELECT * FROM decisions WHERE recommendation_id=? ORDER BY id DESC LIMIT 1", (chosen["id"],))
        price_approved = decisions[0]["preco_aprovado"]
        st.write(f"Preço aprovado: {brl(price_approved)} · Regra: {chosen['regra_aplicada']} · Válido até {chosen['valid_until']}")
        with st.form("schedule"):
            price = st.number_input("Preço a agendar", min_value=.01, value=float(price_approved), step=.01, format="%.2f")
            a,b = st.columns(2)
            day = a.date_input("Data agendada", now().date()+timedelta(days=1), min_value=now().date())
            hour = b.time_input("Hora agendada", datetime.strptime("09:00", "%H:%M").time())
            a,b = st.columns(2)
            valid_day = a.date_input("Validade até (data)", now().date()+timedelta(days=2))
            valid_hour = b.time_input("Validade até (hora)", datetime.strptime("18:00", "%H:%M").time())
            reason = st.text_area("Justificativa e riscos revisados")
            confirm_edit = st.checkbox("Aprovo explicitamente o preço editado acima, se diferente do preço já aprovado")
            preview_button = st.form_submit_button("Validar e visualizar margem")
            submit = st.form_submit_button("Agendar aplicação local", type="primary")
        when = datetime.combine(day,hour,TZ)
        valid_until = datetime.combine(valid_day,valid_hour,TZ)
        if preview_button:
            try:
                preview = scheduler.preview(chosen["id"],price,when)
                st.success(f"Margem projetada: {preview['margem']:.2%} · Regra: {preview['regra']}")
                st.write(preview["alertas"])
            except ValueError as exc:
                st.error(str(exc))
        if submit:
            def save_schedule():
                if price != price_approved:
                    if not confirm_edit:
                        raise ValueError("Aprove explicitamente a edição antes de agendar.")
                    service.decide(chosen["id"], "Editar e aprovar", operator(), reason, price)
                scheduler.schedule(chosen["id"], price, when, valid_until, reason, operator())
            run_action(save_schedule)
    else:
        st.info("Aprove uma recomendação na página Recomendações para criar um agendamento.")
        st.page_link("pages/1_Recomendacoes.py", label="Abrir recomendações")
    st.subheader("Próximos agendamentos e histórico")
    statuses = st.multiselect("Filtrar status", SCHEDULE_STATUSES)
    schedules = service.db.query("SELECT * FROM scheduled_price_changes ORDER BY data_hora_agendada,id")
    visible = [s for s in schedules if not statuses or s["status"] in statuses]
    st.dataframe(pd.DataFrame(visible), hide_index=True, use_container_width=True)
    active = [s for s in schedules if s["status"] in ("Agendado", "Rascunho", "Pendente de aprovação")]
    if active:
        cancel = st.selectbox("Agendamento para cancelar", active, format_func=lambda s:f"#{s['id']} · {s['sku']} · {s['canal']} · {s['data_hora_agendada']}")
        reason = st.text_input("Motivo do cancelamento")
        if st.button("Cancelar agendamento"):
            run_action(lambda: scheduler.cancel(cancel["id"],operator(),reason))
    with st.expander("Administração local"):
        st.caption("Revalida cada alteração vencida; expira ou bloqueia agendamentos inválidos. Executar novamente não duplica aplicações.")
        if st.button("Executar agendamentos vencidos no protótipo", type="primary"):
            run_action(lambda: scheduler.execute_due(operator()))


def audit_page():
    service = setup("Auditoria e feedback")
    rows = timeline(service.db)
    entities = sorted({r["entidade"] for r in rows})
    a,b = st.columns(2)
    entity = a.multiselect("Entidade", entities)
    query = b.text_input("Buscar SKU, responsável ou ação")
    filtered = [r for r in rows if (not entity or r["entidade"] in entity) and (not query or query.casefold() in dumps(r).casefold())]
    st.caption(f"{len(filtered)} eventos. Histórico persistido sem exclusão física.")
    st.dataframe(pd.DataFrame(filtered), hide_index=True, use_container_width=True)
    st.download_button("Exportar trilha filtrada · CSV", csv_bytes(pd.DataFrame(filtered)), "pet_pricing_auditoria.csv", "text/csv")
    for row in filtered[:30]:
        with st.expander(f"{row['data_hora']} · {row['acao']} · {row['entidade']} #{row['entidade_id']} · {row['usuario']}"):
            a,b = st.columns(2)
            a.write("Antes")
            a.json(json.loads(row["valor_anterior"] or "null"), expanded=False)
            b.write("Depois")
            b.json(json.loads(row["valor_novo"] or "null"), expanded=False)
