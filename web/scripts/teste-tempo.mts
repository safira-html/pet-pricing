// Confere o modelo de tempo com a base oficial (margem bruta) e a conta feita à mão.
import { readFileSync } from "node:fs";
import { recalculateAll } from "../src/lib/recalcular";
import { PARAMETROS_PADRAO } from "../src/lib/types";
import { elegivelPiloto } from "../src/lib/store";
import { estimateReviewTime } from "../src/lib/tempo";
const d = JSON.parse(readFileSync("./src/data/oficial.json", "utf8"));
const recs = recalculateAll(d.recomendacoes, [], PARAMETROS_PADRAO, [], "gross", true);
const elegiveis = new Set(recs.filter((r) => elegivelPiloto(r, 0.03).elegivel).map((r) => r.id));
const t = estimateReviewTime(recs, elegiveis);
console.log(t);
const esperado = { items: 120, auto: 53, quick: 30, reason: 37, ramp: 0, manualMin: 1080, copilotMin: 268, autopilotMin: 228.25 };
for (const [k, v] of Object.entries(esperado)) if ((t as unknown as Record<string, number>)[k] !== v) throw new Error(`${k}: ${(t as unknown as Record<string, number>)[k]} ≠ ${v}`);
console.log("modelo de tempo confere");
