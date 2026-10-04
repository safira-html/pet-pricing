import type { Alerta, Escopo, ParametrosBase, Recomendacao, RegraPreco } from "./types";
import { PARAMETROS_PADRAO } from "./types";
import { DEFAULT_MARGIN_FORMULA, marginInputs, type MarginFormula } from "./margin";

/**
 * Prévia do efeito de regras por grupo e de parâmetros mais rígidos.
 * Espelha src/pricing_engine.py e src/rule_engine.py do motor do Allan
 * (margem de contribuição, piso arredondado para cima, peso de mercado 0,5,
 * neutralidade de 0,5%, margem mínima mais protetora prevalece).
 * Com formula = "gross", a mesma conta roda sobre a margem bruta (só custo de reposição, sem taxa).
 * É uma prévia: o cálculo oficial roda no backend.
 */
const RANK: Record<Escopo, number> = { todos: 0, curva: 1, categoria: 2, marca: 2, canal: 2, sku: 3 };
const up2 = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;
const down2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function cobreRegra(g: RegraPreco, r: Recomendacao) {
  if (g.escopo === "todos") return true;
  const campo = { curva: r.curva, categoria: r.categoria, marca: r.marca, canal: r.canal, sku: r.sku }[g.escopo];
  return g.valores.includes(campo);
}

export function vigente(g: RegraPreco, referencia: string) {
  const ref = referencia.slice(0, 10);
  return g.ativa && g.inicio <= ref && (!g.fim || g.fim >= ref);
}

function igualPadrao(p: ParametrosBase) {
  return (Object.keys(PARAMETROS_PADRAO) as (keyof ParametrosBase)[]).every((k) => p[k] === PARAMETROS_PADRAO[k]);
}

export function recalcular(
  r: Recomendacao, regras: RegraPreco[], params: ParametrosBase, forcar = false, estrategicos: string[] = [],
  formula: MarginFormula = DEFAULT_MARGIN_FORMULA,
): Recomendacao {
  const aplicaveis = regras
    .filter((g) => vigente(g, r.data_referencia) && cobreRegra(g, r))
    .sort((a, b) => RANK[b.escopo] - RANK[a.escopo] || b.prioridade - a.prioridade);
  if (!forcar && formula === DEFAULT_MARGIN_FORMULA && !aplicaveis.length && igualPadrao(params) && !estrategicos.includes(r.sku)) return r;

  const vencedora = aplicaveis[0];
  const minima = Math.max(r.margem.minima, ...aplicaveis.map((g) => g.margemMinima));
  const alvo = Math.max(vencedora ? vencedora.margemAlvo : r.margem.alvo, minima);
  const sobe = Math.min(params.R02, ...aplicaveis.map((g) => g.subidaMax));
  const desce = Math.min(params.R02, ...aplicaveis.map((g) => g.reducaoMax));
  const { cost: custo, fee: taxa } = marginInputs(r, formula);
  const atual = r.preco_atual;
  const margem = (p: number) => (p * (1 - taxa) - custo) / p;

  const piso = up2(custo / (1 - taxa - minima));
  const precoAlvo = custo / (1 - taxa - alvo);
  const candidato = r.preco_mercado == null ? precoAlvo : precoAlvo * 0.5 + r.preco_mercado * 0.5;
  const inferior = Math.max(piso, up2(atual * (1 - desce)));
  const superior = down2(atual * (1 + sobe));

  const blocoPiso = "Piso de margem incompatível com o limite de variação. Corrija custo/regra ou faça nova análise.";
  const bloqueios = r.bloqueios.filter((b) => !b.startsWith("Piso de margem"));
  let sugerido: number | null = null;
  let variacao: number | null = null;
  if (inferior > superior) bloqueios.push(blocoPiso);
  else {
    sugerido = Math.max(inferior, Math.min(superior, r2(candidato)));
    variacao = sugerido / atual - 1;
    if (Math.abs(variacao) <= 0.005 && atual >= piso) { sugerido = atual; variacao = 0; }
  }

  const alertas: Alerta[] = r.alertas.filter((a) => !a.texto.startsWith("Piso de margem") && a.codigo !== "R03" && a.codigo !== "R07" && !a.texto.startsWith("Regra “"));
  if (r.curva === "A" && variacao != null && Math.abs(variacao) > params.R03 + 1e-9)
    alertas.push({ codigo: "R03", texto: "R03: alteração relevante em Curva A exige aprovação.", tipo: "aprovacao" });
  if (estrategicos.includes(r.sku) && !alertas.some((a) => a.codigo === "R04"))
    alertas.push({ codigo: "R04", texto: "R04: produto estratégico exige aprovação humana.", tipo: "aprovacao" });
  aplicaveis.filter((g) => g.exigeAprovacao).forEach((g) =>
    alertas.push({ codigo: null, texto: `Regra “${g.nome}” exige aprovação.`, tipo: "aprovacao" }));
  if (bloqueios.includes(blocoPiso)) alertas.unshift({ codigo: null, texto: blocoPiso, tipo: "bloqueio" });

  const revisaoOutra = alertas.some((a) => a.codigo === "R06" || a.codigo === "R09" || /anomalia|insuficiente|Sem concorrente|ausente/i.test(a.texto) && a.tipo !== "informativo");
  const acao = bloqueios.length || revisaoOutra ? "REVISAR" : variacao! > 0.005 ? "SUBIR" : variacao! < -0.005 ? "BAIXAR" : "MANTER";
  const pedeAprov = alertas.some((a) => a.tipo === "aprovacao");
  const risco = bloqueios.length || revisaoOutra ? "Alto" : pedeAprov || (variacao ?? 0) < 0 ? "Médio" : "Baixo";
  const precisaRampa = bloqueios.includes(blocoPiso) && piso > atual;
  const etapas = precisaRampa ? Math.ceil(Math.log(piso / atual) / Math.log(1 + sobe)) : 0;

  return {
    ...r,
    acao,
    risco,
    preco_minimo: piso,
    preco_alvo: r2(precoAlvo),
    preco_sugerido: sugerido,
    variacao,
    limite_inferior: r2(atual * (1 - desce)),
    limite_superior: r2(atual * (1 + sobe)),
    margem: { ...r.margem, atual: margem(atual), minima: minima, alvo, projetada: sugerido != null ? margem(sugerido) : null },
    margin_formula: formula,
    alertas,
    bloqueios,
    regra_aplicada: vencedora ? vencedora.nome : r.regra_aplicada,
    proposta: {
      ...r.proposta,
      rampa: precisaRampa
        ? { proposta: true, aumento_necessario: piso / atual - 1, etapas, preco_etapa_1: down2(atual * (1 + sobe)), intervalo_dias: params.R08, texto: "" }
        : null,
    },
  };
}

const COUNTERPART: Partial<Record<Recomendacao["canal"], Recomendacao["canal"]>> = { "Loja física": "E-commerce", "E-commerce": "Loja física" };

/**
 * R07 depende de dois canais ao mesmo tempo, por isso roda depois de recalcular cada item,
 * como no motor (recommendation_service.py: preço sugerido × preço atual do outro canal).
 * Só age nos itens recalculados; os demais já trazem a R07 do motor.
 */
export function applyChannelGap(recs: Recomendacao[], params: ParametrosBase): Recomendacao[] {
  const byKey = new Map(recs.map((r) => [`${r.sku}|${r.canal}`, r]));
  return recs.map((r) => {
    if (!r.margin_formula || r.preco_sugerido == null) return r;
    const counterpart = COUNTERPART[r.canal];
    const other = counterpart && byKey.get(`${r.sku}|${counterpart}`);
    if (!other || !(other.preco_atual > 0)) return r;
    if (Math.abs(r.preco_sugerido / other.preco_atual - 1) <= params.R07) return r;
    return {
      ...r,
      alertas: [...r.alertas, { codigo: "R07", texto: "R07: diferença entre loja física e e-commerce exige aprovação.", tipo: "aprovacao" }],
      risco: r.risco === "Baixo" ? "Médio" : r.risco,
    };
  });
}

/** Recalcula a base inteira: regras, parâmetros, estratégicos e fórmula de margem. */
export function recalculateAll(
  recs: Recomendacao[], regras: RegraPreco[], params: ParametrosBase, estrategicos: string[], formula: MarginFormula, forcar = false,
) {
  return applyChannelGap(recs.map((r) => recalcular(r, regras, params, forcar, estrategicos, formula)), params);
}
