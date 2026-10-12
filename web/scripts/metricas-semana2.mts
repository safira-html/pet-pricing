// Metas da Semana 2 medidas com o motor/prévia: faixa competitiva (±2% da mediana) antes e depois de aplicar as sugestões que não pedem revisão.
import { readFileSync } from "node:fs";
import { recalculateAll } from "../src/lib/recalcular";
import { PARAMETROS_PADRAO } from "../src/lib/types";
for (const cen of ["oficial", "sintetico"]) {
  const d = JSON.parse(readFileSync(`./src/data/${cen}.json`, "utf8"));
  const antes = d.recomendacoes.filter((r: any) => r.preco_mercado != null && Math.abs(r.preco_atual / r.preco_mercado - 1) <= 0.02).length;
  console.log(cen, "faixa competitiva hoje:", antes, "/", d.recomendacoes.length, `(${(antes / d.recomendacoes.length * 100).toFixed(0)}%)`);
  for (const f of ["contribution", "gross"] as const) for (const teto of [false, true]) {
    const out = recalculateAll(d.recomendacoes, [], { ...PARAMETROS_PADRAO, tetoMercado: teto }, [], f, true);
    let depois = 0, abaixoMin = 0;
    for (const r of out) {
      const aplica = (r.acao === "SUBIR" || r.acao === "BAIXAR") && r.preco_sugerido != null;
      const preco = aplica ? r.preco_sugerido! : r.preco_atual;
      if (r.preco_mercado != null && Math.abs(preco / r.preco_mercado - 1) <= 0.02) depois++;
      if (aplica && preco < r.preco_minimo - 0.005) abaixoMin++;
    }
    console.log("  ", f, teto ? "com teto" : "sem teto", "| faixa depois:", depois, `(${(depois / out.length * 100).toFixed(0)}%)`, "| aplicadas abaixo do mínimo:", abaixoMin);
  }
}
