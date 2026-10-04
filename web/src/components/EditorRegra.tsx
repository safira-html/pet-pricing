"use client";

import clsx from "clsx";
import { Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Select } from "./Select";
import { AcaoBadge, Botao } from "./ui";
import { dataBR, moeda, pct } from "@/lib/format";
import { recalculateAll } from "@/lib/recalcular";
import { usePricing } from "@/lib/store";
import type { Escopo, RegraPreco } from "@/lib/types";

const ESCOPOS: { valor: Escopo; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos os produtos" },
  { valor: "curva", rotulo: "Curva ABC" },
  { valor: "categoria", rotulo: "Categoria" },
  { valor: "marca", rotulo: "Marca" },
  { valor: "canal", rotulo: "Canal" },
  { valor: "sku", rotulo: "Produto específico" },
];
const DURACAO = [
  { valor: "0", rotulo: "Sem data de fim" },
  { valor: "7", rotulo: "7 dias" },
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
];

type Rascunho = Omit<RegraPreco, "id" | "autor" | "atualizadaEm"> & { id?: string };

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function EditorRegra({ inicial, onFechar }: { inicial?: RegraPreco; onFechar: () => void }) {
  const p = usePricing();
  const ref = p.base.data_referencia.slice(0, 10);
  const [g, setG] = useState<Rascunho>(
    inicial ?? {
      nome: "", escopo: "curva", valores: [], margemMinima: 0.2, margemAlvo: 0.3, subidaMax: 0.05, reducaoMax: 0.05,
      inicio: ref, fim: null, prioridade: 3, exigeAprovacao: false, ativa: true, justificativa: "",
    },
  );
  // A duração vem do início e do fim salvos, para editar não mudar a data de fim sem querer.
  const [duracao, setDuracao] = useState(() => {
    if (!inicial?.fim) return "0";
    const dias = Math.round((new Date(`${inicial.fim}T12:00:00`).getTime() - new Date(`${inicial.inicio.slice(0, 10)}T12:00:00`).getTime()) / 86400000);
    return DURACAO.some((d) => d.valor === String(dias)) ? String(dias) : "manter";
  });

  const opcoesValor = useMemo(() => {
    const campo = (r: (typeof p.recs)[number]) => ({ todos: "", curva: r.curva, categoria: r.categoria, marca: r.marca, canal: r.canal, sku: r.sku })[g.escopo];
    const vals = [...new Set(p.base.recomendacoes.map(campo))].filter(Boolean).sort();
    return vals.map((v) => ({
      valor: v,
      rotulo: g.escopo === "curva" ? `Curva ${v}` : g.escopo === "sku" ? `${v} · ${p.base.recomendacoes.find((r) => r.sku === v)?.produto}` : v,
    }));
  }, [g.escopo, p.base.recomendacoes]);

  // Maior taxa de canal entre os itens cobertos: limita a margem possível (preço = custo ÷ (1 − taxa − margem)).
  const taxaMax = useMemo(() => {
    const cobertos = p.base.recomendacoes.filter((r) => g.escopo === "todos" || g.valores.includes({ todos: "", curva: r.curva, categoria: r.categoria, marca: r.marca, canal: r.canal, sku: r.sku }[g.escopo]));
    if (!cobertos.length) return null;
    return p.marginFormula === "gross" ? 0 : Math.max(...cobertos.map((r) => r.custo.taxa_canal));
  }, [g, p.base.recomendacoes, p.marginFormula]);

  const minBase = useMemo(() => {
    const cobertos = p.base.recomendacoes.filter((r) => g.escopo === "todos" || g.valores.includes({ todos: "", curva: r.curva, categoria: r.categoria, marca: r.marca, canal: r.canal, sku: r.sku }[g.escopo]));
    return cobertos.length ? Math.max(...cobertos.map((r) => r.margem.minima)) : null;
  }, [g, p.base.recomendacoes]);

  const erros: string[] = [];
  if (!g.nome.trim()) erros.push("Dê um nome à regra.");
  if (g.escopo !== "todos" && !g.valores.length) erros.push("Escolha a quem a regra se aplica.");
  if (g.margemAlvo < g.margemMinima) erros.push("A margem alvo precisa ser igual ou maior que a mínima.");
  if (taxaMax != null && Math.max(g.margemMinima, g.margemAlvo) >= 1 - taxaMax - 0.01)
    erros.push(`Com a taxa de canal de ${pct(taxaMax, 0)}, a margem precisa ficar abaixo de ${pct(1 - taxaMax - 0.01, 0)}.`);
  if (g.subidaMax < 0.005) erros.push("A subida máxima precisa ser de pelo menos 0,5%.");
  if (g.justificativa.trim().length < 5) erros.push("Escreva o motivo da regra.");

  // Prévia: compara as recomendações atuais com as que existiriam com esta regra.
  const regraFinal: RegraPreco = {
    ...g, id: g.id ?? "previa", autor: "", atualizadaEm: "",
    fim: duracao === "manter" ? inicial?.fim ?? null : duracao === "0" ? null : somarDias(g.inicio, Number(duracao)),
  };
  const chaveRegra = JSON.stringify(regraFinal);
  const previa = useMemo(() => {
    if (erros.length && !(erros.length === 1 && erros[0].startsWith("Escreva o motivo"))) return null;
    const outras = p.regrasPreco.filter((x) => x.id !== g.id);
    const depois = recalculateAll(p.base.recomendacoes, [...outras, regraFinal], p.parametros, p.estrategicos, p.marginFormula);
    const mudam = depois
      .map((d, i) => ({ antes: p.recs[i], depois: d }))
      .filter(({ antes, depois }) => antes.acao !== depois.acao || antes.preco_sugerido !== depois.preco_sugerido);
    return { mudam, cobertos: depois.filter((d) => d.regra_aplicada === regraFinal.nome).length };
  }, [chaveRegra, p.recs, p.regrasPreco, p.parametros, p.estrategicos, p.marginFormula]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = () => {
    // autor e data são preenchidos pelo store
    const { autor: _autor, atualizadaEm: _data, ...dados } = regraFinal; // eslint-disable-line @typescript-eslint/no-unused-vars
    p.salvarRegraPreco({ ...dados, id: g.id });
    onFechar();
  };

  const campoPct = (rotulo: string, chave: "margemMinima" | "margemAlvo" | "subidaMax" | "reducaoMax", max: number, dica?: string) => (
    <label className="block text-sm font-medium text-tinta">
      {rotulo}
      <span className="mt-1.5 flex items-center rounded-[10px] border border-linha bg-superficie focus-within:border-roxo">
        <input type="number" inputMode="decimal" min={0} max={max * 100} step={0.5} value={Math.round(g[chave] * 1000) / 10}
          onChange={(e) => setG({ ...g, [chave]: Math.min(max, Math.max(0, Number(e.target.value) / 100)) })}
          className="num h-11 w-full rounded-[10px] bg-transparent px-3 text-sm outline-none" />
        <span className="pr-3 text-suave">%</span>
      </span>
      {dica && <span className="mt-1 block text-xs font-normal text-suave">{dica}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-tinta/30" onClick={onFechar}>
      <aside role="dialog" aria-modal="true" aria-label="Regra de preço" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[720px] flex-col bg-fundo shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-linha bg-superficie px-6 py-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-roxo uppercase">Regra por grupo de produtos</p>
            <h2 className="mt-1 text-xl font-semibold">{inicial ? "Editar regra" : "Nova regra"}</h2>
          </div>
          <button onClick={onFechar} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-roxo-50" aria-label="Fechar"><X size={20} /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-4 rounded-[15px] border border-linha bg-superficie p-5">
            <label className="block text-sm font-medium text-tinta">Nome da regra
              <input value={g.nome} onChange={(e) => setG({ ...g, nome: e.target.value })} placeholder="Ex.: Proteger margem da curva A"
                className="mt-1.5 h-11 w-full rounded-[10px] border border-linha-forte px-3 text-sm outline-none focus:border-roxo" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select rotulo="Aplicar a" valor={g.escopo} opcoes={ESCOPOS} onChange={(v) => setG({ ...g, escopo: v as Escopo, valores: [] })} />
              {g.escopo !== "todos" && (
                <Select rotulo="Quais" multiplo valor={g.valores} opcoes={opcoesValor} onChange={(v) => setG({ ...g, valores: v as string[] })} />
              )}
            </div>
          </section>

          <section className="grid gap-4 rounded-[15px] border border-linha bg-superficie p-5 sm:grid-cols-2">
            {campoPct("Margem mínima", "margemMinima", 0.89, minBase != null && g.margemMinima < minBase ? `Abaixo da mínima da base (${pct(minBase)}): nesse caso vale a da base.` : "Pode subir em relação à base. Para baixar, use uma exceção com aprovação.")}
            {campoPct("Margem alvo", "margemAlvo", 0.89, "Preço ideal que o sistema persegue.")}
            {campoPct("Subida máxima por decisão", "subidaMax", 0.05, "Até 5% (regra R02).")}
            {campoPct("Redução máxima por decisão", "reducaoMax", 0.05, "Até 5% (regra R02).")}
          </section>

          <section className="grid gap-4 rounded-[15px] border border-linha bg-superficie p-5 sm:grid-cols-2">
            <Select rotulo="Duração" valor={duracao} onChange={(v) => setDuracao(v as string)}
              opcoes={duracao === "manter" && inicial?.fim ? [{ valor: "manter", rotulo: `Até ${dataBR(inicial.fim)} (como está)` }, ...DURACAO] : DURACAO} />
            <Select rotulo="Prioridade" valor={String(g.prioridade)} onChange={(v) => setG({ ...g, prioridade: Number(v) })}
              opcoes={[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), rotulo: `${n}${n === 1 ? " · baixa" : n === 5 ? " · alta" : ""}`, detalhe: n === 5 ? "Vence outras regras do mesmo nível" : undefined }))} />
            <div className="flex items-center justify-between gap-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-medium text-tinta">Exigir aprovação</span>
                <span className="text-xs text-suave">Os itens cobertos nunca vão sozinhos pelo piloto automático.</span>
              </span>
              <button role="switch" aria-checked={g.exigeAprovacao} aria-label="Exigir aprovação" onClick={() => setG({ ...g, exigeAprovacao: !g.exigeAprovacao })}
                className={clsx("relative h-8 w-14 shrink-0 rounded-full transition-colors", g.exigeAprovacao ? "bg-subir" : "bg-linha-forte")}>
                <span className={clsx("absolute top-1 size-6 rounded-full bg-white shadow transition-all", g.exigeAprovacao ? "left-7" : "left-1")} />
              </button>
            </div>
            <label className="block text-sm font-medium text-tinta sm:col-span-2">Motivo <span className="font-normal text-suave">(fica no histórico)</span>
              <input value={g.justificativa} onChange={(e) => setG({ ...g, justificativa: e.target.value })} placeholder="Ex.: Categoria com ruptura frequente; preservar margem"
                className="mt-1.5 h-11 w-full rounded-[10px] border border-linha-forte px-3 text-sm outline-none focus:border-roxo" />
            </label>
          </section>

          <section className="rounded-[15px] border border-linha bg-superficie p-5">
            <h3 className="text-sm font-semibold">Prévia do impacto</h3>
            {!previa ? (
              <p className="mt-2 text-sm text-suave">Complete os campos para ver o efeito nas recomendações.</p>
            ) : previa.mudam.length === 0 ? (
              <p className="mt-2 text-sm text-texto">{previa.cobertos} itens passam a usar esta regra, mas nenhuma recomendação muda.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-texto"><strong className="text-tinta">{previa.mudam.length} itens mudam</strong> de recomendação ou de preço sugerido.</p>
                <ul className="mt-3 divide-y divide-linha text-sm">
                  {previa.mudam.slice(0, 8).map(({ antes, depois }) => (
                    <li key={antes.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0"><span className="font-medium text-tinta">{antes.produto}</span> <span className="text-suave">· {antes.canal}</span></span>
                      <span className="flex items-center gap-2 text-xs">
                        <AcaoBadge acao={antes.acao} /> <span className="num text-suave">{moeda(antes.preco_sugerido)}</span>
                        <span aria-hidden>→</span>
                        <AcaoBadge acao={depois.acao} /> <span className="num font-semibold text-tinta">{moeda(depois.preco_sugerido)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {previa.mudam.length > 8 && <p className="mt-2 text-xs text-suave">E mais {previa.mudam.length - 8}.</p>}
              </>
            )}
            <p className="mt-3 text-xs text-suave">Prévia com a mesma conta do motor; o cálculo oficial roda no backend.</p>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-linha bg-superficie px-6 py-4">
          <p className="text-sm text-piso">{erros[0] ?? ""}</p>
          <div className="flex gap-2">
            <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
            <Botao disabled={erros.length > 0} onClick={salvar}><Save size={16} /> Salvar regra</Botao>
          </div>
        </footer>
      </aside>
    </div>
  );
}
