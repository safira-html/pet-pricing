import { unitProfit, type MarginFormula } from "./margin";
import type { Agendamento, Decisao, Outcome, OutcomeVerdict, Recomendacao } from "./types";

/** Janela de medição depois de aplicar uma mudança. */
export const MEASUREMENT_DAYS = 30;
/** Variação mínima da contribuição para contar como melhora ou piora. */
export const VERDICT_THRESHOLD = 0.01;
/** Limites para um aprendizado mudar o piloto automático. */
export const LEARNING_MIN_MEASURED = 2;
export const LEARNING_MIN_DECISIONS = 3;
export const LEARNING_HOLD_RATE = 0.5;
export const LEARNING_SUGGEST_MIN = 3;
export const LEARNING_SUGGEST_RATE = 0.8;

const ELASTICITY_FALLBACK = -1;

/**
 * Sensibilidade a preço por categoria, estimada das vendas de 12 meses da própria base:
 * regressão log-log com as séries de cada produto e canal centradas na média.
 */
export function estimateElasticity(recs: Recomendacao[]): Record<string, number> {
  const acc: Record<string, { pq: number; pp: number }> = {};
  for (const r of recs) {
    const v = r.vendas.filter((x) => x.quantidade > 0 && x.preco_medio > 0);
    if (v.length < 4) continue;
    const lq = v.map((x) => Math.log(x.quantidade));
    const lp = v.map((x) => Math.log(x.preco_medio));
    const mq = lq.reduce((a, b) => a + b, 0) / lq.length;
    const mp = lp.reduce((a, b) => a + b, 0) / lp.length;
    const c = (acc[r.categoria] ??= { pq: 0, pp: 0 });
    lp.forEach((p, i) => {
      c.pq += (p - mp) * (lq[i] - mq);
      c.pp += (p - mp) ** 2;
    });
  }
  return Object.fromEntries(
    Object.entries(acc).map(([cat, c]) => [cat, c.pp > 0 ? Math.min(-0.2, Math.max(-3, c.pq / c.pp)) : ELASTICITY_FALLBACK]),
  );
}

/** Média mensal de unidades nos 3 últimos meses da base. */
export function recentMonthlyUnits(r: Recomendacao) {
  const last = [...r.vendas].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-3);
  return last.length ? last.reduce((s, x) => s + x.quantidade, 0) / last.length : 0;
}

/** Ruído determinístico entre -1 e 1, para a simulação dar o mesmo resultado sempre. */
function noise(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * Simula as vendas 30 dias depois de aplicar o preço.
 * Previsto: sensibilidade a preço da categoria. Observado: previsto com variação de ±10%
 * e uma perda extra de 8% quando o preço novo fica mais de 3% acima do mercado.
 * Com o ERP conectado, o observado vem das vendas reais.
 */
export function simulateOutcome(
  r: Recomendacao, schedule: Agendamento, elasticity: Record<string, number>, formula: MarginFormula, appliedAt: string,
): Outcome {
  const e = elasticity[r.categoria] ?? ELASTICITY_FALLBACK;
  const unitsBefore = Math.round(recentMonthlyUnits(r));
  const ratio = schedule.preco / r.preco_atual;
  const unitsExpected = unitsBefore * ratio ** e;
  const aboveMarket = r.preco_mercado != null && schedule.preco / r.preco_mercado - 1 > 0.03 ? 0.92 : 1;
  const unitsAfter = Math.max(0, Math.round(unitsExpected * (1 + 0.1 * noise(schedule.id + r.id)) * aboveMarket));
  const profitBefore = unitsBefore * unitProfit(r, r.preco_atual, formula);
  const profitAfter = unitsAfter * unitProfit(r, schedule.preco, formula);
  const change = profitBefore !== 0 ? (profitAfter - profitBefore) / Math.abs(profitBefore) : Math.sign(profitAfter);
  const verdict: OutcomeVerdict = change >= VERDICT_THRESHOLD ? "improved" : change <= -VERDICT_THRESHOLD ? "worsened" : "neutral";
  const measured = new Date(new Date(appliedAt).getTime() + MEASUREMENT_DAYS * 86400000).toISOString();
  return {
    id: `${schedule.id}-o`, recId: r.id, scheduleId: schedule.id, origin: schedule.origem,
    oldPrice: r.preco_atual, newPrice: schedule.preco, appliedAt, measuredAt: measured, days: MEASUREMENT_DAYS,
    unitsBefore, unitsExpected, unitsAfter, profitBefore, profitAfter, verdict, formula, simulated: true,
  };
}

export function profitChange(o: Outcome) {
  return o.profitBefore !== 0 ? (o.profitAfter - o.profitBefore) / Math.abs(o.profitBefore) : null;
}

export type LearningEffect = "hold" | "suggest" | "none";

export interface SegmentLearning {
  key: string;
  categoria: string;
  canal: Recomendacao["canal"];
  measured: number;
  improved: number;
  worsened: number;
  decisions: number;
  rejected: number;
  effect: LearningEffect;
  reason: string;
  dismissed: boolean;
}

export const segmentKey = (r: Pick<Recomendacao, "categoria" | "canal">) => `${r.categoria}|${r.canal}`;

const ACCEPTED: Decisao["tipo"][] = ["aprovar", "editar", "etapa_rampa"];

/**
 * Junta resultado medido e decisões humanas por categoria e canal.
 * Um aprendizado só tira itens do piloto automático (hold); colocar no piloto
 * continua sendo decisão do gestor (suggest vira um atalho, não uma ação automática).
 */
export function buildLearnings(recs: Recomendacao[], outcomes: Outcome[], decisions: Decisao[], dismissed: string[]): SegmentLearning[] {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const map = new Map<string, SegmentLearning>();
  const get = (r: Recomendacao) => {
    const key = segmentKey(r);
    if (!map.has(key)) {
      map.set(key, { key, categoria: r.categoria, canal: r.canal, measured: 0, improved: 0, worsened: 0, decisions: 0, rejected: 0, effect: "none", reason: "", dismissed: dismissed.includes(key) });
    }
    return map.get(key)!;
  };
  for (const o of outcomes) {
    const r = byId.get(o.recId);
    if (!r) continue;
    const s = get(r);
    s.measured++;
    if (o.verdict === "improved") s.improved++;
    if (o.verdict === "worsened") s.worsened++;
  }
  for (const d of decisions) {
    const r = byId.get(d.recId);
    if (!r || d.perfil === "sistema" || d.tipo === "revisar") continue;
    const s = get(r);
    s.decisions++;
    if (!ACCEPTED.includes(d.tipo)) s.rejected++;
  }
  for (const s of map.values()) {
    if (s.measured >= LEARNING_MIN_MEASURED && s.worsened / s.measured >= LEARNING_HOLD_RATE) {
      s.effect = "hold";
      s.reason = `${s.worsened} de ${s.measured} mudanças medidas ${verb(s.worsened, "piorou", "pioraram")} a contribuição`;
    } else if (s.decisions >= LEARNING_MIN_DECISIONS && s.rejected / s.decisions >= LEARNING_HOLD_RATE) {
      s.effect = "hold";
      s.reason = `analistas rejeitaram ${s.rejected} de ${s.decisions} recomendações`;
    } else if (s.measured >= LEARNING_SUGGEST_MIN && s.improved / s.measured >= LEARNING_SUGGEST_RATE) {
      s.effect = "suggest";
      s.reason = `${s.improved} de ${s.measured} mudanças medidas ${verb(s.improved, "melhorou", "melhoraram")} a contribuição`;
    }
  }
  return [...map.values()].sort((a, b) => (a.effect === b.effect ? b.measured + b.decisions - (a.measured + a.decisions) : a.effect === "hold" ? -1 : b.effect === "hold" ? 1 : a.effect === "suggest" ? -1 : 1));
}

export const VERDICT_LABEL: Record<OutcomeVerdict, string> = { improved: "Melhorou", neutral: "Estável", worsened: "Piorou" };

/** Concordância de número: 1 → singular, demais → plural. */
export const verb = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);

export const VERDICT_COUNT: Record<OutcomeVerdict, [string, string]> = {
  improved: ["melhorou", "melhoraram"], neutral: ["estável", "estáveis"], worsened: ["piorou", "pioraram"],
};

