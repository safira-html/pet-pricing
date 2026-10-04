import type { Recomendacao } from "./types";

/**
 * As duas fórmulas de margem possíveis com o material do desafio.
 * O material não define qual é a oficial (o dicionário da base só diz "Piso de margem"),
 * por isso o protótipo deixa a escolha visível e reversível.
 */
export type MarginFormula = "contribution" | "gross";

export const DEFAULT_MARGIN_FORMULA: MarginFormula = "contribution";

export const MARGIN_FORMULAS: Record<MarginFormula, { label: string; formula: string; usedBy: string; why: string }> = {
  contribution: {
    label: "Margem de contribuição",
    formula: "(preço × (1 − taxa do canal) − reposição − impostos − frete) ÷ preço",
    usedBy: "Motor do protótipo do Allan",
    why: "Usa todos os custos que o desafio lista em “Custos e margem” e diferencia os canais, como o enunciado pede.",
  },
  gross: {
    label: "Margem bruta sobre a reposição",
    formula: "(preço − custo de reposição) ÷ preço",
    usedBy: "Deck da Semana 2 e indicador “margem bruta média de 31,8%”",
    why: "Bate com o indicador mensal da base, mas trata loja física e marketplace como se custassem o mesmo.",
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
