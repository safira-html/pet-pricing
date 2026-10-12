import type { Recomendacao } from "./types";

/**
 * As duas fórmulas de margem possíveis com o material do desafio.
 * O material não define qual é a oficial (o dicionário da base só diz "Piso de margem"),
 * por isso o protótipo deixa a escolha visível e reversível.
 */
export type MarginFormula = "contribution" | "gross";

/** Fórmula do motor original: os dados sem `margin_formula` foram calculados com ela. */
export const ENGINE_MARGIN_FORMULA: MarginFormula = "contribution";

/**
 * Padrão do protótipo desde a Semana 4. Decisão do grupo, a validar com o mentor: na base oficial, 0 de 120 preços ficam
 * abaixo do mínimo pela margem bruta (120 de 120 pela contribuição), o deck da Semana 2 e os testadores usaram a bruta.
 */
export const DEFAULT_MARGIN_FORMULA: MarginFormula = "gross";

export const MARGIN_FORMULAS: Record<MarginFormula, { label: string; formula: string; usedBy: string; why: string }> = {
  contribution: {
    label: "Margem de contribuição",
    formula: "(preço × (1 − taxa do canal) − reposição − impostos − frete) ÷ preço",
    usedBy: "Motor do protótipo do Allan",
    why: "Desconta impostos, frete e a taxa do canal, como o desafio lista em “Custos e margem”. É a visão conservadora: com ela, nenhum preço da base oficial cumpre o mínimo.",
  },
  gross: {
    label: "Margem bruta sobre a reposição",
    formula: "(preço − custo de reposição) ÷ preço",
    usedBy: "Deck da Semana 2, indicador “margem bruta média de 31,8%” e os dois testadores da Semana 4",
    why: "Bate com o indicador mensal e com os preços atuais da base, que cumprem o mínimo. Ignora a taxa do canal (12% no marketplace), então pode superestimar a margem ali.",
  },
};

/** Custo e taxa que entram na conta, conforme a fórmula. */
export function marginInputs(r: Recomendacao, formula: MarginFormula) {
  return formula === "gross" ? { cost: r.custo.reposicao, fee: 0 } : { cost: r.custo.total, fee: r.custo.taxa_canal };
}

export function marginAt(r: Recomendacao, price: number, formula: MarginFormula) {
  const { cost, fee } = marginInputs(r, formula);
  return (price * (1 - fee) - cost) / price;
}

/** Quanto sobra por unidade, em reais, depois dos custos da fórmula. */
export function unitProfit(r: Recomendacao, price: number, formula: MarginFormula) {
  const { cost, fee } = marginInputs(r, formula);
  return price * (1 - fee) - cost;
}
