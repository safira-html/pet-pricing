// Números da Semana 4 (rodada 2): por base e fórmula, com o teto de mercado ligado.
// Uso: npx tsx scripts/semana4-v2-numeros.mts  → grava ../../[04] outputs/semana-4/data/v2-numbers.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { estimateElasticity } from "../src/lib/impact";
import { FAIXA_COMPETITIVA } from "../src/lib/metricas";
import { monthlyGain, queueGroup } from "../src/lib/queue";
import { recalculateAll } from "../src/lib/recalcular";
import { elegivelPiloto } from "../src/lib/store";
import { estimateReviewTime, TIME_ASSUMPTIONS } from "../src/lib/tempo";
import { PARAMETROS_PADRAO } from "../src/lib/types";

const out: Record<string, unknown> = {};
for (const base of ["oficial", "sintetico"]) {
  const d = JSON.parse(readFileSync(`./src/data/${base}.json`, "utf8"));
  const elasticity = estimateElasticity(d.recomendacoes);
  for (const formula of ["gross", "contribution"] as const) {
    const recs = recalculateAll(d.recomendacoes, [], { ...PARAMETROS_PADRAO, tetoMercado: true }, [], formula, true);
    const acoes: Record<string, number> = {};
    recs.forEach((r) => { acoes[r.acao] = (acoes[r.acao] ?? 0) + 1; });
    const grupos: Record<string, number> = { rapida: 0, motivo: 0, rampa: 0 };
    recs.forEach((r) => { grupos[queueGroup(r, false)]++; });
    const elegiveis = new Set(recs.filter((r) => elegivelPiloto(r, 0.03).elegivel).map((r) => r.id));
    const naFaixa = (preco: (r: (typeof recs)[number]) => number) =>
      recs.filter((r) => r.preco_mercado != null && Math.abs(preco(r) / r.preco_mercado - 1) <= FAIXA_COMPETITIVA).length;
    const aplica = (r: (typeof recs)[number]) => (r.acao === "SUBIR" || r.acao === "BAIXAR") && r.preco_sugerido != null;
    const ganhoDe = (acao: string) => recs.reduce((s, r) => s + (aplica(r) && r.acao === acao ? monthlyGain(r, elasticity) ?? 0 : 0), 0);
    const ganho = ganhoDe("SUBIR") + ganhoDe("BAIXAR");
    const tempo = estimateReviewTime(recs, elegiveis);
    const sens = [0.5, 1, 2].map((q) => estimateReviewTime(recs, elegiveis, { ...TIME_ASSUMPTIONS, quickMin: q }));
    out[`${base}.${formula}`] = {
      itens: recs.length, acoes, grupos,
      pilotoElegivel: elegiveis.size,
      abaixoDoMinimoHoje: recs.filter((r) => r.preco_atual < r.preco_minimo - 0.005).length,
      faixaHoje: naFaixa((r) => r.preco_atual),
      faixaDepois: naFaixa((r) => (aplica(r) ? r.preco_sugerido! : r.preco_atual)),
      ganhoMensalEstimado: Math.round(ganho), ganhoSubir: Math.round(ganhoDe("SUBIR")), ganhoBaixar: Math.round(ganhoDe("BAIXAR")),
      tempoMin: { manual: tempo.manualMin, copiloto: tempo.copilotMin, piloto: tempo.autopilotMin },
      sensibilidadeAprovacaoRapida: sens.map((x, i) => ({ minPorAprovacao: [0.5, 1, 2][i], copiloto: x.copilotMin, piloto: x.autopilotMin })),
    };
  }
}
const dir = join(homedir(), "Documents/popular-pet/[04] outputs/semana-4/data");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "v2-numbers.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
