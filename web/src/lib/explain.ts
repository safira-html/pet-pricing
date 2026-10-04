import { moeda, pct } from "./format";
import type { Acao, Alerta, Recomendacao } from "./types";

/** Nome de cada regra da base, em linguagem de operação. */
export const REGRAS: Record<string, { nome: string; frase: string }> = {
  R01: { nome: "Margem mínima", frase: "O preço nunca pode deixar a margem abaixo da mínima do produto." },
  R02: { nome: "Variação máxima", frase: "Cada decisão muda o preço em no máximo 5%." },
  R03: { nome: "Curva A", frase: "Mudanças acima de 3% em produtos curva A pedem aprovação." },
  R04: { nome: "Produto estratégico", frase: "Produtos estratégicos sempre passam por aprovação." },
  R05: { nome: "Concorrente indisponível", frase: "Oferta indisponível não entra no preço de mercado." },
  R06: { nome: "Coleta antiga", frase: "Preço de concorrente com mais de 48 h fica fora do cálculo." },
  R07: { nome: "Coerência entre canais", frase: "Diferença acima de 5% entre loja física e e-commerce pede aprovação." },
  R08: { nome: "Intervalo entre mudanças", frase: "O mesmo produto só muda de preço a cada 3 dias." },
  R09: { nome: "Promoção", frase: "Produto em campanha não é reprecificado sem revisão." },
  R10: { nome: "Salto do concorrente", frase: "Variação de mais de 20% em 24 h num concorrente é tratada como anomalia." },
  R11: { nome: "Estoque baixo", frase: "Baixar preço com menos de 15 dias de estoque pede aprovação." },
  R12: { nome: "Estoque parado", frase: "Mais de 90 dias de estoque e vendas caindo há 3 meses vira prioridade." },
};

export const ACAO_ROTULO: Record<Acao, string> = {
  SUBIR: "Subir",
  BAIXAR: "Baixar",
  MANTER: "Manter",
  REVISAR: "Revisar",
};

/** Limite de variação por decisão que vale para o item (R02, ou o de uma regra de grupo). */
export function limiteDe(r: Recomendacao) {
  return Math.round((r.limite_superior / r.preco_atual - 1) * 1000) / 1000;
}
export const limiteTxt = (r: Recomendacao) => pct(limiteDe(r), limiteDe(r) * 100 % 1 ? 1 : 0);

/** Título curto de um alerta: código e nome da regra, regra do gestor ou piso de margem. */
export function rotuloAlerta(a: Alerta): string {
  if (a.codigo) return `${a.codigo} · ${REGRAS[a.codigo]?.nome ?? ""}`;
  if (a.texto.startsWith("Regra “")) return "Regra do gestor";
  return "Preço mínimo além do limite por decisão";
}

export function fraseAlerta(a: Alerta, r?: Recomendacao): string {
  const t = a.texto;
  if (t.startsWith("Piso de margem")) return `Para chegar à margem mínima seria preciso subir mais que o limite de ${r ? limiteTxt(r) : "variação"} por decisão.`;
  if (t.startsWith("R10: histórico")) return "Só há uma coleta por concorrente, então não dá para checar saltos de preço em 24 h.";
  if (t.startsWith("R09")) return "Produto em promoção: precisa de revisão antes de mudar o preço.";
  if (t.startsWith("R03")) return "Produto curva A com mudança relevante: precisa de aprovação.";
  if (t.startsWith("R07")) return "A sugestão afasta loja física e e-commerce além do limite entre canais: precisa de aprovação.";
  if (t.startsWith("R06")) return "Há preço de concorrente com mais de 48 h; foi descartado.";
  if (t.startsWith("R11")) return "Baixar com pouco estoque: precisa de aprovação.";
  if (t.startsWith("R12")) return "Estoque alto e vendas caindo: priorizar análise.";
  if (t.startsWith("R08")) return "O preço mudou há pouco tempo: respeite o intervalo entre mudanças.";
  if (t.startsWith("R04")) return "Produto estratégico: sempre com aprovação.";
  return t.replace(/^R\d+:\s*/, "");
}

/** Posição do preço atual frente ao mercado. */
export function posicaoMercado(r: Recomendacao): "acima" | "abaixo" | "alinhado" | "sem mercado" {
  if (r.diferenca_mercado == null) return "sem mercado";
  if (r.diferenca_mercado > 0.01) return "acima";
  if (r.diferenca_mercado < -0.01) return "abaixo";
  return "alinhado";
}

/** Explicação determinística em português claro, montada só com números da recomendação. */
export function explicar(r: Recomendacao): string[] {
  const linhas: string[] = [];
  const pos = posicaoMercado(r);
  if (r.preco_mercado != null) {
    const dif = Math.abs(r.diferenca_mercado ?? 0);
    linhas.push(
      pos === "alinhado"
        ? `O preço atual (${moeda(r.preco_atual)}) está alinhado ao mercado (mediana de ${moeda(r.preco_mercado)} entre ${r.concorrencia.validos} concorrentes).`
        : `O preço atual (${moeda(r.preco_atual)}) está ${pct(dif)} ${pos} da mediana do mercado (${moeda(r.preco_mercado)}, ${r.concorrencia.validos} concorrentes).`,
    );
  } else {
    linhas.push("Não há preço de concorrente válido; a referência é só a margem alvo.");
  }
  const abaixoMin = r.margem.atual < r.margem.minima;
  linhas.push(
    `A margem hoje é ${pct(r.margem.atual)}, ${abaixoMin ? "abaixo" : "acima"} da mínima de ${pct(r.margem.minima)} — o preço mínimo para a margem é ${moeda(r.preco_minimo)}.`,
  );
  if (r.preco_sugerido != null && r.acao !== "REVISAR") {
    if (r.acao === "MANTER") linhas.push("A diferença para o preço ideal é menor que 0,5%, então o melhor é manter.");
    else
      linhas.push(
        `Sugestão: ${moeda(r.preco_sugerido)} (${pct(r.variacao, 1, true)}), equilibrando a margem alvo (${moeda(r.preco_alvo)}) e o mercado, dentro do limite de ${limiteTxt(r)}.`,
      );
  }
  if (r.acao === "REVISAR") {
    const motivo = r.alertas.find((a) => a.tipo === "bloqueio") ?? r.alertas.find((a) => a.tipo === "aprovacao");
    linhas.push(`Precisa de revisão: ${motivo ? fraseAlerta(motivo, r).toLowerCase() : "há sinais que pedem análise humana."}`);
    if (r.proposta.rampa) linhas.push(textoRampa(r));
  }
  const cob = r.estoque.cobertura_dias;
  if (cob < 15) linhas.push(`Estoque curto: ${cob} dias de cobertura.`);
  else if (cob > 90) linhas.push(`Estoque alto: ${cob} dias de cobertura.`);
  return linhas;
}

export function textoRampa(r: Recomendacao): string {
  const rp = r.proposta.rampa!;
  return `Proposta: subir em ${rp.etapas} etapas de até ${limiteTxt(r)}, com ${rp.intervalo_dias} dias entre elas, até o mínimo de ${moeda(r.preco_minimo)}.`;
}

/** Uma frase que responde, sozinha, "o que fazer e por quê". */
export function manchete(r: Recomendacao): string {
  const pos = posicaoMercado(r);
  const difMercado = r.diferenca_mercado != null ? pct(Math.abs(r.diferenca_mercado)) : null;
  if (r.proposta.rampa && r.preco_sugerido == null) {
    return `Para voltar à margem mínima, o preço precisaria subir ${pct(r.proposta.rampa.aumento_necessario)} — mais que os ${limiteTxt(r)} permitidos por decisão. Proposta: subir em ${r.proposta.rampa.etapas} etapas.`;
  }
  if (r.acao === "REVISAR") {
    const motivo = r.alertas.find((a) => a.tipo === "bloqueio") ?? r.alertas.find((a) => a.tipo === "aprovacao");
    const base = r.preco_sugerido != null ? `O cálculo chega a ${moeda(r.preco_sugerido)}, mas precisa de uma pessoa: ` : "Precisa de uma pessoa: ";
    return base + (motivo ? fraseAlerta(motivo, r).replace(/\.$/, "").toLowerCase() : "há sinais que pedem análise") + ".";
  }
  if (r.acao === "MANTER") return `Manter em ${moeda(r.preco_atual)}: o preço já equilibra a margem e o mercado.`;
  if (r.acao === "SUBIR") {
    const porque = r.margem.atual < r.margem.minima
      ? `a margem está em ${pct(r.margem.atual)}, abaixo da mínima de ${pct(r.margem.minima)}`
      : pos === "abaixo" ? `o preço está ${difMercado} abaixo do mercado` : `há espaço até o preço ideal de ${moeda(r.preco_alvo)}`;
    return `Subir ${pct(r.variacao ?? 0)} para ${moeda(r.preco_sugerido)}: ${porque}.`;
  }
  if (pos === "acima") return `Baixar ${pct(Math.abs(r.variacao ?? 0))} para ${moeda(r.preco_sugerido)}: o preço está ${difMercado} acima do mercado e a margem continua acima da mínima.`;
  return `Baixar ${pct(Math.abs(r.variacao ?? 0))} para ${moeda(r.preco_sugerido)}: aproxima o preço ideal de ${moeda(r.preco_alvo)} e a margem continua acima da mínima.`;
}

export function resumoCurto(r: Recomendacao): string {
  if (r.acao === "REVISAR") {
    const b = r.alertas.find((a) => a.tipo === "bloqueio") ?? r.alertas.find((a) => a.tipo === "aprovacao");
    return b ? fraseAlerta(b, r) : "Sinais pedem análise humana.";
  }
  if (r.acao === "MANTER") return "Preço já equilibra margem e mercado.";
  const pos = posicaoMercado(r);
  if (r.acao === "SUBIR")
    return r.margem.atual < r.margem.minima ? "Margem abaixo da mínima; subir recompõe." : `Espaço de margem; preço ${pos} do mercado.`;
  return pos === "acima" ? "Acima do mercado com margem folgada; baixar ganha competitividade." : "Ajuste para competitividade.";
}
