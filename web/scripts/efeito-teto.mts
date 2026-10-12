// Efeito do teto de mercado na base oficial e nos 12 casos da revisão cega (Semana 4).
import { readFileSync } from "node:fs";
import { recalculateAll } from "../src/lib/recalcular";
import { PARAMETROS_PADRAO } from "../src/lib/types";
const d = JSON.parse(readFileSync("./src/data/oficial.json", "utf8"));
const ids = ["PP-0034|Loja física","PP-0003|Loja física","PP-0014|Marketplace","PP-0024|Loja física","PP-0025|Loja física","PP-0030|E-commerce","PP-0004|Loja física","PP-0022|Marketplace","PP-0008|Marketplace","PP-0037|Loja física","PP-0031|E-commerce","PP-0015|E-commerce"];
const allan = ["BAIXAR","MANTER","BAIXAR","MANTER","MANTER","MANTER","BAIXAR","BAIXAR","BAIXAR","MANTER","MANTER","MANTER"];
const caio = ["BAIXAR","BAIXAR","REVISAR","BAIXAR","BAIXAR","MANTER","BAIXAR","BAIXAR","BAIXAR","BAIXAR","BAIXAR","BAIXAR"];
for (const f of ["contribution","gross"] as const) for (const teto of [false,true]) {
  const out = recalculateAll(d.recomendacoes, [], { ...PARAMETROS_PADRAO, tetoMercado: teto }, [], f, true);
  const sub = out.filter((r) => r.acao === "SUBIR");
  const acima = sub.filter((r) => r.preco_sugerido! > r.preco_mercado! + 0.005).length;
  const por: Record<string, number> = {};
  out.forEach((r) => { por[r.acao] = (por[r.acao] || 0) + 1; });
  const m12 = ids.map((id) => out.find((r) => r.id === id)!);
  const ag = (h: string[]) => m12.filter((r, i) => r.acao === h[i]).length;
  console.log(f, teto ? "COM teto" : "sem teto", JSON.stringify(por), "| SUBIR acima do mercado:", acima, "/", sub.length, "| 12 casos: acordo Allan", ag(allan), "Caio", ag(caio));
}
