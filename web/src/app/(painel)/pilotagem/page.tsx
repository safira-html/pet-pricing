"use client";

import clsx from "clsx";
import { Lock, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AcaoBadge, Botao, Card, SinteticoTag, Titulo, Vazio } from "@/components/ui";
import { moeda, pct } from "@/lib/format";
import { elegivelPiloto, usePricing } from "@/lib/store";
import type { Canal, Recomendacao } from "@/lib/types";

const CANAIS: Canal[] = ["Loja física", "E-commerce", "Marketplace"];
const JANELAS = [
  { h: 0.05, t: "3 min (demonstração)" },
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
  const [msg, setMsg] = useState<string | null>(null);
  const previa = p.previaPiloto();
  const emAuto = p.recs.filter((r) => p.modoDe(r.id) === "autopiloto");
  const elegiveis = p.recs.filter((r) => elegivelPiloto(r, p.piloto.teto).elegivel);

  const categorias = useMemo(() => [...new Set(p.recs.map((r) => r.categoria))], [p.recs]);
  const porSku = useMemo(() => {
    const m = new Map<string, Recomendacao[]>();
    p.recs.forEach((r) => m.set(r.sku, [...(m.get(r.sku) ?? []), r]));
    return [...m.entries()];
  }, [p.recs]);

  const veto = p.agendamentos.filter((a) => a.origem === "piloto automático" && a.status === "aguardando veto");
  const atalho = (rotulo: string, filtro: (r: Recomendacao) => boolean) => (
    <button
      key={rotulo}
      disabled={!gestor}
      onClick={() => p.definirModo(p.recs.filter(filtro).map((r) => r.id), "autopiloto", `Atalho ${rotulo}`)}
      className="rounded-full border border-linha bg-superficie px-3 py-1.5 text-xs font-medium hover:border-roxo disabled:opacity-45"
    >
      {rotulo}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pilotagem</h1>
        <p className="max-w-3xl text-sm text-suave">
          Em <strong className="text-tinta">copiloto</strong>, toda recomendação espera uma pessoa. Em <strong className="text-tinta">piloto automático</strong>, as recomendações que passam por todas as travas são agendadas sozinhas, com uma janela para veto. Nada é enviado ao ERP: a aplicação é simulada.
        </p>
        {!gestor && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-roxo-50 px-3 py-2 text-sm text-roxo"><Lock size={15} /> Só o gestor comercial muda a pilotagem. Você pode ver e vetar mudanças agendadas.</p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <Titulo eyebrow="Travas">Configuração do piloto automático</Titulo>
          <div className="flex items-center justify-between gap-4 rounded-[12px] border border-linha p-4">
            <div>
              <p className="font-semibold text-tinta">Chave geral</p>
              <p className="text-xs text-suave">Desligada, nenhum item muda de preço sozinho, mesmo os marcados como piloto automático.</p>
            </div>
            <button
              role="switch"
              aria-checked={p.piloto.ligado}
              disabled={!gestor}
              onClick={() => p.configurarPiloto({ ligado: !p.piloto.ligado })}
              className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-45", p.piloto.ligado ? "bg-limao" : "bg-linha")}
            >
              <span className={clsx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", p.piloto.ligado ? "left-6" : "left-1")} />
              <span className="sr-only">Piloto automático</span>
            </button>
          </div>
          <label className="mt-5 block text-sm font-medium text-tinta">
            Variação máxima sem pessoa: <span className="num text-roxo">{pct(p.piloto.teto, 0)}</span>
            <input type="range" min={1} max={5} step={1} disabled={!gestor} value={Math.round(p.piloto.teto * 100)}
              onChange={(e) => p.configurarPiloto({ teto: Number(e.target.value) / 100 })} className="mt-2 w-full accent-[var(--roxo)]" />
            <span className="flex justify-between text-xs text-suave"><span>1%</span><span>5% (limite da regra R02)</span></span>
          </label>
          <label className="mt-5 block text-sm font-medium text-tinta">
            Janela para veto antes de aplicar
            <select disabled={!gestor} value={p.piloto.janelaVetoHoras} onChange={(e) => p.configurarPiloto({ janelaVetoHoras: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-[10px] border border-linha bg-superficie px-3 py-2 text-sm">
              {JANELAS.map((j) => <option key={j.h} value={j.h}>{j.t}</option>)}
            </select>
          </label>
          <div className="mt-5 rounded-[12px] bg-fundo p-4 text-xs leading-relaxed text-texto">
            <p className="mb-1 font-semibold text-tinta">Uma recomendação só vai sozinha quando:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>a ação é subir ou baixar;</li>
              <li>nenhuma regra bloqueia nem pede aprovação (curva A acima de 3%, promoção, coleta antiga, coerência entre canais, estoque baixo);</li>
              <li>a variação cabe no teto acima;</li>
              <li>o produto não é estratégico (estratégicos ficam sempre em copiloto).</li>
            </ul>
          </div>
        </Card>

        <Card>
          <Titulo eyebrow="Prévia" acao={
            <Botao disabled={!gestor || !p.piloto.ligado || !previa.length} onClick={() => { const n = p.rodarPiloto(); setMsg(n ? `${n} mudanças agendadas. Elas aparecem na fila de veto.` : null); }}>
              <Play size={15} /> Rodar agora
            </Botao>
          }>
            O que o piloto automático faria agora
          </Titulo>
          <p className="text-sm text-suave">
            {emAuto.length} itens em piloto automático · {elegiveis.length} de {p.recs.length} passariam pelas travas com o teto de {pct(p.piloto.teto, 0)}.
          </p>
          {!p.piloto.ligado && <p className="mt-2 text-sm text-revisar">A chave geral está desligada.</p>}
          {msg && <p className="mt-2 rounded-lg bg-limao-100 px-3 py-2 text-sm text-limao-700">{msg}</p>}
          {previa.length === 0 ? (
            <div className="mt-4">
              <Vazio titulo="Nada a agendar">
                {elegiveis.length === 0
                  ? p.cenario === "oficial"
                    ? "Na base oficial, todo item tem alguma regra que pede uma pessoa. Para ver o piloto automático agindo, use os cenários sintéticos em Base e demo."
                    : "Aumente o teto ou coloque em piloto automático itens que passam pelas travas."
                  : "Coloque em piloto automático os itens marcados com ● verde, pelos atalhos ou pela tabela abaixo."}
              </Vazio>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-linha text-sm">
              {previa.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="font-medium text-tinta">{r.produto}</span> <span className="text-xs text-suave">{r.sku} · {r.canal}</span></span>
                  <span className="num flex items-center gap-2 whitespace-nowrap"><AcaoBadge acao={r.acao} /> {moeda(r.preco_atual)} → {moeda(r.preco_sugerido)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <Titulo eyebrow="Fila de veto">Mudanças automáticas aguardando</Titulo>
        {veto.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma mudança automática aguardando. Quando o piloto agendar algo, aparece aqui com contagem regressiva.</p>
        ) : (
          <ul className="divide-y divide-linha text-sm">
            {veto.map((a) => {
              const r = p.recs.find((x) => x.id === a.recId)!;
              const falta = new Date(a.aplicaEm).getTime() - agora;
              const aplicado = falta <= 0;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span><span className="font-medium text-tinta">{r.produto}</span> <span className="text-xs text-suave">{r.sku} · {r.canal}</span></span>
                  <span className="num">{moeda(r.preco_atual)} → <strong>{moeda(a.preco)}</strong></span>
                  <span className={clsx("num text-xs", aplicado ? "text-limao-700" : "text-suave")}>
                    {aplicado ? "aplicado na simulação" : `aplica em ${Math.floor(falta / 3600000)}h ${Math.floor((falta % 3600000) / 60000)}min ${Math.floor((falta % 60000) / 1000)}s`}
                  </span>
                  <Botao variante="perigo" disabled={aplicado || !p.pode("vetar")} onClick={() => p.vetar(a.id)}>Vetar</Botao>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <Titulo eyebrow="Atalhos" acao={
          <Botao variante="secundario" disabled={!gestor || !emAuto.length} onClick={() => p.definirModo(emAuto.map((r) => r.id), "copiloto", "Tudo de volta")}>Tudo em copiloto</Botao>
        }>
          Pôr grupos em piloto automático
        </Titulo>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-xs text-suave">Canal</span>{CANAIS.map((c) => atalho(c, (r) => r.canal === c))}</div>
          <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-xs text-suave">Curva</span>{(["A", "B", "C"] as const).map((c) => atalho(`Curva ${c}`, (r) => r.curva === c))}</div>
          <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-xs text-suave">Categoria</span>{categorias.map((c) => atalho(c, (r) => r.categoria === c))}</div>
          <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-xs text-suave">Tudo</span>{atalho("Catálogo inteiro", () => true)}</div>
        </div>
      </Card>

      <Card>
        <Titulo eyebrow="Produto × canal">Modo de cada item</Titulo>
        <p className="mb-3 text-xs text-suave">Clique numa célula para alternar. ● verde = passaria pelas travas hoje · ○ = ficaria esperando uma pessoa mesmo em piloto automático.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-suave">
              <tr><th className="py-2 font-medium">Produto</th>{CANAIS.map((c) => <th key={c} className="py-2 font-medium">{c}</th>)}</tr>
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
                    const e = elegivelPiloto(r, p.piloto.teto);
                    return (
                      <td key={c} className="py-2 pr-2">
                        <button
                          disabled={!gestor}
                          title={e.elegivel ? "Passaria pelas travas" : e.motivos.join("; ")}
                          onClick={() => p.definirModo([r.id], auto ? "copiloto" : "autopiloto", `${r.sku} · ${r.canal}`)}
                          className={clsx("flex w-full items-center justify-between gap-2 rounded-[10px] border px-2.5 py-1.5 text-xs disabled:cursor-default",
                            auto ? "border-roxo bg-roxo text-white" : "border-linha hover:border-roxo")}
                        >
                          <span>{auto ? "Piloto automático" : "Copiloto"}</span>
                          <span className={clsx("size-2.5 rounded-full", e.elegivel ? "bg-limao" : "border border-current opacity-60")} aria-label={e.elegivel ? "elegível" : "não elegível"} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-suave">Mudanças de modo e de travas ficam registradas em <Link href="/aprendizado" className="text-roxo underline">Aprendizado</Link>.</p>
    </div>
  );
}
