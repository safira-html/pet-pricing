import type { Decisao, Recomendacao } from "./types";
import { DEFAULT_MARGIN_FORMULA, marginAt } from "./margin";

export const FAIXA_COMPETITIVA = 0.02;

/** Preço vigente depois das decisões aprovadas (simulação local). */
export function precoVigente(r: Recomendacao, decisoes: Decisao[]) {
  const d = decisoes.find((x) => x.recId === r.id);
  if (d && d.preco != null && (d.tipo === "aprovar" || d.tipo === "editar" || d.tipo === "etapa_rampa")) return d.preco;
  return r.preco_atual;
}

export function margemCom(r: Recomendacao, preco: number) {
  return marginAt(r, preco, r.margin_formula ?? DEFAULT_MARGIN_FORMULA);
}

export function metricas(recs: Recomendacao[], decisoes: Decisao[]) {
  const comMercado = recs.filter((r) => r.preco_mercado != null);
  const naFaixa = (preco: (r: Recomendacao) => number) =>
    comMercado.filter((r) => Math.abs(preco(r) / r.preco_mercado! - 1) <= FAIXA_COMPETITIVA).length / (comMercado.length || 1);
  const margemMedia = (preco: (r: Recomendacao) => number) => recs.reduce((s, r) => s + margemCom(r, preco(r)), 0) / (recs.length || 1);
  const abaixoPiso = (preco: (r: Recomendacao) => number) => recs.filter((r) => preco(r) < r.preco_minimo - 0.005).length;
  const vig = (r: Recomendacao) => precoVigente(r, decisoes);
  const humanas = decisoes.filter((d) => d.perfil !== "sistema");
  const aceitas = humanas.filter((d) => d.tipo === "aprovar" || d.tipo === "editar" || d.tipo === "etapa_rampa").length;
  const rejeitadas = humanas.filter((d) => d.tipo === "rejeitar").length;
  const tempos = humanas.map((d) => d.segundosAteDecidir).filter((s): s is number => s != null);
  return {
    faixaHoje: naFaixa((r) => r.preco_atual),
    faixaDepois: naFaixa(vig),
    margemHoje: margemMedia((r) => r.preco_atual),
    margemDepois: margemMedia(vig),
    abaixoPisoHoje: abaixoPiso((r) => r.preco_atual),
    abaixoPisoDepois: abaixoPiso(vig),
    decididas: decisoes.length,
    aceitacao: aceitas + rejeitadas ? aceitas / (aceitas + rejeitadas) : null,
    tempoMedioSeg: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
  };
}
