// Quanto de cada base cai em cada grupo da fila e quanto o piloto automático poderia cobrir, por fórmula de margem.
import { readFileSync } from "node:fs";
import { recalculateAll } from "../src/lib/recalcular";
import { PARAMETROS_PADRAO } from "../src/lib/types";
import { queueGroup } from "../src/lib/queue";
import { elegivelPiloto } from "../src/lib/store";
for (const cen of ["oficial", "sintetico"]) {
  const d = JSON.parse(readFileSync(`./src/data/${cen}.json`, "utf8"));
  for (const f of ["contribution", "gross"] as const) {
    const out = recalculateAll(d.recomendacoes, [], PARAMETROS_PADRAO, [], f, true);
    const g: Record<string, number> = { rapida: 0, motivo: 0, rampa: 0 };
    out.forEach((r) => { g[queueGroup(r, false)]++; });
    const auto = out.filter((r) => elegivelPiloto(r, 0.03).elegivel).length;
    const abaixo = out.filter((r) => r.preco_atual < r.preco_minimo - 0.005).length;
    console.log(cen, f, JSON.stringify(g), "| piloto elegível (teto 3%):", auto, "| preço atual abaixo do mínimo:", abaixo);
  }
}
