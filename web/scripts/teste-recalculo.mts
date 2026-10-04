import { readFileSync } from "node:fs";
import { recalculateAll } from "../src/lib/recalcular";
import { PARAMETROS_PADRAO } from "../src/lib/types";

// Referência da margem bruta: motor do Allan rodado com impostos, frete e taxa zerados
// (api/scripts/export_gross_reference.py).
const gross = JSON.parse(readFileSync("./scripts/gross-reference.json", "utf8"));

for (const cen of ["oficial", "sintetico"]) {
  const d = JSON.parse(readFileSync(`./src/data/${cen}.json`, "utf8"));
  for (const formula of ["contribution", "gross"] as const) {
    let ok = 0; const erros: string[] = [];
    const todos = recalculateAll(d.recomendacoes, [], PARAMETROS_PADRAO, [], formula, true);
    for (const [i, r] of d.recomendacoes.entries()) {
      const ref = formula === "gross" ? gross[cen][r.id] : r;
      const x = todos[i];
      const igual = x.acao === ref.acao && x.preco_sugerido === ref.preco_sugerido && x.preco_minimo === ref.preco_minimo && x.risco === ref.risco;
      if (igual) ok++; else erros.push(`${r.id}: motor ${ref.acao}/${ref.preco_sugerido}/${ref.preco_minimo}/${ref.risco} × prévia ${x.acao}/${x.preco_sugerido}/${x.preco_minimo}/${x.risco}`);
    }
    console.log(cen, formula, `${ok}/${d.recomendacoes.length} idênticos`); erros.slice(0, 8).forEach((e) => console.log("  ", e));
  }
}
