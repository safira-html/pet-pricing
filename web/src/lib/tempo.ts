import { queueGroup } from "./queue";
import type { Recomendacao } from "./types";

/**
 * Premissas do modelo de tempo de revisão. É uma estimativa simulada, não uma medição.
 * - manualMinPerItem: a linha de base da Semana 2 (18 h por semana) dividida pelas 120 combinações = 9 min por item.
 * - quickMin: abrir o item, ler a explicação e aprovar (aprovação rápida).
 * - reasonMin: item que pede motivo ou revisão, com análise de uma pessoa.
 * - rampMin: item da rampa de reajuste (aprovar a etapa e agendar a próxima).
 * - autoGlanceMin: olhar a fila de veto de um item do piloto automático.
 */
export interface TimeAssumptions {
  manualMinPerItem: number;
  quickMin: number;
  reasonMin: number;
  rampMin: number;
  autoGlanceMin: number;
}

export const TIME_ASSUMPTIONS: TimeAssumptions = { manualMinPerItem: 9, quickMin: 1, reasonMin: 5, rampMin: 3, autoGlanceMin: 0.25 };

export interface ReviewTime {
  items: number;
  quick: number;
  reason: number;
  ramp: number;
  auto: number;
  manualMin: number;
  copilotMin: number;
  autopilotMin: number;
}

/** Minutos por semana para revisar todos os itens: à mão, com o copiloto e com o piloto automático nos itens de `autoIds`. */
export function estimateReviewTime(recs: Recomendacao[], autoIds: ReadonlySet<string>, a: TimeAssumptions = TIME_ASSUMPTIONS): ReviewTime {
  let quick = 0, reason = 0, ramp = 0, auto = 0;
  for (const r of recs) {
    if (autoIds.has(r.id)) { auto++; continue; }
    const g = queueGroup(r, false);
    if (g === "rapida") quick++;
    else if (g === "rampa") ramp++;
    else reason++;
  }
  return {
    items: recs.length, quick, reason, ramp, auto,
    manualMin: recs.length * a.manualMinPerItem,
    copilotMin: (quick + auto) * a.quickMin + reason * a.reasonMin + ramp * a.rampMin,
    autopilotMin: quick * a.quickMin + auto * a.autoGlanceMin + reason * a.reasonMin + ramp * a.rampMin,
  };
}

export const hoursText = (min: number) => `${(min / 60).toFixed(1).replace(".", ",")} h`;
