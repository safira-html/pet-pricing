"""Human-approved local schedules. No ERP/network writes exist in this module."""
from __future__ import annotations

import json
import sqlite3

from .pricing_engine import margin
from .utils import D, as_date, as_datetime, dumps, end_of_day, fingerprint, money, now, timestamp


def policy_snapshot(rec, settings):
    return {"import_id": rec["import_id"], "config": settings.dict(), "price": rec["preco_atual"],
            "cost": rec.get("custo_total"), "fee": rec.get("taxa_canal"),
            "rules": rec.get("snapshot_regras", {}).get("rules", []),
            "minimum": rec.get("margem_minima_aplicada"), "target": rec.get("margem_alvo_aplicada"),
            "exception": rec.get("excecao_utilizada"), "manual_sale_id": rec.get("sinais_utilizados", {}).get("vendas", {}).get("ajuste_id")}


def risk_snapshot(rec):
    signals = rec.get("sinais_utilizados", {})
    competition = signals.get("concorrencia", {})
    return {"promocoes": signals.get("promocoes", []), "promocao_incompleta": signals.get("promocao_incompleta", False),
            "concorrencia_desatualizada": competition.get("desatualizado", False),
            "anomalia": competition.get("anomalia", False), "sem_mercado": competition.get("mediana") is None,
            "conflito_canais": any(a.startswith("R07:") for a in rec.get("alertas", []))}


class SchedulerService:
    def __init__(self, service):
        self.service, self.db = service, service.db

    def _fresh(self, rec, when, con):
        candidates = self.service.analyze(reference=when.date(), con=con)
        fresh = next((r for r in candidates if r["sku"] == rec["sku"] and r["canal"] == rec["canal"]), None)
        if not fresh or fresh["acao"] == "EXCLUÍDO":
            raise ValueError("SKU excluído ou indisponível na data agendada.")
        if fresh.get("bloqueios"):
            raise ValueError("; ".join(fresh["bloqueios"]))
        # Local events have exact times: never round a 72-hour cooldown down to calendar days.
        for event in self.db.query("SELECT aplicado_em FROM local_price_history WHERE sku=?", (rec["sku"],), con):
            elapsed = (when - as_datetime(event["aplicado_em"])).total_seconds()
            if 0 <= elapsed < self.service.config(con).cooldown_days * 86400:
                raise ValueError("R08: intervalo mínimo em horas desde a última aplicação local ainda não cumprido.")
        return fresh

    def preview(self, item_id, price, when):
        when = as_datetime(when)
        with self.db.connect() as con:
            rec = self.service.recommendation(item_id, con)
            fresh = self._fresh(rec, when, con)
            self.service.validate_decision_price(fresh, price)
            return {"margem": float(margin(price, fresh["custo_total"], fresh["taxa_canal"])), "regra": fresh["regra_aplicada"], "alertas": fresh["alertas"]}

    def schedule(self, item_id, price, when, valid_until, reason, user, clock=None):
        when, valid_until, clock = as_datetime(when), as_datetime(valid_until), as_datetime(clock or now())
        if when <= clock or valid_until < when:
            raise ValueError("Agende para o futuro com validade igual ou posterior ao horário agendado.")
        if not reason.strip():
            raise ValueError("Justificativa do agendamento é obrigatória.")
        try:
            with self.db.transaction() as con:
                rec = self.service.recommendation(item_id, con)
                if when.date() < as_date(rec["reference"]):
                    raise ValueError("Data agendada anterior à referência da recomendação.")
                if rec["status"] != "Aprovado":
                    raise ValueError("Aprove a recomendação antes de agendar.")
                decisions = self.db.query("SELECT * FROM decisions WHERE recommendation_id=? ORDER BY id DESC LIMIT 1", (item_id,), con)
                if not decisions or decisions[0]["decisao"] not in ("Aprovar", "Editar e aprovar"):
                    raise ValueError("Não há aprovação humana válida.")
                decision = decisions[0]
                if money(price) != money(decision["preco_aprovado"]):
                    raise ValueError("Preço diferente do aprovado. Use Editar e aprovar antes de agendar.")
                execution = self.db.get("executions", rec["execution_id"], con)
                if execution["signature"] != self.service.input_signature(con):
                    raise ValueError("Análise desatualizada; gere e aprove uma nova recomendação.")
                if valid_until > end_of_day(rec["valid_until"]):
                    raise ValueError("Validade ultrapassa a validade da recomendação. Atualize a referência/base e analise novamente.")
                fresh = self._fresh(rec, when, con)
                config = self.service.config(con)
                if fingerprint(policy_snapshot(rec, config)) != fingerprint(policy_snapshot(fresh, config)):
                    raise ValueError("Regra, custo, preço ou condição de exceção mudou na data agendada; nova análise e aprovação necessárias.")
                self.service.validate_decision_price(fresh, price)
                for rule in fresh["snapshot_regras"]["rules"]:
                    if rule.get("fim_vigencia") and valid_until > end_of_day(rule["fim_vigencia"]):
                        raise ValueError("Validade do agendamento ultrapassa a vigência da regra.")
                existing = self.db.query("SELECT id FROM scheduled_price_changes WHERE sku=? AND canal=? AND status IN ('Agendado','Rascunho','Pendente de aprovação')", (rec["sku"],rec["canal"]), con)
                if existing:
                    raise ValueError("Conflito: já existe agendamento ativo para este SKU/canal. Cancele-o explicitamente.")
                values = {"recommendation_id": item_id, "decision_id": decision["id"], "sku": rec["sku"], "canal": rec["canal"], "preco_atual": rec["preco_atual"],
                    "preco_agendado": float(money(price)), "data_hora_agendada": when.isoformat(), "validade_agendamento": valid_until.isoformat(),
                    "status": "Agendado", "justificativa": reason, "exige_aprovacao": True, "aprovado_por": decision["decidido_por"],
                    "aprovado_em": decision["decidido_em"], "criado_em": timestamp(),
                    "snapshot": dumps({"policy": policy_snapshot(fresh, config), "risks": risk_snapshot(fresh)})}
                item = self.db.insert("scheduled_price_changes", values, con)
                self.db.audit("agendamento", item, "Agendar aplicação local", None, values, user, con)
            return item
        except sqlite3.IntegrityError as exc:
            raise ValueError("Conflito de agendamento. Nenhum registro foi sobrescrito.") from exc

    def cancel(self, item_id, user, reason):
        if not reason.strip():
            raise ValueError("Informe o motivo do cancelamento.")
        with self.db.transaction() as con:
            old = self.db.get("scheduled_price_changes", item_id, con)
            if old["status"] not in ("Agendado", "Rascunho", "Pendente de aprovação"):
                raise ValueError("Este agendamento não pode mais ser cancelado.")
            values = {"status": "Cancelado", "cancelado_em": timestamp(), "falha": reason}
            self.db.update("scheduled_price_changes", item_id, values, con)
            self.db.audit("agendamento", item_id, "Cancelar", old, values, user, con)

    def execute_due(self, user="Administrador local", clock=None):
        clock = as_datetime(clock or now())
        outcomes = []
        with self.db.transaction() as con:
            pending = self.db.query("SELECT * FROM scheduled_price_changes WHERE status='Agendado' AND data_hora_agendada<=? ORDER BY data_hora_agendada,id", (clock.isoformat(),), con)
            for item in pending:
                status, error = "Aplicado no protótipo", None
                if clock > as_datetime(item["validade_agendamento"]):
                    status, error = "Expirado", "Validade encerrada antes da execução."
                else:
                    try:
                        rec = self.service.recommendation(item["recommendation_id"], con)
                        decision = self.db.get("decisions", item["decision_id"], con)
                        latest = self.db.query("SELECT id FROM decisions WHERE recommendation_id=? ORDER BY id DESC LIMIT 1", (rec["id"],), con)
                        if rec["status"] != "Aprovado" or decision["id"] != latest[0]["id"]:
                            raise ValueError("Aprovação não está mais vigente.")
                        fresh = self._fresh(rec, clock, con)
                        snapshot = policy_snapshot(fresh, self.service.config(con))
                        saved = json.loads(item["snapshot"])
                        if fingerprint(snapshot) != fingerprint(saved.get("policy")):
                            raise ValueError("Regras, condição de exceção, importação ou preço mudaram; requer nova revisão.")
                        if fingerprint(risk_snapshot(fresh)) != fingerprint(saved.get("risks")):
                            raise ValueError("Promoção ou riscos mudaram desde o agendamento; revise e aprove novamente.")
                        self.service.validate_decision_price(fresh, item["preco_agendado"])
                        apply_price_locally(self.db, item, clock, user, con)
                    except ValueError as exc:
                        status, error = "Falhou", str(exc)
                values = {"status": status, "falha": error}
                self.db.update("scheduled_price_changes", item["id"], values, con)
                if status == "Falhou":
                    previous = self.db.get("recommendations", item["recommendation_id"], con)
                    self.db.update("recommendations", previous["id"], {"status": "Em revisão"}, con)
                    self.db.audit("recomendacao", previous["id"], "Enviar para revisão após falha de agendamento",
                                  {"status": previous["status"]}, {"status": "Em revisão", "motivo": error}, user, con)
                self.db.audit("agendamento", item["id"], status, item, values, user, con)
                outcomes.append({"id": item["id"], **values})
        return outcomes


def apply_price_locally(db, schedule, when, user, con):
    """Integration boundary: writes only local history, atomically and idempotently."""
    values = {"schedule_id": schedule["id"], "sku": schedule["sku"], "canal": schedule["canal"],
              "preco_anterior": schedule["preco_atual"], "preco": schedule["preco_agendado"], "aplicado_em": when.isoformat(), "usuario": user}
    item_id = db.insert("local_price_history", values, con)
    db.audit("preco_local", item_id, "Aplicar no protótipo", {"preco": schedule["preco_atual"]}, values, user, con)


if __name__ == "__main__":
    from dotenv import load_dotenv
    from .data_loader import ROOT
    from .database import Database
    from .recommendation_service import RecommendationService
    load_dotenv(ROOT / ".env")
    print(dumps(SchedulerService(RecommendationService(Database())).execute_due()))
