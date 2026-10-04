"""Read-only Excel ingestion. Ambiguous keys fail; incomplete records stay visible."""
from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import pandas as pd

from .models import DataBundle
from .utils import missing, normalize

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "Produtos": ["sku", "produto", "categoria", "marca", "curva_abc", "status"],
    "Precos_Atuais": ["sku", "canal", "preco_atual", "data_referencia"],
    "Custos_Margens": ["sku", "canal", "custo_reposicao", "impostos_estimados", "frete_rateado", "taxa_canal", "margem_minima", "margem_alvo", "custo_total_referencia"],
    "Vendas_12m": ["sku", "canal", "mes", "quantidade"],
    "Estoque": ["sku", "estoque_atual", "cobertura_dias"],
    "Concorrencia": ["sku", "concorrente", "correspondencia", "preco", "disponivel", "frete", "data_hora_coleta", "confiabilidade_matching"],
    "Historico_Precos": ["sku", "data", "preco"],
    "Promocoes": ["sku", "inicio", "fim"],
    "Regras_Negocio": ["id", "tema", "regra_ficticia", "acao_esperada", "criticidade"],
    "Dicionario_Dados": ["aba", "campo"],
    "Indicadores_Atuais": ["indicador"],
}
NUMERIC = {"preco_atual", "custo_reposicao", "impostos_estimados", "frete_rateado", "taxa_canal", "margem_minima", "margem_alvo", "custo_total_referencia", "quantidade", "receita", "preco_medio", "desconto_medio", "estoque_atual", "cobertura_dias", "pedido_compra_aberto", "preco", "frete", "desconto", "venda_media_dia"}
PERCENT = {"taxa_canal", "margem_minima", "margem_alvo", "desconto", "desconto_medio"}
DATES = {"data_referencia", "previsao_recebimento", "data_hora_coleta", "data", "inicio", "fim", "ultima_venda", "data_ultima_venda", "data_venda"}
ALIASES = {"cobertura_dias": "cobertura_dias", "data_da_ultima_venda": "data_ultima_venda", "curva": "curva_abc", "custo_total": "custo_total_referencia"}


def locate_excel(root=ROOT):
    candidates = [p for p in Path(root).glob("*.xlsx") if not p.name.startswith("~$")]
    preferred = [p for p in candidates if "popular" in normalize(p.stem)]
    candidates = preferred or candidates
    if len(candidates) != 1:
        raise ValueError("Mantenha um único Excel da Popular Pet na raiz ou importe pela interface.")
    return candidates[0]


def number(value, percentage=False):
    if missing(value):
        return None
    is_percent = isinstance(value, str) and "%" in value
    if isinstance(value, str):
        value = value.replace("R$", "").replace("%", "").replace(" ", "").strip()
        if "," in value:
            value = value.replace(".", "").replace(",", ".")
    try:
        result = float(value)
        if is_percent or (percentage and result > 1):
            result /= 100
        return result if pd.notna(result) and abs(result) != float("inf") else None
    except (ValueError, TypeError):
        return None


def parse_date(value):
    if missing(value):
        return pd.NaT
    if isinstance(value, (float, int)):
        return pd.to_datetime(value, unit="D", origin="1899-12-30", errors="coerce")
    if isinstance(value, str):
        return pd.to_datetime(value, dayfirst=("/" in value), errors="coerce")
    return pd.to_datetime(value, errors="coerce")


def load_excel(source=None, filename=None):
    source = locate_excel() if source is None else source
    if isinstance(source, (str, Path)):
        path = Path(source)
        raw, filename = path.read_bytes(), path.name
    else:
        raw = source if isinstance(source, bytes) else source.getvalue()
        filename = filename or getattr(source, "name", "importacao.xlsx")
    if Path(filename).suffix.lower() != ".xlsx" or len(raw) > 20 * 1024 * 1024:
        raise ValueError("Envie um arquivo .xlsx de até 20 MB.")
    try:
        with ZipFile(BytesIO(raw)) as z:
            if sum(i.file_size for i in z.infolist()) > 150 * 1024 * 1024:
                raise ValueError("Planilha excede o limite de conteúdo descompactado.")
        workbook = pd.ExcelFile(BytesIO(raw), engine="openpyxl")
    except (BadZipFile, OSError, KeyError, ValueError) as exc:
        raise ValueError("Arquivo Excel inválido ou corrompido.") from exc
    absent = set(REQUIRED) - set(workbook.sheet_names)
    if absent:
        raise ValueError("Abas ausentes: " + ", ".join(sorted(absent)))
    tables, issues, headers = {}, [], {}
    for name, fields in REQUIRED.items():
        raw_df = pd.read_excel(workbook, sheet_name=name, header=None, dtype=object)
        header = None
        for idx, row in raw_df.head(20).iterrows():
            normalized = {ALIASES.get(normalize(v), normalize(v)) for v in row if not missing(v)}
            if set(fields).issubset(normalized):
                header = idx
                break
        if header is None:
            raise ValueError(f"{name}: cabeçalho não encontrado. Campos necessários: {', '.join(fields)}")
        headers[name] = int(header) + 1
        columns = [ALIASES.get(normalize(v), normalize(v)) if not missing(v) else f"vazia_{i}" for i, v in enumerate(raw_df.iloc[header])]
        if len(columns) != len(set(columns)):
            raise ValueError(f"{name}: colunas duplicadas no cabeçalho.")
        frame = raw_df.iloc[header + 1:].copy()
        frame.columns = columns
        frame = frame.dropna(how="all").reset_index(drop=True)
        frame = frame[[c for c in columns if not c.startswith("vazia_")]]
        for col in frame:
            if col == "sku":
                frame[col] = frame[col].map(lambda v: None if missing(v) else str(v).strip())
            elif col == "canal":
                channels = {"loja_fisica": "Loja física", "e_commerce": "E-commerce", "ecommerce": "E-commerce", "marketplace": "Marketplace"}
                frame[col] = frame[col].map(lambda v: None if missing(v) else channels.get(normalize(v), str(v).strip()))
            elif col == "curva_abc":
                frame[col] = frame[col].map(lambda v: None if missing(v) else str(v).strip().upper().replace("CURVA ", ""))
            elif col in NUMERIC:
                frame[col] = frame[col].map(lambda v: number(v, col in PERCENT))
            elif col in DATES:
                frame[col] = frame[col].map(parse_date)
            elif col == "mes":
                frame[col] = pd.to_datetime(frame[col], format="%Y-%m", errors="coerce")
        for col in fields:
            count = int(frame[col].isna().sum())
            if count:
                issues.append({"aba": name, "campo": col, "tipo": "Ausente ou inválido", "quantidade": count})
        for col in NUMERIC.intersection(frame.columns):
            invalid = (frame[col] < 0) | ((frame[col] > 1) if col in PERCENT else False)
            if invalid.any():
                issues.append({"aba": name, "campo": col, "tipo": "Valor fora do intervalo permitido", "quantidade": int(invalid.sum())})
        if "sku" in frame and frame.sku.isna().any():
            raise ValueError(f"{name}: SKU ausente; não é possível relacionar o registro.")
        keys = {"Produtos": ["sku"], "Precos_Atuais": ["sku", "canal"], "Custos_Margens": ["sku", "canal"], "Estoque": ["sku"], "Vendas_12m": ["sku", "canal", "mes"], "Regras_Negocio": ["id"]}.get(name)
        if keys and frame.duplicated(keys).any():
            raise ValueError(f"{name}: chaves duplicadas em {', '.join(keys)}. Corrija a origem antes de importar.")
        tables[name] = frame
    known = set(tables["Produtos"].sku)
    if not known or tables["Precos_Atuais"].empty:
        raise ValueError("A base precisa conter produtos e preços.")
    for name, frame in tables.items():
        if "sku" in frame and (set(frame.sku) - known):
            raise ValueError(f"{name}: SKU sem cadastro em Produtos.")
    costs = tables["Custos_Margens"]
    for _, row in costs.iterrows():
        components = row[["custo_reposicao", "impostos_estimados", "frete_rateado"]]
        if components.notna().all() and pd.notna(row.custo_total_referencia) and abs(components.sum() - row.custo_total_referencia) > .011:
            issues.append({"aba": "Custos_Margens", "sku": row.sku, "canal": row.canal, "tipo": "Custo total difere da soma; REVISAR"})
    ref = tables["Precos_Atuais"].data_referencia.max()
    if pd.isna(ref):
        raise ValueError("Não há data de referência válida em Precos_Atuais.")
    issues.extend([
        {"tipo": "Hipótese", "detalhe": "Referência de coleta: fim do dia da análise, America/Sao_Paulo."},
        {"tipo": "Limitação", "detalhe": "Vendas mensais não comprovam dias exatos sem venda; exceções requerem evidência diária ou ajuste manual auditado."},
        {"tipo": "Hipótese", "detalhe": "Concorrência sem canal é compartilhada entre canais. Frete fica separado por padrão."},
        {"tipo": "Limitação", "detalhe": "Sem indicador estratégico dedicado: status estratégico e lista configurada são considerados. Histórico de concorrência insuficiente não comprova ausência de anomalia."},
    ])
    return DataBundle(tables, ref.date(), filename, hashlib.sha256(raw).hexdigest(), issues, headers)
