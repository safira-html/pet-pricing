"use client";

import clsx from "clsx";
import { AlertTriangle, Ban, ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import { PainelDecisao } from "./Decisao";
import { useEffect } from "react";
import { MapaPreco } from "./PriceRuler";
import { AcaoBadge, ModoBadge, RiscoBadge, SinteticoTag } from "./ui";
import { explicar, fraseAlerta, REGRAS } from "@/lib/explain";
import { dataBR, dataHoraBR, mesCurto, moeda, pct } from "@/lib/format";
import { elegivelPiloto, usePricing } from "@/lib/store";
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
  const eleg = elegivelPiloto(r, p.piloto.teto);

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
                      <span className="font-medium text-tinta">{a.codigo ? `${a.codigo} · ${REGRAS[a.codigo]?.nome ?? ""}` : "Preço mínimo acima do limite de 5%"}</span>
                      <span className="block text-suave">{fraseAlerta(a)}</span>
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
        </div>

        <PainelDecisao r={r} onDecidido={() => onProximo?.()} />
      </aside>
    </div>
  );
}

function CustoMargem({ r }: { r: Recomendacao }) {
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
        <div className="flex justify-between font-semibold text-tinta"><dt>Margem</dt><dd className="num">{moeda(sobra)}</dd></div>
      </dl>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <Mini rotulo="Atual" valor={pct(r.margem.atual)} destaque={r.margem.atual < r.margem.minima ? "text-piso" : "text-tinta"} />
        <Mini rotulo="Mínima" valor={pct(r.margem.minima)} />
        <Mini rotulo="Alvo" valor={pct(r.margem.alvo)} />
      </div>
      {r.margem.simples_reposicao != null && (
        <p className="mt-3 text-xs text-suave">
          Só sobre o custo de reposição (a conta usada no deck da Semana 2), a margem seria {pct(r.margem.simples_reposicao)}.{" "}
          <a href="/regras#margem" className="text-roxo underline">Por que isso importa</a>
        </p>
      )}
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
