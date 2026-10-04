"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Card, Titulo, Vazio } from "@/components/ui";
import { REGRAS } from "@/lib/explain";
import { dataHoraBR, pct } from "@/lib/format";
import { metricas } from "@/lib/metricas";
import { usePricing } from "@/lib/store";
import type { Evento } from "@/lib/types";

const TIPOS: Evento["tipo"][] = ["decisão", "piloto automático", "veto", "modo", "configuração", "base"];

export default function Aprendizado() {
  const p = usePricing();
  const [filtro, setFiltro] = useState<Evento["tipo"] | null>(null);
  const m = metricas(p.recs, p.decisoes);
  const humanas = p.decisoes.filter((d) => d.perfil !== "sistema");

  const porRegra = Object.keys(REGRAS)
    .map((cod) => {
      const ds = humanas.filter((d) => p.recs.find((r) => r.id === d.recId)?.alertas.some((a) => a.codigo === cod && a.tipo !== "informativo"));
      const aceitas = ds.filter((d) => d.tipo === "aprovar" || d.tipo === "editar" || d.tipo === "etapa_rampa").length;
      return { cod, total: ds.length, aceitas };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => a.aceitas / a.total - b.aceitas / b.total);

  const motivos = Object.entries(
    humanas.filter((d) => d.justificativa).reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.justificativa]: (acc[d.justificativa] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);

  const eventos = p.eventos.filter((e) => !filtro || e.tipo === filtro);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Aprendizado</h1>
        <p className="max-w-3xl text-sm text-suave">Cada decisão volta como informação: o que foi aceito, o que foi rejeitado e por quê. Regras muito rejeitadas são as primeiras candidatas a ajuste.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { r: "Decisões registradas", v: String(humanas.length) },
          { r: "Aceitação das recomendações", v: m.aceitacao == null ? "—" : pct(m.aceitacao, 0) },
          { r: "Tempo médio por decisão", v: m.tempoMedioSeg == null ? "—" : `${Math.round(m.tempoMedioSeg)} s` },
          { r: "Mudanças do piloto automático", v: String(p.agendamentos.filter((a) => a.origem === "piloto automático").length) },
        ].map((x) => (
          <Card key={x.r} className="p-4">
            <p className="text-xs text-suave">{x.r}</p>
            <p className="num mt-1 font-display text-2xl font-semibold text-tinta">{x.v}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <Titulo eyebrow="Onde as pessoas discordam">Aceitação por regra</Titulo>
          {porRegra.length === 0 ? (
            <p className="text-sm text-suave">Aparece depois das primeiras decisões em itens com regras acionadas.</p>
          ) : (
            <ul className="space-y-3">
              {porRegra.map((x) => (
                <li key={x.cod}>
                  <div className="mb-1 flex justify-between text-sm"><span>{x.cod} · {REGRAS[x.cod].nome}</span><span className="num text-suave">{x.aceitas} de {x.total}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-piso-bg"><div className="h-full bg-subir" style={{ width: `${(x.aceitas / x.total) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <Titulo eyebrow="Em palavras">Motivos mais usados</Titulo>
          {motivos.length === 0 ? (
            <p className="text-sm text-suave">Os motivos escritos nas decisões aparecem aqui, agrupados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {motivos.slice(0, 8).map(([t, n]) => (
                <li key={t} className="flex justify-between gap-3"><span>“{t}”</span><span className="num text-suave">{n}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-suave">Com o backend, um modelo local de classificação (Laya) agrupa motivos escritos à mão em categorias, sem enviar dados para fora.</p>
        </Card>
      </div>

      <Card>
        <Titulo eyebrow="Rastreabilidade">Linha do tempo</Titulo>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <button key={t} onClick={() => setFiltro(filtro === t ? null : t)} aria-pressed={filtro === t}
              className={clsx("rounded-full border px-3 py-1 text-xs capitalize", filtro === t ? "border-roxo bg-roxo-50 font-semibold text-roxo" : "border-linha hover:border-roxo")}>
              {t}
            </button>
          ))}
        </div>
        {eventos.length === 0 ? (
          <Vazio titulo="Nada registrado ainda">Toda decisão, mudança de modo e veto aparece aqui com autor e horário. <Link href="/fila" className="text-roxo underline">Ir para a fila</Link></Vazio>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-roxo-100 pl-5">
            {eventos.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className={clsx("absolute top-1.5 -left-[27px] size-3 rounded-full ring-4 ring-superficie", e.tipo === "veto" ? "bg-piso" : e.tipo === "piloto automático" ? "bg-roxo" : e.tipo === "decisão" ? "bg-limao" : "bg-linha")} aria-hidden />
                <p><strong className="text-tinta">{e.autor}</strong> {e.texto}</p>
                <p className="text-xs text-suave">{dataHoraBR(e.quando)} · {e.tipo}{e.recId && <> · <Link href={`/fila?item=${encodeURIComponent(e.recId)}`} className="text-roxo underline">abrir item</Link></>}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
