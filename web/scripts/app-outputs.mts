// Saída do app (versão no ar) para cada combinação: usada para sortear e congelar a rodada 2 da revisão cega.
// Uso: npx tsx scripts/app-outputs.mts <arquivo de saída .json>
import { readFileSync, writeFileSync } from "node:fs";
import { recalculateAll } from "../src/lib/recalcular";
import { PARAMETROS_PADRAO } from "../src/lib/types";
import { elegivelPiloto } from "../src/lib/store";

const d = JSON.parse(readFileSync("./src/data/oficial.json", "utf8"));
const out: Record<string, unknown> = {};
for (const formula of ["gross", "contribution"] as const) {
  const recs = recalculateAll(d.recomendacoes, [], { ...PARAMETROS_PADRAO, tetoMercado: true }, [], formula, true);
  for (const r of recs) {
    const o = (out[r.id] ??= {}) as Record<string, unknown>;
    o[formula] = {
      acao: r.acao, preco_sugerido: r.preco_sugerido, preco_minimo: r.preco_minimo, preco_alvo: r.preco_alvo,
      risco: r.risco, rampa: !!r.proposta.rampa, piloto: elegivelPiloto(r, 0.03).elegivel,
    };
  }
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log("combinações:", Object.keys(out).length);
