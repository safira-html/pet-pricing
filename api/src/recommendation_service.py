from __future__ import annotations

import json
from datetime import date, timedelta

import pandas as pd

from .data_loader import load_excel
from .models import DataBundle, Settings
from .pricing_engine import margin, recommend
from .rule_engine import matches, resolve_rules, validate_rule
from .signals import competition_signal, other_signals, product_rows, sales_signal
from .utils import D, active_on, as_date, clean, dumps, fingerprint, missing, money, timestamp

BASE_RULE_IDS = {f"R{i:02}" for i in range(1, 13)}
ENGINE_VERSION = "1.0.0"


class RecommendationService:
    def __init__(self, db):
        self.db = db

    def import_excel(self, source=None, filename=None, user="Analista"):
        bundle = load_excel(source, filename)
        with self.db.transaction() as con:
            item_id = self.db.insert("imports", {"source_name": bundle.source_name, "source_hash": bundle.source_hash,
                "reference": bundle.reference.isoformat(), "payload": dumps({k: v.to_dict("records") for k,v in bundle.tables.items()}),
                "issues": dumps(bundle.issues), "headers": dumps(bundle.headers), "criado_em": timestamp()}, con)
            self.db.set_setting("reference", bundle.reference.isoformat(), user, con)
            self.db.audit("importacao", item_id, "Importar", None, {"arquivo": bundle.source_name, "sha256": bundle.source_hash,
                "referencia": bundle.reference, "linhas": {k: len(v) for k,v in bundle.tables.items()}, "avisos": bundle.issues}, user, con)
        bundle.import_id = item_id
        return bundle

    def bundle(self, con=None):
        rows = self.db.query("SELECT * FROM imports ORDER BY id DESC LIMIT 1", con=con)
        if not rows:
            raise ValueError("Importe a planilha para começar.")
        row = rows[0]
        payload = json.loads(row["payload"])
        # Preserve the schema of empty optional sheets after SQLite roundtrip.
        from .data_loader import REQUIRED
        tables = {k: pd.DataFrame(v) if v else pd.DataFrame(columns=REQUIRED[k]) for k,v in payload.items()}
        return DataBundle(tables, as_date(row["reference"]), row["source_name"], row["source_hash"],
                          json.loads(row["issues"]), json.loads(row["headers"]), row["id"])

    def config(self, con=None):
        return Settings(**self.db.setting("pricing", {}, con)).validate()

    def reference(self, con=None):
        return as_date(self.db.setting("reference", self.bundle(con).reference.isoformat(), con))

    def save_config(self, settings, reference, user):
        settings.validate()
        with self.db.transaction() as con:
            self.db.set_setting("pricing", settings.dict(), user, con)
            self.db.set_setting("reference", as_date(reference).isoformat(), user, con)

    def input_signature(self, con=None):
        return fingerprint({"engine_version": ENGINE_VERSION, "import": self.bundle(con).import_id, "reference": self.reference(con), "config": self.config(con).dict(),
            "rules": self.db.all("custom_rules", con), "exclusions": self.db.all("sku_exclusions", con),
            "sales": self.db.all("manual_sales", con), "prices": self.db.all("local_price_history", con)})

    def analyze(self, reference=None, rules=None, con=None):
        bundle, config = self.bundle(con), self.config(con)
        ref = as_date(reference) if reference else self.reference(con)
        rules = self.db.all("custom_rules", con) if rules is None else rules
        exclusions = self.db.all("sku_exclusions", con)
        history = self.db.all("local_price_history", con)
        overrides = self.db.all("manual_sales", con)
        result = []
        rows = product_rows(bundle, history, ref)
        missing_base_rules = BASE_RULE_IDS - set(bundle.tables["Regras_Negocio"].id)
        for row in rows:
            base = {**row, "acao": "REVISAR", "status": "Pendente de análise", "nivel_risco": "Alto", "prioridade": 100,
                    "preco_sugerido": None, "preco_mercado": None, "margem_atual": None, "margem_projetada": None,
                    "variacao_percentual": None, "custo_total": row.get("custo_total_referencia"), "margem_minima_aplicada": row.get("margem_minima"),
                    "margem_alvo_aplicada": row.get("margem_alvo"), "regra_aplicada": "Bloqueio de segurança", "snapshot_regras": {},
                    "sinais_utilizados": {}, "alertas": [], "bloqueios": [], "exige_aprovacao": True, "excecao_utilizada": False}
            excluded = [e for e in exclusions if e["sku"] == row["sku"] and active_on(e, ref)]
            if excluded:
                base.update(acao="EXCLUÍDO", status="EXCLUÍDO", justificativa="Exclusão vigente por SKU: " + "; ".join(e["motivo"] for e in excluded), exclusoes=excluded)
                result.append(base)
                continue
            try:
                essentials = ["preco_atual", "data_referencia", "custo_total_referencia", "taxa_canal", "margem_minima", "margem_alvo", "custo_reposicao", "impostos_estimados", "frete_rateado"]
                absent = [key for key in essentials if missing(row.get(key))]
                if absent:
                    raise ValueError("Dados essenciais ausentes: " + ", ".join(absent))
                if as_date(row["data_referencia"]) > ref:
                    raise ValueError("Preço de origem posterior à data de referência.")
                for key in ("custo_reposicao", "impostos_estimados", "frete_rateado", "custo_total_referencia"):
                    if D(row[key]) < 0:
                        raise ValueError("Custo, impostos ou frete negativos.")
                if any(not 0 <= D(row[key]) < 1 for key in ("taxa_canal", "margem_minima", "margem_alvo")):
                    raise ValueError("Margem/taxa inválida na base.")
                if D(row["margem_alvo"]) < D(row["margem_minima"]):
                    raise ValueError("Margem alvo da base abaixo da mínima.")
                if abs(sum(D(row[k]) for k in ("custo_reposicao", "impostos_estimados", "frete_rateado"))-D(row["custo_total_referencia"])) > D("0.011"):
                    raise ValueError("Custo total inconsistente com reposição + impostos + frete.")
                sales = sales_signal(bundle, row["sku"], row["canal"], ref, overrides)
                rule = resolve_rules(row, rules, ref, sales, config)
                rule["regras_base"] = clean(bundle.tables["Regras_Negocio"].to_dict("records"))
                rule["parametros"] = config.dict()
                comp = competition_signal(bundle, row["sku"], ref, config)
                other = other_signals(bundle, row, ref, history, config)
                rec = recommend(row, rule, comp, sales, other, config)
                if missing_base_rules:
                    message = "Regras obrigatórias ausentes na importação: " + ", ".join(sorted(missing_base_rules))
                    rec["bloqueios"].append(message)
                    rec["alertas"].append(message)
                    rec["acao"] = "REVISAR"
                if any(r["id"] not in BASE_RULE_IDS for r in bundle.tables["Regras_Negocio"].to_dict("records")):
                    message = "Nova regra textual da base sem implementação; revisar mapeamento antes de aplicar."
                    rec["bloqueios"].append(message)
                    rec["alertas"].append(message)
                    rec["acao"] = "REVISAR"
                result.append(rec)
            except (ValueError, ArithmeticError) as exc:
                base.update(justificativa=f"REVISAR — {exc}", alertas=[str(exc)], bloqueios=[str(exc)])
                result.append(base)
        # R07 considers the proposed price against the other channel's current price.
        lookup = {(r["sku"], r["canal"]): r for r in result}
        for rec in result:
            counterpart = {"Loja física": "E-commerce", "E-commerce": "Loja física"}.get(rec["canal"])
            other = lookup.get((rec["sku"], counterpart))
            if rec.get("preco_sugerido") and other and other.get("preco_atual") and D(other["preco_atual"]) > 0:
                gap = abs(D(rec["preco_sugerido"])/D(other["preco_atual"])-1)
                if gap > D(config.channel_gap):
                    rec["alertas"].append("R07: diferença entre loja física e e-commerce exige aprovação.")
                    rec["exige_aprovacao"] = True
                    if rec["nivel_risco"] == "Baixo":
                        rec["nivel_risco"] = "Médio"
            rec["reference"] = ref.isoformat()
            rec["engine_version"] = ENGINE_VERSION
            rec["import_id"] = bundle.import_id
            rec["valid_until"] = (ref + timedelta(days=config.recommendation_valid_days)).isoformat()
        return result

    def generate(self, user="Analista", force=False):
        with self.db.transaction() as con:
            signature = self.input_signature(con)
            latest = self.db.query("SELECT * FROM executions ORDER BY id DESC LIMIT 1", con=con)
            if latest and latest[0]["signature"] == signature and not force:
                return latest[0]["id"]
            recs = self.analyze(con=con)
            execution_id = self.db.insert("executions", {"import_id": self.bundle(con).import_id, "reference": self.reference(con).isoformat(),
                "signature": signature, "config": dumps({"engine_version": ENGINE_VERSION, **self.config(con).dict()}), "criado_em": timestamp(), "criado_por": user}, con)
            columns = ["sku", "canal", "preco_atual", "preco_mercado", "custo_total", "margem_atual", "margem_minima_aplicada", "margem_alvo_aplicada", "preco_sugerido", "margem_projetada", "variacao_percentual", "acao", "nivel_risco", "prioridade", "justificativa", "regra_aplicada", "status"]
            for rec in recs:
                values = {k: rec.get(k) for k in columns}
                values.update({k: dumps(rec.get(k, {})) for k in ("sinais_utilizados", "alertas", "snapshot_regras")})
                values.update(execution_id=execution_id, criado_em=timestamp(), payload=dumps(rec))
                rec_id = self.db.insert("recommendations", values, con)
                if rec.get("excecao_utilizada"):
                    self.db.audit("recomendacao", rec_id, "Exceção de margem proposta; exige aprovação", None,
                                  {"regra": rec["snapshot_regras"], "evidencia": rec["sinais_utilizados"]["vendas"]}, user, con)
            self.db.audit("execucao_analise", execution_id, "Gerar recomendações", None,
                          {"combinacoes": len(recs), "referencia": self.reference(con), "signature": signature}, user, con)
        return execution_id

    def latest(self):
        rows = self.db.query("SELECT * FROM recommendations WHERE execution_id=(SELECT MAX(id) FROM executions) ORDER BY prioridade DESC, sku, canal")
        return [self._decode(r) for r in rows]

    def _decode(self, row):
        return {**json.loads(row["payload"]), "id": row["id"], "execution_id": row["execution_id"], "status": row["status"]}

    def recommendation(self, item_id, con=None):
        return self._decode(self.db.get("recommendations", item_id, con))

    def validate_decision_price(self, rec, price):
        if rec["acao"] == "EXCLUÍDO":
            raise ValueError("SKU excluído não recebe decisões de preço.")
        if rec.get("bloqueios"):
            raise ValueError("; ".join(rec["bloqueios"]))
        value = money(price)
        if value <= 0 or value < D(rec["preco_minimo"]):
            raise ValueError("Preço abaixo do piso de margem ou inválido.")
        variation = value/D(rec["preco_atual"])-1
        rule = rec["snapshot_regras"]
        if variation > D(rule["max_up"]) or -variation > D(rule["max_down"]):
            raise ValueError("Preço excede o limite máximo de variação.")
        if margin(value, rec["custo_total"], rec["taxa_canal"]) < D(rec["margem_minima_original"]):
            if not rec.get("excecao_utilizada") or not rec["exige_aprovacao"]:
                raise ValueError("Margem abaixo da original sem exceção explícita autorizada.")
        return value

    def decide(self, item_id, decision, user, justification="", price=None):
        allowed = {"Aprovar": "Aprovado", "Editar e aprovar": "Aprovado", "Rejeitar": "Rejeitado", "Enviar para revisão": "Em revisão"}
        if decision not in allowed:
            raise ValueError("Decisão inválida.")
        with self.db.transaction() as con:
            rec = self.recommendation(item_id, con)
            execution = self.db.get("executions", rec["execution_id"], con)
            if execution["signature"] != self.input_signature(con):
                raise ValueError("Análise desatualizada. Gere novas recomendações antes de decidir.")
            if rec["acao"] == "EXCLUÍDO":
                raise ValueError("SKU excluído.")
            if self.db.query("SELECT id FROM scheduled_price_changes WHERE recommendation_id=? AND status IN ('Agendado','Aplicado no protótipo')", (item_id,), con):
                raise ValueError("Cancele o agendamento pendente ou gere nova análise após a aplicação.")
            if (decision != "Aprovar" or rec["exige_aprovacao"]) and not justification.strip():
                raise ValueError("Informe a justificativa humana, incluindo os riscos revisados.")
            approved = None
            if decision in ("Aprovar", "Editar e aprovar"):
                candidate = rec["preco_sugerido"] if decision == "Aprovar" else price
                approved = float(self.validate_decision_price(rec, candidate))
            decision_id = self.db.insert("decisions", {"recommendation_id": item_id, "decisao": decision,
                "preco_original_sugerido": rec["preco_sugerido"], "preco_aprovado": approved,
                "justificativa_humana": justification, "decidido_por": user, "decidido_em": timestamp(), "snapshot_regras": dumps(rec["snapshot_regras"])}, con)
            self.db.update("recommendations", item_id, {"status": allowed[decision]}, con)
            self.db.audit("decisao", decision_id, decision, {"recomendacao": rec}, {"preco_aprovado": approved, "justificativa": justification}, user, con)
        return decision_id

    def simulate_rule(self, rule, rule_id=None):
        existing = [r for r in self.db.all("custom_rules") if r["id"] != rule_id]
        candidate = {**rule, "id": rule_id or max([r["id"] for r in existing] + [0])+1}
        rows = product_rows(self.bundle())
        validate_rule(candidate, rows)
        reference = max(self.reference(), as_date(candidate["inicio_vigencia"]))
        before = self.analyze(reference=reference, rules=existing)
        after = self.analyze(reference=reference, rules=existing + [candidate])
        affected = [r for r in after if matches(candidate, r)]
        pairs = {(r["sku"], r["canal"]): r for r in before}
        comparison = [{"SKU": r["sku"], "Canal": r["canal"], "Preço atual": r.get("preco_atual"),
                       "Sugestão antes": pairs[(r["sku"],r["canal"])].get("preco_sugerido"), "Sugestão depois": r.get("preco_sugerido"),
                       "Ação": r["acao"], "Aprovação": r["exige_aprovacao"], "Alertas": "; ".join(r["alertas"])} for r in affected]
        overlaps = [r["nome"] for r in existing if r["ativa"] and candidate["ativa"] and
                    as_date(r["inicio_vigencia"]) <= (as_date(candidate.get("fim_vigencia")) or date.max) and
                    as_date(candidate["inicio_vigencia"]) <= (as_date(r.get("fim_vigencia")) or date.max) and
                    any(matches(r, row) and matches(candidate, row) for row in rows)]
        return {"reference": reference.isoformat(), "skus": len({r["sku"] for r in affected}), "canais": sorted({r["canal"] for r in affected}),
                "aprovacoes": sum(r["exige_aprovacao"] and not pairs[(r["sku"],r["canal"])]["exige_aprovacao"] for r in affected),
                "conflitos": overlaps, "comparacao": comparison, "fingerprint": fingerprint(rule)}

    def save_rule(self, rule, user, rule_id=None):
        validate_rule(rule, product_rows(self.bundle()))
        with self.db.transaction() as con:
            before = self.db.get("custom_rules", rule_id, con) if rule_id else None
            values = {**rule, "valores_escopo": dumps(rule["valores_escopo"]), "atualizado_em": timestamp()}
            if rule_id:
                self.db.update("custom_rules", rule_id, values, con)
            else:
                values.update(criado_em=timestamp(), criado_por=user)
                rule_id = self.db.insert("custom_rules", values, con)
            self.db.audit("regra", rule_id, "Editar" if before else "Criar", before, values, user, con)
        return rule_id

    def deactivate_rule(self, rule_id, user):
        with self.db.transaction() as con:
            old = self.db.get("custom_rules", rule_id, con)
            self.db.update("custom_rules", rule_id, {"ativa": False, "atualizado_em": timestamp()}, con)
            self.db.audit("regra", rule_id, "Inativar", old, {"ativa": False}, user, con)

    def exclude(self, skus, reason, start, end, user):
        if not skus or not reason.strip():
            raise ValueError("Selecione SKUs e informe o motivo.")
        if end and as_date(end) < as_date(start):
            raise ValueError("Fim de exclusão anterior ao início.")
        known = set(self.bundle().tables["Produtos"].sku)
        if not set(skus) <= known:
            raise ValueError("SKU sem cadastro.")
        with self.db.transaction() as con:
            for sku in set(skus):
                value = {"sku": sku, "motivo": reason, "inicio_vigencia": as_date(start).isoformat(), "fim_vigencia": as_date(end).isoformat() if end else None,
                         "ativa": True, "criado_em": timestamp(), "criado_por": user}
                item_id = self.db.insert("sku_exclusions", value, con)
                self.db.audit("exclusao", item_id, "Excluir SKU", None, value, user, con)
                pending = self.db.query("SELECT * FROM scheduled_price_changes WHERE sku=? AND status='Agendado'", (sku,), con)
                for schedule in pending:
                    if active_on(value, schedule["data_hora_agendada"]):
                        self.db.update("scheduled_price_changes", schedule["id"], {"status": "Cancelado", "cancelado_em": timestamp(), "falha": "SKU excluído"}, con)
                        self.db.audit("agendamento", schedule["id"], "Cancelar por exclusão", schedule, value, user, con)

    def end_exclusion(self, exclusion_id, user):
        with self.db.transaction() as con:
            old = self.db.get("sku_exclusions", exclusion_id, con)
            reference = self.reference(con)
            # Close the interval while preserving historical applicability where possible.
            final_day = min(reference-timedelta(days=1), as_date(old.get("fim_vigencia")) or date.max)
            values = {"fim_vigencia": final_day.isoformat()} if as_date(old["inicio_vigencia"]) < reference else {"ativa": False}
            self.db.update("sku_exclusions", exclusion_id, values, con)
            self.db.audit("exclusao", exclusion_id, "Encerrar / reativar SKU", old, values, user, con)

    def set_last_sale(self, sku, canal, day, reason, user):
        if not reason.strip() or as_date(day) > self.reference():
            raise ValueError("Justifique o ajuste e use data até a referência da análise.")
        if not any(r["sku"] == sku and r["canal"] == canal for r in product_rows(self.bundle())):
            raise ValueError("SKU/canal não encontrado.")
        with self.db.transaction() as con:
            value = {"sku": sku, "canal": canal, "ultima_venda": as_date(day).isoformat(), "justificativa": reason, "criado_por": user, "criado_em": timestamp()}
            item_id = self.db.insert("manual_sales", value, con)
            self.db.audit("ultima_venda", item_id, "Informar data manualmente", None, value, user, con)
