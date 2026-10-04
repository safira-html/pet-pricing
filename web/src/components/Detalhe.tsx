"use client";

import clsx from "clsx";
import { AlertTriangle, Ban, ChevronLeft, ChevronRight, Info, Sparkles, X } from "lucide-react";
import { PainelDecisao } from "./Decisao";
import { useEffect, useState } from "react";
import { MapaPreco } from "./PriceRuler";
import { AcaoBadge, Botao, ModoBadge, RiscoBadge, SinteticoTag } from "./ui";
import { api, type ExplainResult } from "@/lib/api";
import { explicar, fraseAlerta, rotuloAlerta } from "@/lib/explain";
import { dataBR, dataHoraBR, inteiro, mesCurto, moeda, pct } from "@/lib/format";
import { profitChange, verb, VERDICT_LABEL } from "@/lib/impact";
import { DEFAULT_MARGIN_FORMULA, MARGIN_FORMULAS, marginAt, type MarginFormula } from "@/lib/margin";
import { usePricing } from "@/lib/store";
import type { Recomendacao } from "@/lib/types";

export function Detalhe({ r, onFechar, onAnterior, onProximo, progresso }: {
  r: Recomendacao; onFechar: () => void; onAnterior?: () => void; onProximo?: () => void; progresso?: string;
}) {
  const p = usePricing();
  useEffect(() => p.marcarAbertura(r.id), [r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowRight" && onProximo) onProximo();
      if (e.key === "ArrowLeft" && onAnterior) onAnterior();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar, onAnterior, onProximo]);

  const motivos = explicar(r);
  const eleg = p.eligibility(r);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-tinta/30" onClick={onFechar}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${r.produto}, ${r.canal}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[860px] flex-col overflow-hidden bg-fundo shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-linha bg-superficie px-6 py-5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs text-suave">
              {r.sku} · {r.categoria} · {r.marca} · curva {r.curva} {r.sintetico && <SinteticoTag />}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{r.produto}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-roxo-50 px-2.5 py-0.5 text-xs font-semibold text-roxo">{r.canal}</span>
              <AcaoBadge acao={r.acao} grande />
              <RiscoBadge risco={r.risco} />
              <ModoBadge modo={p.modoDe(r.id)} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {progresso && <span className="mr-2 hidden text-xs text-suave sm:inline">{progresso}</span>}
            <button onClick={onAnterior} disabled={!onAnterior} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-roxo-50 disabled:opacity-30" aria-label="Anterior (←)" title="Anterior (←)"><ChevronLeft size={20} /></button>
            <button onClick={onProximo} disabled={!onProximo} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-roxo-50 disabled:opacity-30" aria-label="Próximo (→)" title="Próximo (→)"><ChevronRight size={20} /></button>
            <button onClick={onFechar} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-roxo-50" aria-label="Fechar (Esc)" title="Fechar (Esc)"><X size={20} /></button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="rounded-[15px] border border-linha bg-superficie p-5">
            <MapaPreco r={r} />
            <ResumoLLM r={r} fatos={motivos} />
            <h3 className="mt-5 text-xs font-semibold tracking-wide text-suave uppercase">Como o sistema chegou aqui</h3>
            <ul className="mt-2 space-y-2 text-sm text-texto">
              {motivos.map((m) => (
                <li key={m} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-roxo" aria-hidden />{m}</li>
              ))}
            </ul>
          </section>

          {r.alertas.length > 0 && (
            <section className="rounded-[15px] border border-linha bg-superficie p-5">
              <h3 className="text-sm font-semibold">Regras que entraram neste caso</h3>
              <ul className="mt-3 space-y-2">
                {r.alertas.map((a) => (
                  <li key={a.texto} className="flex gap-3 text-sm">
                    {a.tipo === "bloqueio" ? <Ban size={16} className="mt-0.5 shrink-0 text-piso" /> : a.tipo === "aprovacao" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-revisar" /> : <Info size={16} className="mt-0.5 shrink-0 text-suave" />}
                    <span>
                      <span className="font-medium text-tinta">{rotuloAlerta(a)}</span>
                      <span className="block text-suave">{fraseAlerta(a, r)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <CustoMargem r={r} />
            <Concorrencia r={r} />
            <Vendas r={r} />
            <Estoque r={r} />
          </div>

          <section className="rounded-[15px] border border-linha bg-superficie p-5 text-sm">
            <h3 className="text-sm font-semibold">Piloto automático</h3>
            {eleg.elegivel ? (
              <p className="mt-2 text-subir">Este caso pode ir para o piloto automático com o teto atual de {pct(p.piloto.teto, 0)}.</p>
            ) : (
              <p className="mt-2 text-suave">Fica em copiloto: {eleg.motivos.join("; ").toLowerCase()}.</p>
            )}
          </section>

          <ResultadoEAprendizado r={r} />
        </div>

        <PainelDecisao r={r} onDecidido={() => onProximo?.()} />
      </aside>
    </div>
  );
}

/** Resumo em texto corrido feito pelo LLM local; só aparece com a API conectada. */
function ResumoLLM({ r, fatos }: { r: Recomendacao; fatos: string[] }) {
  const p = usePricing();
  const [estado, setEstado] = useState<{ carregando: boolean; resultado: ExplainResult | null; erro: string | null }>({ carregando: false, resultado: null, erro: null });
  if (p.statusApi !== "online") return null;
  const pedir = async () => {
    setEstado({ carregando: true, resultado: null, erro: null });
    try {
      const resultado = await api.explain({ product: r.produto, channel: r.canal, action: r.acao, facts: fatos });
      setEstado({ carregando: false, resultado, erro: null });
    } catch (e) {
      setEstado({ carregando: false, resultado: null, erro: e instanceof Error ? e.message : "Não foi possível gerar o resumo." });
    }
  };
  return (
    <div className="mt-4 rounded-[12px] bg-fundo p-3 text-sm">
      {!estado.resultado ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-suave">{estado.erro ?? "Quer um resumo em texto corrido para colar num e-mail ou relatório?"}</p>
          <Botao variante="fantasma" onClick={pedir} disabled={estado.carregando}>
            <Sparkles size={16} /> {estado.carregando ? "Escrevendo…" : "Resumir"}
          </Botao>
        </div>
      ) : (
        <>
          <p className="text-texto">{estado.resultado.text}</p>
          <p className="mt-2 text-xs text-suave">
            {estado.resultado.source === "llm"
              ? "Escrito por um modelo de linguagem local e conferido: todo número citado está nos fatos acima."
              : `Texto montado só com os fatos do motor (${estado.resultado.reason}).`}
          </p>
        </>
      )}
    </div>
  );
}

function ResultadoEAprendizado({ r }: { r: Recomendacao }) {
  const p = usePricing();
  const outcome = p.outcomes.find((o) => o.recId === r.id);
  const learning = p.learningFor(r);
  if (!outcome && (!learning || learning.measured + learning.decisions === 0)) return null;
  const change = outcome ? profitChange(outcome) : null;
  return (
    <section className="rounded-[15px] border border-linha bg-superficie p-5 text-sm">
      <h3 className="text-sm font-semibold">Resultado e aprendizado</h3>
      {outcome && (
        <p className="mt-2 text-texto">
          Preço aplicado em {dataBR(outcome.appliedAt)}: {moeda(outcome.oldPrice)} → <strong className="text-tinta">{moeda(outcome.newPrice)}</strong>.
          Em {outcome.days} dias, vendas de {inteiro(outcome.unitsBefore)} para {inteiro(outcome.unitsAfter)} un./mês (previsto: {inteiro(outcome.unitsExpected)})
          e contribuição {change == null ? "sem base de comparação" : pct(change, 1, true)}: <strong className={outcome.verdict === "worsened" ? "text-piso" : outcome.verdict === "improved" ? "text-subir" : "text-tinta"}>{VERDICT_LABEL[outcome.verdict].toLowerCase()}</strong>.
          {outcome.simulated && <span className="text-suave"> Resultado simulado.</span>}
        </p>
      )}
      {learning && learning.measured + learning.decisions > 0 && (
        <p className="mt-2 text-suave">
          {r.categoria} · {r.canal}: {learning.measured} {learning.measured === 1 ? "mudança medida" : "mudanças medidas"} ({learning.improved} {verb(learning.improved, "melhorou", "melhoraram")}, {learning.worsened} {verb(learning.worsened, "piorou", "pioraram")}) e {learning.decisions} {verb(learning.decisions, "decisão", "decisões")} ({learning.rejected} {verb(learning.rejected, "rejeitada", "rejeitadas")}).
          {learning.effect === "hold" && !learning.dismissed && <strong className="text-piso"> O grupo está fora do piloto automático por aprendizado.</strong>}
          {learning.effect === "suggest" && <strong className="text-subir"> O grupo é candidato ao piloto automático.</strong>}{" "}
          <a href="/aprendizado" className="text-roxo underline underline-offset-2 hover:text-roxo-800 hover:decoration-2">Ver aprendizados</a>
        </p>
      )}
    </section>
  );
}

function CustoMargem({ r }: { r: Recomendacao }) {
  const formula = r.margin_formula ?? DEFAULT_MARGIN_FORMULA;
  const outra: MarginFormula = formula === "contribution" ? "gross" : "contribution";
  const taxa = r.preco_atual * r.custo.taxa_canal;
  const partes = [
    { n: "Reposição", v: r.custo.reposicao, c: "bg-roxo-900" },
    { n: "Impostos", v: r.custo.impostos, c: "bg-roxo-700" },
    { n: "Frete", v: r.custo.frete, c: "bg-roxo" },
    { n: `Taxa do canal (${pct(r.custo.taxa_canal, 1)})`, v: taxa, c: "bg-roxo-100" },
  ];
  const sobra = r.preco_atual - partes.reduce((s, x) => s + x.v, 0);
  return (
    <section className="rounded-[15px] border border-linha bg-superficie p-5">
      <h3 className="text-sm font-semibold">Para onde vai cada real do preço de hoje</h3>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full" role="img" aria-label={`Margem de ${pct(r.margem.atual)}`}>
        {partes.map((x) => <div key={x.n} className={x.c} style={{ width: `${(x.v / r.preco_atual) * 100}%` }} />)}
        <div className={sobra >= 0 ? "bg-limao" : "bg-piso"} style={{ width: `${(Math.max(0, sobra) / r.preco_atual) * 100}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {partes.map((x) => (
          <div key={x.n} className="flex justify-between"><dt className="text-suave">{x.n}</dt><dd className="num">{moeda(x.v)}</dd></div>
        ))}
        <div className="flex justify-between font-semibold text-tinta"><dt>Sobra</dt><dd className="num">{moeda(sobra)}</dd></div>
      </dl>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <Mini rotulo="Atual" valor={pct(r.margem.atual)} destaque={r.margem.atual < r.margem.minima ? "text-piso" : "text-tinta"} />
        <Mini rotulo="Mínima" valor={pct(r.margem.minima)} />
        <Mini rotulo="Alvo" valor={pct(r.margem.alvo)} />
      </div>
      <p className="mt-3 text-xs text-suave">
        Margem em uso: {MARGIN_FORMULAS[formula].label.toLowerCase()}. Pela {MARGIN_FORMULAS[outra].label.toLowerCase()}, seria {pct(marginAt(r, r.preco_atual, outra))}.{" "}
        <a href="/regras#margem" className="text-roxo underline underline-offset-2 hover:text-roxo-800 hover:decoration-2">Por que isso importa</a>
      </p>
    </section>
  );
}

function Mini({ rotulo, valor, destaque = "text-tinta" }: { rotulo: string; valor: string; destaque?: string }) {
  return (
    <div className="rounded-lg bg-fundo py-2">
      <p className="text-suave">{rotulo}</p>
      <p className={clsx("num font-display text-base font-semibold", destaque)}>{valor}</p>
    </div>
  );
}

function Concorrencia({ r }: { r: Recomendacao }) {
  return (
    <section className="rounded-[15px] border border-linha bg-superficie p-5">
      <h3 className="text-sm font-semibold">Concorrência</h3>
      <table className="mt-3 w-full text-xs">
        <thead className="text-left text-suave">
          <tr><th className="pb-1 font-medium">Concorrente</th><th className="pb-1 text-right font-medium">Preço</th><th className="pb-1 text-right font-medium">Frete</th><th className="pb-1 text-right font-medium">Coleta</th></tr>
        </thead>
        <tbody className="divide-y divide-linha">
          {r.concorrentes.map((c) => (
            <tr key={c.nome} className={c.disponivel !== "Sim" ? "text-suave line-through" : ""}>
              <td className="py-1.5">{c.nome}<span className="block text-xs text-suave no-underline">matching {c.matching?.toLowerCase()}</span></td>
              <td className="num py-1.5 text-right">{moeda(c.preco)}</td>
              <td className="num py-1.5 text-right">{moeda(c.frete)}</td>
              <td className="num py-1.5 text-right">{c.coleta ? dataHoraBR(c.coleta) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-suave">Mediana usada: <strong className="text-tinta">{moeda(r.preco_mercado)}</strong>. Frete do concorrente fica fora da comparação, porque a base não traz o frete da Popular Pet.</p>
    </section>
  );
}

function Vendas({ r }: { r: Recomendacao }) {
  const max = Math.max(...r.vendas.map((v) => v.quantidade), 1);
  const ult3 = r.vendas.slice(-3).reduce((s, v) => s + v.quantidade, 0);
  const ant3 = r.vendas.slice(-6, -3).reduce((s, v) => s + v.quantidade, 0);
  const tend = ant3 ? ult3 / ant3 - 1 : null;
  return (
    <section className="rounded-[15px] border border-linha bg-superficie p-5">
      <h3 className="text-sm font-semibold">Vendas nos últimos 12 meses · {r.canal}</h3>
      <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label="Quantidade vendida por mês">
        {r.vendas.map((v) => (
          <div key={v.mes} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t bg-roxo-100" style={{ height: `${(v.quantidade / max) * 64}px` }} title={`${mesCurto(v.mes)}: ${v.quantidade} un.`} />
            <span className="text-xs text-suave">{mesCurto(v.mes)[0]}</span>
          </div>
        ))}
      </div>
      {tend != null && (
        <p className="mt-2 text-xs text-suave">Últimos 3 meses vs. 3 anteriores: <strong className={tend < 0 ? "text-piso" : "text-subir"}>{pct(tend, 1, true)}</strong></p>
      )}
    </section>
  );
}

function Estoque({ r }: { r: Recomendacao }) {
  const cob = r.estoque.cobertura_dias;
  return (
    <section className="rounded-[15px] border border-linha bg-superficie p-5">
      <h3 className="text-sm font-semibold">Estoque e promoções</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Mini rotulo="Em estoque" valor={`${r.estoque.atual} un.`} />
        <Mini rotulo="Cobertura" valor={`${cob} dias`} destaque={cob < 15 ? "text-revisar" : cob > 90 ? "text-baixar" : "text-tinta"} />
        <Mini rotulo="Pedido aberto" valor={`${r.estoque.pedido_aberto} un.`} />
      </div>
      <p className="mt-3 text-xs text-suave">Estoque consolidado no {r.estoque.local}; a base não separa por canal.</p>
      {r.promocoes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs">
          {r.promocoes.map((pr) => (
            <li key={pr.campanha} className="rounded-lg bg-revisar-bg px-3 py-2 text-revisar">{pr.campanha}: {pct(pr.desconto, 0)} de desconto, {dataBR(pr.inicio)} a {dataBR(pr.fim)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-suave">Sem promoção vigente.</p>
      )}
    </section>
  );
}
