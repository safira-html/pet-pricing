from __future__ import annotations

import logging
import os

import pandas as pd
import streamlit as st
from dotenv import load_dotenv

from .data_loader import ROOT
from .database import Database
from .recommendation_service import RecommendationService
from .utils import brl

load_dotenv(ROOT / ".env")

CSS = """
<style>
.block-container {padding-top:2rem;max-width:1550px;}
h1 {letter-spacing:-.04em;font-weight:750;}
h2,h3 {letter-spacing:-.02em;}
[data-testid="stMetric"] {background:#17212C;border:1px solid #293743;border-radius:12px;padding:18px;}
[data-testid="stMetricLabel"] {color:#A7B7C6;}
[data-testid="stMetricValue"] {color:#8EF05B;}
[data-testid="stSidebar"] {border-right:1px solid #293743;}
div.stButton > button[kind="primary"] {color:#0C1117;font-weight:650;}
.eyebrow {color:#8EF05B;font-size:.8rem;letter-spacing:.13em;font-weight:700;}
</style>
"""


def setup(title):
    st.set_page_config(page_title=f"{title} · Pet Pricing", page_icon="🐾", layout="wide")
    st.markdown(CSS, unsafe_allow_html=True)
    st.markdown('<div class="eyebrow">GRUPO 12 · ITA CHALLENGE SPRINT · DESAFIO 04</div>', unsafe_allow_html=True)
    st.title(title)
    st.caption("Popular Pet · Dados fictícios · Aplicações de preço acontecem somente no ambiente local.")
    with st.sidebar:
        st.markdown("### Pet Pricing")
        st.caption("Copiloto Inteligente de Precificação")
        st.text_input("Responsável pelas decisões", value="Analista Grupo 12", key="operator")
    try:
        service = RecommendationService(Database())
        if not service.db.all("imports"):
            with st.spinner("Validando e importando a planilha local…"):
                service.import_excel(user=operator())
        service.generate(user=operator())
    except ValueError as exc:
        st.error(str(exc))
        upload = st.file_uploader("Importar base .xlsx", type=["xlsx"])
        if upload and st.button("Validar e importar", type="primary"):
            run_action(lambda: RecommendationService(Database()).import_excel(upload, user=operator()))
        st.stop()
    except Exception:
        logging.exception("Falha de inicialização local")
        st.error("Não foi possível iniciar a base local. Verifique as permissões da pasta data e as dependências.")
        st.stop()
    with st.sidebar:
        st.divider()
        st.caption(f"Referência: {service.reference():%d/%m/%Y}")
        st.caption("Fuso: America/Sao_Paulo")
        st.caption("IA opcional disponível sob demanda" if os.getenv("OPENAI_API_KEY") else "Modo de contingência ativo · explicação determinística")
        if st.button("Recalcular recomendações", use_container_width=True):
            run_action(lambda: service.generate(operator(), force=True))
        st.page_link("app.py", label="Dashboard e configurações")
    if st.session_state.pop("flash", None):
        st.success("Operação registrada com sucesso na auditoria.")
    return service


def operator():
    return st.session_state.get("operator", "Analista Grupo 12").strip()


def run_action(callback):
    try:
        callback()
    except ValueError as exc:
        st.error(str(exc))
        return False
    except Exception:
        logging.exception("Falha em operação local")
        st.error("Não foi possível concluir a operação. Os dados anteriores foram preservados; verifique a configuração local.")
        return False
    st.session_state["flash"] = True
    st.rerun()


LABELS = {"sku": "SKU", "produto": "Produto", "curva_abc": "Curva", "canal": "Canal", "categoria": "Categoria", "marca": "Marca",
    "preco_atual": "Preço atual", "preco_mercado": "Mercado", "custo_total": "Custo", "margem_atual": "Margem atual (%)",
    "margem_minima_aplicada": "Margem mínima (%)", "preco_sugerido": "Preço sugerido", "margem_projetada": "Margem projetada (%)",
    "variacao_percentual": "Variação (%)", "acao": "Ação", "nivel_risco": "Risco", "prioridade": "Prioridade", "status": "Status", "regra_aplicada": "Regra"}
MONEY = ["preco_atual", "preco_mercado", "custo_total", "preco_sugerido"]
PERCENTAGES = ["margem_atual", "margem_minima_aplicada", "margem_projetada", "variacao_percentual"]


def table_frame(recs):
    df = pd.DataFrame(recs)
    if df.empty:
        return df
    for col in MONEY + PERCENTAGES:
        df[col] = pd.to_numeric(df.get(col), errors="coerce")
    df[PERCENTAGES] = df[PERCENTAGES] * 100
    return df.reindex(columns=list(LABELS)).rename(columns=LABELS)


def show_table(recs, selection=False, key="recommendation_table"):
    df = table_frame(recs)
    config = {LABELS[k]: st.column_config.NumberColumn(format="R$ %.2f") for k in MONEY}
    config.update({LABELS[k]: st.column_config.NumberColumn(format="%.2f%%") for k in PERCENTAGES})
    if selection and not df.empty:
        df.insert(0, "Selecionar", False)
        edited = st.data_editor(df, hide_index=True, use_container_width=True, key=key,
                                disabled=list(LABELS.values()), column_config=config)
        return [recs[i] for i, value in enumerate(edited.Selecionar) if value]
    st.dataframe(df, hide_index=True, use_container_width=True, column_config=config)
    return []


def csv_bytes(df):
    safe = df.copy()
    for col in safe.select_dtypes(include=["object", "string"]).columns:
        safe[col] = safe[col].map(lambda v: "'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@", "\t", "\r")) else v)
    return safe.to_csv(index=False, sep=";", decimal=",").encode("utf-8-sig")


def decision_controls(service, rec, key="decision"):
    if rec["acao"] == "EXCLUÍDO":
        st.info("SKU excluído: encerre a exclusão para voltar a analisar preços.")
        return
    st.subheader("Decisão humana")
    st.caption("A aprovação fica registrada. A aplicação local exige um agendamento aprovado.")
    if rec.get("bloqueios"):
        st.error("Bloqueios: " + " · ".join(rec["bloqueios"]))
    with st.form(f"{key}_{rec['id']}"):
        decision = st.selectbox("Ação do analista", ["Aprovar", "Editar e aprovar", "Rejeitar", "Enviar para revisão"])
        price = st.number_input("Preço editado (usado em Editar e aprovar)", min_value=0.01,
                                value=float(rec.get("preco_sugerido") or rec.get("preco_atual") or 0.01), step=.01, format="%.2f")
        reason = st.text_area("Justificativa humana", help="Obrigatória em edição, rejeição, revisão e aprovação com riscos.")
        submit = st.form_submit_button("Registrar decisão", type="primary")
    if submit:
        run_action(lambda: service.decide(rec["id"], decision, operator(), reason, price))
    if st.button("Agendar esta recomendação", key=f"schedule_link_{key}"):
        st.session_state["schedule_rec"] = rec["id"]
        st.switch_page("pages/5_Agendamentos.py")
