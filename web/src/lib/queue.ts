import type { Recomendacao } from "./types";
import { DEFAULT_MARGIN_FORMULA, unitProfit } from "./margin";
import { recentMonthlyUnits } from "./impact";

export type QueueGroup = "rapida" | "motivo" | "rampa" | "decididas";

/** Em que grupo da fila o item cai (mesma regra da Fila de decisões). */
export function queueGroup(r: Recomendacao, decided: boolean): QueueGroup {
  if (decided) return "decididas";
  if (r.preco_sugerido == null && r.proposta.rampa) return "rampa";
  if (r.acao !== "REVISAR" && !r.alertas.some((a) => a.tipo !== "informativo")) return "rapida";
  return "motivo";
}

/**
 * Ganho estimado de contribuição por mês se o preço sugerido for aplicado.
 * Volume previsto pela sensibilidade a preço da categoria (estimada das vendas da base).
 */
export function monthlyGain(r: Recomendacao, elasticity: Record<string, number>, price: number | null = r.preco_sugerido): number | null {
  if (price == null || Math.abs(price - r.preco_atual) < 0.005) return null;
  const formula = r.margin_formula ?? DEFAULT_MARGIN_FORMULA;
  const units = recentMonthlyUnits(r);
  const expected = units * (price / r.preco_atual) ** (elasticity[r.categoria] ?? -1);
  return expected * unitProfit(r, price, formula) - units * unitProfit(r, r.preco_atual, formula);
}
