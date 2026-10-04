from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any


@dataclass
class Settings:
    market_weight: float = 0.5
    neutrality: float = 0.005
    max_increase: float = 0.05
    max_decrease: float = 0.05
    curve_a_threshold: float = 0.03
    competition_max_hours: int = 48
    channel_gap: float = 0.05
    cooldown_days: int = 3
    anomaly_threshold: float = 0.20
    low_coverage: float = 15
    high_coverage: float = 90
    include_competitor_shipping: bool = False
    recommendation_valid_days: int = 7
    priority_base: int = 20
    priority_margin: int = 35
    priority_excess: int = 25
    priority_curve_a: int = 15
    priority_high_risk: int = 10
    strategic_skus: list[str] = field(default_factory=list)

    def validate(self):
        for key in ("market_weight", "neutrality", "max_increase", "max_decrease", "curve_a_threshold", "channel_gap", "anomaly_threshold"):
            if not 0 <= getattr(self, key) <= 1:
                raise ValueError(f"{key}: informe um percentual entre 0 e 100%.")
        # R02 and R06 from the original workbook are mandatory ceilings.
        if self.max_increase > 0.05 or self.max_decrease > 0.05:
            raise ValueError("R02: a variação máxima não pode ultrapassar 5% por decisão.")
        if not 0 < self.competition_max_hours <= 48:
            raise ValueError("R06: atualização deve estar entre 1 e 48 horas.")
        if self.curve_a_threshold > .03 or self.channel_gap > .05 or self.anomaly_threshold > .20:
            raise ValueError("Não é permitido afrouxar R03 (3%), R07 (5%) ou R10 (20%).")
        if self.cooldown_days < 3 or self.recommendation_valid_days <= 0:
            raise ValueError("Intervalos inválidos: respeite R08 (3 dias).")
        if self.low_coverage < 15 or self.high_coverage > 90 or self.high_coverage < self.low_coverage:
            raise ValueError("Respeite R11 (cobertura baixa ao menos 15 dias) e R12 (excesso a partir de no máximo 90 dias).")
        if any(not 0 <= getattr(self, key) <= 100 for key in ("priority_base", "priority_margin", "priority_excess", "priority_curve_a", "priority_high_risk")):
            raise ValueError("Pesos da prioridade devem estar entre 0 e 100.")
        return self

    def dict(self):
        return asdict(self)


@dataclass
class DataBundle:
    tables: dict[str, Any]
    reference: date
    source_name: str
    source_hash: str
    issues: list[dict] = field(default_factory=list)
    headers: dict[str, int] = field(default_factory=dict)
    import_id: int | None = None


SCHEDULE_STATUSES = ["Rascunho", "Pendente de aprovação", "Agendado", "Aplicado no protótipo", "Cancelado", "Falhou", "Expirado"]
