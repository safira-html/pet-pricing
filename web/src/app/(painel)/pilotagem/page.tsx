"use client";

import clsx from "clsx";
import { CalendarClock, CirclePause, Lock, Plus, Trash2, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/Select";
import { AcaoBadge, Botao, Card, Confirmar, SinteticoTag, Titulo, Vazio } from "@/components/ui";
import { dataHoraBR, moeda, pct } from "@/lib/format";
import { cobre, descreverRegra, usePricing } from "@/lib/store";
import type { Canal, Recomendacao, RegraPiloto } from "@/lib/types";

const CANAIS: Canal[] = ["Loja física", "E-commerce", "Marketplace"];
const JANELAS = [
  { h: 0.05, t: "3 minutos (para demonstração)" },
  { h: 1, t: "1 hora" },
  { h: 4, t: "4 horas" },
  { h: 24, t: "24 horas" },
];

function useAgora(ms = 1000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}


export default function Pilotagem() {
  const p = usePricing();
  const agora = useAgora();
  const gestor = p.pode("pilotar");
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [limpando, setLimpando] = useState(false);
  const holds = p.learnings.filter((l) => l.effect === "hold" && !l.dismissed);
  const [nova, setNova] = useState<Pick<RegraPiloto, "curva" | "canal" | "categoria">>({ curva: null, canal: null, categoria: null });

  const categorias = useMemo(() => [...new Set(p.recs.map((r) => r.categoria))].sort(), [p.recs]);
  const porSku = useMemo(() => {
    const m = new Map<string, Recomendacao[]>();
    p.recs.forEach((r) => m.set(r.sku, [...(m.get(r.sku) ?? []), r]));
    return [...m.entries()];
  }, [p.recs]);

  const previa = p.previaPiloto();
  const emAuto = p.recs.filter((r) => p.modoDe(r.id) === "autopiloto");
  const excecoes = p.recs.filter((r) => p.origemModo(r.id) === "exceção");
  const cobertosNova = p.recs.filter((r) => cobre(nova, r));
  const elegNova = cobertosNova.filter((r) => p.eligibility(r).elegivel);
  const veto = p.agendamentos.filter((a) => a.origem === "piloto automático" && a.status === "aguardando veto");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="max-w-[68ch]">
        <h1 className="text-2xl font-semibold">Pilotagem</h1>
        <p className="mt-1 text-sm leading-relaxed text-suave text-pretty">
          Todo item começa em <strong className="text-tinta">copiloto</strong>: o sistema recomenda e uma pessoa decide. Com regras de grupo, você coloca itens em <strong className="text-tinta">piloto automático</strong>: as recomendações que passam pelas proteções são agendadas sozinhas, com tempo para veto. Nada vai para o ERP, a aplicação é simulada.
        </p>
        {!gestor && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-roxo-50 px-3 py-2 text-sm text-roxo-800"><Lock size={16} /> Só o gestor comercial muda a pilotagem. {p.pode("vetar") ? "Você pode ver tudo e vetar mudanças agendadas." : "Você pode ver tudo, sem alterar."}</p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Card>
          <Titulo eyebrow="Proteções">Como o piloto automático age</Titulo>
          <div className="flex items-center justify-between gap-4 rounded-[12px] border border-linha p-4">
            <div>
              <p className="font-semibold text-tinta">Piloto automático {p.piloto.ligado ? "ligado" : "desligado"}</p>
              <p className="text-sm text-suave">{p.piloto.ligado ? "Agenda sozinho os itens cobertos que passam pelas proteções, com tempo para veto." : "Nenhum item muda de preço sozinho, mesmo coberto por regra."}</p>
            </div>
            <button role="switch" aria-checked={p.piloto.ligado} aria-label="Ligar piloto automático" disabled={!gestor}
              onClick={() => p.configurarPiloto({ ligado: !p.piloto.ligado })}
              className={clsx("relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-45", p.piloto.ligado ? "bg-subir" : "bg-linha-forte")}>
              <span className={clsx("absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-out)]", p.piloto.ligado && "translate-x-6")} />
            </button>
          </div>
          <label className="mt-5 block text-sm font-medium text-tinta">
            Variação máxima sem aprovação: <span className="num text-roxo">{pct(p.piloto.teto, 0)}</span>
            <input type="range" min={1} max={5} step={1} disabled={!gestor} value={Math.round(p.piloto.teto * 100)}
              onChange={(e) => p.configurarPiloto({ teto: Number(e.target.value) / 100 })} className="mt-3 w-full accent-[var(--roxo)]" />
            <span className="flex justify-between text-xs text-suave"><span>1%</span><span>5% · limite da regra R02</span></span>
          </label>
          <Select className="mt-5" rotulo="Tempo para vetar antes de aplicar" disabled={!gestor} valor={String(p.piloto.janelaVetoHoras)}
            opcoes={JANELAS.map((j) => ({ valor: String(j.h), rotulo: j.t }))} onChange={(v) => p.configurarPiloto({ janelaVetoHoras: Number(v) })} />
          <div className="mt-5 rounded-[12px] bg-fundo p-4 text-sm leading-relaxed">
            <p className="mb-1 font-semibold text-tinta">Um item só muda sozinho quando:</p>
            <ul className="list-disc space-y-0.5 pl-5 text-texto">
              <li>a recomendação é subir ou baixar;</li>
              <li>nenhuma regra da base bloqueia ou pede aprovação;</li>
              <li>a variação cabe no limite acima;</li>
              <li>o produto não é estratégico;</li>
              <li>o aprendizado não tirou o grupo do piloto.</li>
            </ul>
          </div>
        </Card>

        <Card>
          <Titulo eyebrow="Regras de grupo">Quem fica em piloto automático</Titulo>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select rotulo="Curva" disabled={!gestor} valor={nova.curva ?? ""} onChange={(v) => setNova({ ...nova, curva: (v || null) as RegraPiloto["curva"] })}
              opcoes={[{ valor: "", rotulo: "Qualquer curva" }, ...["A", "B", "C"].map((c) => ({ valor: c, rotulo: `Curva ${c}` }))]} />
            <Select rotulo="Canal" disabled={!gestor} valor={nova.canal ?? ""} onChange={(v) => setNova({ ...nova, canal: (v || null) as Canal | null })}
              opcoes={[{ valor: "", rotulo: "Qualquer canal" }, ...CANAIS.map((c) => ({ valor: c, rotulo: c }))]} />
            <Select rotulo="Categoria" disabled={!gestor} valor={nova.categoria ?? ""} onChange={(v) => setNova({ ...nova, categoria: (v as string) || null })}
              opcoes={[{ valor: "", rotulo: "Qualquer categoria" }, ...categorias.map((c) => ({ valor: c, rotulo: c }))]} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-fundo px-4 py-3">
            <p className="text-sm text-texto">
              <strong className="text-tinta">{descreverRegra(nova)}</strong>
              <span className="block text-suave">{cobertosNova.length} {cobertosNova.length === 1 ? "item" : "itens"} · {elegNova.length} {elegNova.length === 1 ? "passa" : "passam"} pelas proteções hoje</span>
            </p>
            <Botao variante="secundario" disabled={!gestor || !cobertosNova.length} onClick={() => p.adicionarRegraPiloto(nova)}><Plus size={16} /> Criar regra</Botao>
          </div>

          {holds.length > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-piso-bg px-3 py-2.5 text-sm text-piso">
              <CirclePause size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                O aprendizado tirou do piloto: {holds.map((l) => `${l.categoria} · ${l.canal}`).join(", ")}.{" "}
                <Link href="/aprendizado" className="font-semibold underline underline-offset-2 hover:decoration-2">Ver por quê</Link>
              </span>
            </p>
          )}

          <h3 className="mt-6 text-sm font-semibold">Regras ativas</h3>
          {p.regrasPiloto.length === 0 ? (
            <p className="mt-2 text-sm text-suave">Nenhuma regra. Comece por grupos de menor risco, como a curva C, e veja a prévia antes de ligar o piloto automático.</p>
          ) : (
            <ul className="mt-2 divide-y divide-linha">
              {p.regrasPiloto.map((g) => {
                const cob = p.recs.filter((r) => cobre(g, r));
                const ok = cob.filter((r) => p.eligibility(r).elegivel).length;
                return (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-sm"><span className="font-medium text-tinta">{descreverRegra(g)}</span>
                      <span className="block text-suave">{cob.length} {cob.length === 1 ? "item" : "itens"} · {ok} {ok === 1 ? "passa" : "passam"} pelas proteções</span></span>
                    {removendo === g.id ? (
                      <Confirmar texto="Remover a regra? Os itens voltam ao copiloto." acao="Remover" onCancelar={() => setRemovendo(null)}
                        onConfirmar={() => { p.removerRegraPiloto(g.id); setRemovendo(null); }} className="w-full" />
                    ) : (
                      <button disabled={!gestor} onClick={() => setRemovendo(g.id)} aria-label={`Remover regra ${descreverRegra(g)}`}
                        className="grid size-11 shrink-0 place-items-center rounded-[10px] text-piso hover:bg-piso-bg disabled:opacity-40"><Trash2 size={18} /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {excecoes.length > 0 && (limpando ? (
            <Confirmar className="mt-4" texto={`Apagar ${excecoes.length === 1 ? "a exceção manual" : `as ${excecoes.length} exceções manuais`}? ${excecoes.length === 1 ? "O item volta" : "Os itens voltam"} a seguir as regras de grupo.`}
              acao="Apagar exceções" onCancelar={() => setLimpando(false)} onConfirmar={() => { p.limparExcecao(excecoes.map((r) => r.id)); setLimpando(false); }} />
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-dashed border-linha px-4 py-3 text-sm">
              <span>{excecoes.length} {excecoes.length === 1 ? "item tem exceção manual e ignora" : "itens têm exceção manual e ignoram"} as regras.</span>
              <Botao variante="secundario" disabled={!gestor} onClick={() => setLimpando(true)}><Undo2 size={16} /> Voltar às regras</Botao>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <Titulo eyebrow={p.piloto.ligado ? "Agendamento automático" : "Prévia"}>
          {p.piloto.ligado ? "O piloto agenda sozinho" : "O que o piloto agendaria ao ligar"}
        </Titulo>
        <p className="text-sm text-suave">
          {emAuto.length} {emAuto.length === 1 ? "item" : "itens"} em piloto automático
          {p.piloto.ligado
            ? ". Sempre que um deles passa pelas proteções, a mudança é agendada na hora e vai para a fila de veto abaixo; na fila de decisões, o item aparece como decidido pelo piloto."
            : ` · ${previa.length} ${previa.length === 1 ? "seria agendado" : "seriam agendados"} assim que você ligar a chave.`}
        </p>
        {p.piloto.ligado && p.ultimaExecucaoPiloto && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-limao-100 px-3 py-2 text-sm text-limao-700">
            <CalendarClock size={16} aria-hidden />
            Última execução: {dataHoraBR(p.ultimaExecucaoPiloto.quando)}, {p.ultimaExecucaoPiloto.n} {p.ultimaExecucaoPiloto.n === 1 ? "mudança agendada" : "mudanças agendadas"}.
          </p>
        )}
        {!p.piloto.ligado && (previa.length === 0 ? (
          <div className="mt-4">
            <Vazio titulo="Nada seria agendado">
              {emAuto.length === 0
                ? "Crie uma regra de grupo acima para colocar itens em piloto automático."
                : p.cenario === "oficial"
                  ? "Na base oficial, todo item tem alguma regra que pede uma pessoa. Para ver o piloto automático agindo, use os cenários sintéticos em Base e demo."
                  : "Os itens em piloto automático não passam pelas proteções hoje. Aumente a variação máxima ou crie outra regra."}
            </Vazio>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-linha text-sm">
            {previa.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="font-medium text-tinta">{r.produto}</span> <span className="text-suave">· {r.canal}</span></span>
                <span className="num flex items-center gap-3 whitespace-nowrap"><AcaoBadge acao={r.acao} /> {moeda(r.preco_atual)} → <strong>{moeda(r.preco_sugerido)}</strong></span>
              </li>
            ))}
          </ul>
        ))}
        {p.piloto.ligado && emAuto.length > 0 && previa.length === 0 && !veto.length && (
          <p className="mt-3 text-sm text-suave">
            {p.cenario === "oficial"
              ? "Na base oficial, nenhum item coberto passa pelas proteções: todos têm alguma regra que pede uma pessoa."
              : "Nenhum item coberto passa pelas proteções agora. Aumente a variação máxima ou crie outra regra."}
          </p>
        )}
      </Card>

      <Card>
        <Titulo eyebrow="Fila de veto">Mudanças automáticas aguardando</Titulo>
        {veto.length === 0 ? (
          <Vazio titulo="Nenhuma mudança aguardando veto">
            Quando o piloto automático agendar uma mudança, ela aparece aqui com contagem regressiva e qualquer analista pode vetar. Para isso, ligue o piloto e crie uma regra de grupo: o agendamento é automático.
          </Vazio>
        ) : (
          <ul className="divide-y divide-linha text-sm">
            {veto.map((a) => {
              const r = p.recs.find((x) => x.id === a.recId)!;
              const falta = new Date(a.aplicaEm).getTime() - agora;
              const aplicado = falta <= 0;
              return (
                <li key={a.id} className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                  <span><span className="font-medium text-tinta">{r.produto}</span> <span className="text-suave">· {r.canal}</span></span>
                  <span className="num">{moeda(r.preco_atual)} → <strong>{moeda(a.preco)}</strong></span>
                  <span className={clsx("num text-sm", aplicado ? "text-subir" : "text-suave")}>
                    {aplicado ? "Aplicado na simulação" : `Aplica em ${Math.floor(falta / 3600000)}h ${Math.floor((falta % 3600000) / 60000)}min ${Math.floor((falta % 60000) / 1000)}s`}
                  </span>
                  <Botao variante="perigo" disabled={aplicado || !p.pode("vetar")} onClick={() => p.vetar(a.id)}><XCircle size={16} /> Vetar</Botao>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <Titulo eyebrow="Item por item">Modo de cada produto em cada canal</Titulo>
        <p className="mb-4 text-sm text-suave">Clique para criar uma exceção a um item. A bolinha verde indica que ele passaria pelas proteções hoje.</p>
        <div className="relative">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-sm text-suave">
              <tr><th className="pb-2 font-medium">Produto</th>{CANAIS.map((c) => <th key={c} className="pb-2 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {porSku.map(([sku, lista]) => (
                <tr key={sku}>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-1.5 font-medium text-tinta">{lista[0].produto} {lista[0].sintetico && <SinteticoTag />}</span>
                    <span className="text-xs text-suave">{sku} · curva {lista[0].curva} · {lista[0].categoria}</span>
                  </td>
                  {CANAIS.map((c) => {
                    const r = lista.find((x) => x.canal === c);
                    if (!r) return <td key={c} />;
                    const auto = p.modoDe(r.id) === "autopiloto";
                    const origem = p.origemModo(r.id);
                    const e = p.eligibility(r);
                    return (
                      <td key={c} className="py-2 pr-2">
                        <button disabled={!gestor} title={e.elegivel ? "Passaria pelas proteções hoje" : e.motivos.join("; ")}
                          onClick={() => p.definirModo([r.id], auto ? "copiloto" : "autopiloto", `Exceção ${r.sku} · ${r.canal}`)}
                          className={clsx("flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border px-3 text-sm disabled:cursor-default",
                            auto ? "border-roxo bg-roxo-50 font-medium text-roxo-800" : "border-linha text-texto hover:border-roxo")}>
                          <span className="text-left leading-tight">{auto ? "Piloto automático" : "Copiloto"}
                            {origem !== "padrão" && <span className="block text-xs font-normal text-suave">{origem === "regra" ? "pela regra" : "exceção"}</span>}
                          </span>
                          <span className={clsx("size-2.5 shrink-0 rounded-full", e.elegivel ? "bg-subir" : "border border-linha-forte")} aria-hidden />
                          <span className="sr-only">{e.elegivel ? "passa pelas proteções" : "não passa pelas proteções"}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          {/* dica #73: no celular a tabela rola de lado; o degradê indica que há mais */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-superficie md:hidden" aria-hidden />
        </div>
      </Card>
      <p className="text-sm text-suave">Regras, exceções e vetos ficam registrados em <Link href="/aprendizado" className="text-roxo underline underline-offset-2 hover:text-roxo-800 hover:decoration-2">Aprendizado</Link>.</p>
    </div>
  );
}
