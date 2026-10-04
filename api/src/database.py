from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .data_loader import ROOT
from .utils import dumps, timestamp

SCHEMA = """
CREATE TABLE IF NOT EXISTS imports (
 id INTEGER PRIMARY KEY, source_name TEXT NOT NULL, source_hash TEXT NOT NULL,
 reference TEXT NOT NULL, payload TEXT NOT NULL, issues TEXT NOT NULL, headers TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS custom_rules (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT NOT NULL, ativa INTEGER NOT NULL,
 prioridade INTEGER NOT NULL, tipo_escopo TEXT NOT NULL, valores_escopo TEXT NOT NULL,
 margem_minima REAL NOT NULL, margem_alvo REAL NOT NULL, variacao_maxima_subida REAL NOT NULL,
 variacao_maxima_reducao REAL NOT NULL, condicao_sem_venda_ativa INTEGER NOT NULL,
 dias_sem_venda INTEGER NOT NULL, margem_excecao_sem_venda REAL NOT NULL,
 permite_margem_abaixo_base INTEGER NOT NULL, exige_aprovacao INTEGER NOT NULL,
 justificativa TEXT NOT NULL, inicio_vigencia TEXT NOT NULL, fim_vigencia TEXT,
 criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, criado_por TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sku_exclusions (
 id INTEGER PRIMARY KEY, sku TEXT NOT NULL, motivo TEXT NOT NULL, inicio_vigencia TEXT NOT NULL,
 fim_vigencia TEXT, ativa INTEGER NOT NULL, criado_em TEXT NOT NULL, criado_por TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS executions (
 id INTEGER PRIMARY KEY, import_id INTEGER NOT NULL REFERENCES imports(id), reference TEXT NOT NULL,
 signature TEXT NOT NULL, config TEXT NOT NULL, criado_em TEXT NOT NULL, criado_por TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recommendations (
 id INTEGER PRIMARY KEY, execution_id INTEGER NOT NULL REFERENCES executions(id), sku TEXT NOT NULL,
 canal TEXT NOT NULL, preco_atual REAL, preco_mercado REAL, custo_total REAL, margem_atual REAL,
 margem_minima_aplicada REAL, margem_alvo_aplicada REAL, preco_sugerido REAL, margem_projetada REAL,
 variacao_percentual REAL, acao TEXT NOT NULL, nivel_risco TEXT NOT NULL, prioridade INTEGER NOT NULL,
 justificativa TEXT NOT NULL, sinais_utilizados TEXT NOT NULL, alertas TEXT NOT NULL,
 regra_aplicada TEXT NOT NULL, snapshot_regras TEXT NOT NULL, status TEXT NOT NULL,
 criado_em TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(execution_id, sku, canal)
);
CREATE TABLE IF NOT EXISTS decisions (
 id INTEGER PRIMARY KEY, recommendation_id INTEGER NOT NULL REFERENCES recommendations(id),
 decisao TEXT NOT NULL, preco_original_sugerido REAL, preco_aprovado REAL, justificativa_humana TEXT NOT NULL,
 decidido_por TEXT NOT NULL, decidido_em TEXT NOT NULL, snapshot_regras TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scheduled_price_changes (
 id INTEGER PRIMARY KEY, recommendation_id INTEGER NOT NULL REFERENCES recommendations(id), decision_id INTEGER NOT NULL REFERENCES decisions(id),
 sku TEXT NOT NULL, canal TEXT NOT NULL, preco_atual REAL NOT NULL, preco_agendado REAL NOT NULL,
 data_hora_agendada TEXT NOT NULL, validade_agendamento TEXT NOT NULL, status TEXT NOT NULL,
 justificativa TEXT NOT NULL, exige_aprovacao INTEGER NOT NULL, aprovado_por TEXT NOT NULL,
 aprovado_em TEXT NOT NULL, criado_em TEXT NOT NULL, cancelado_em TEXT, snapshot TEXT NOT NULL,
 falha TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_price ON scheduled_price_changes(sku,canal)
 WHERE status IN ('Agendado','Pendente de aprovação','Rascunho');
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY, entidade TEXT NOT NULL, entidade_id TEXT NOT NULL, acao TEXT NOT NULL,
 valor_anterior TEXT, valor_novo TEXT, usuario TEXT NOT NULL, data_hora TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS manual_sales (
 id INTEGER PRIMARY KEY, sku TEXT NOT NULL, canal TEXT NOT NULL, ultima_venda TEXT NOT NULL,
 justificativa TEXT NOT NULL, criado_por TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_price_history (
 id INTEGER PRIMARY KEY, schedule_id INTEGER UNIQUE NOT NULL REFERENCES scheduled_price_changes(id),
 sku TEXT NOT NULL, canal TEXT NOT NULL, preco_anterior REAL NOT NULL, preco REAL NOT NULL,
 aplicado_em TEXT NOT NULL, usuario TEXT NOT NULL
);
"""
TABLES = {"imports", "custom_rules", "sku_exclusions", "executions", "recommendations", "decisions", "scheduled_price_changes", "audit_log", "manual_sales", "local_price_history"}


class Database:
    def __init__(self, path=None):
        path = Path(path or os.getenv("PET_PRICING_DB", "data/pet_pricing.db"))
        self.path = path if path.is_absolute() else ROOT / path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("PRAGMA journal_mode=WAL")
        try:
            yield con
            con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()

    @contextmanager
    def transaction(self):
        with self.connect() as con:
            con.execute("BEGIN IMMEDIATE")
            yield con

    def query(self, sql, params=(), con=None):
        if con is not None:
            return [dict(r) for r in con.execute(sql, params).fetchall()]
        with self.connect() as connection:
            return self.query(sql, params, connection)

    def all(self, table, con=None):
        self._table(table)
        return self.query(f'SELECT * FROM "{table}" ORDER BY id', con=con)

    def get(self, table, item_id, con=None):
        self._table(table)
        rows = self.query(f'SELECT * FROM "{table}" WHERE id=?', (item_id,), con)
        if not rows:
            raise ValueError("Registro não encontrado.")
        return rows[0]

    def _table(self, table):
        if table not in TABLES:
            raise ValueError("Tabela não autorizada.")

    def insert(self, table, values, con):
        self._table(table)
        columns = {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
        if not set(values) <= columns:
            raise ValueError("Campos de persistência inválidos.")
        names = ",".join(f'"{k}"' for k in values)
        placeholders = ",".join("?" for _ in values)
        return con.execute(f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})', tuple(values.values())).lastrowid

    def update(self, table, item_id, values, con):
        self._table(table)
        columns = {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
        if not set(values) <= columns:
            raise ValueError("Campos de persistência inválidos.")
        assignments = ",".join(f'"{k}"=?' for k in values)
        con.execute(f'UPDATE "{table}" SET {assignments} WHERE id=?', (*values.values(), item_id))

    def audit(self, entity, item_id, action, before, after, user, con):
        if not str(user).strip():
            raise ValueError("Informe o responsável.")
        self.insert("audit_log", {"entidade": entity, "entidade_id": str(item_id), "acao": action,
                    "valor_anterior": dumps(before), "valor_novo": dumps(after), "usuario": user.strip(), "data_hora": timestamp()}, con)

    def setting(self, key, default=None, con=None):
        rows = self.query("SELECT value FROM settings WHERE key=?", (key,), con)
        return json.loads(rows[0]["value"]) if rows else default

    def set_setting(self, key, value, user, con):
        previous = self.setting(key, con=con)
        con.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, dumps(value)))
        self.audit("configuracao", key, "Atualizar", previous, value, user, con)
