"use client";

import clsx from "clsx";
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Download, Plug } from "lucide-react";
import { useState } from "react";
import { Botao, Card, Titulo } from "@/components/ui";
import { dataBR, dataHoraBR } from "@/lib/format";
import { SOURCES } from "@/lib/integrations";
import { usePricing } from "@/lib/store";

const STAGES = [
  { n: 1, title: "Arquivo", text: "ERP e módulo de coleta exportam planilhas; o Pet Pricing devolve um arquivo com os preços aprovados.", effort: "Quase nenhum esforço de TI", ready: true },
  { n: 2, title: "Leitura automática", text: "Conectores leem do ERP e do módulo de coleta em horário agendado, sem gravar nada.", effort: "Esforço médio de TI", ready: false },
  { n: 3, title: "Gravação com aprovação", text: "O preço aprovado volta ao ERP sozinho. Fora do escopo de propósito: a IA não altera preço sem controle.", effort: "Esforço alto de TI", ready: false },
];

function csvCell(v: string | number | null | undefined) {
  const s = v == null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Integrations() {
  const p = usePricing();
  const [open, setOpen] = useState<string | null>(null);
  const lastCollection = p.recs.flatMap((r) => r.concorrentes.map((c) => c.coleta)).filter(Boolean).sort().at(-1);
  // Só sai o que já passou da janela de veto: aprovado por pessoa ou já aplicado.
  const approved = p.agendamentos.filter((a) => a.status === "agendado" || a.status === "aplicado");
  const byId = new Map(p.recs.map((r) => [r.id, r]));

  const exportCsv = () => {
    const header = ["SKU", "Canal", "Produto", "Preço atual", "Preço novo", "Aplicar em", "Situação", "Origem", "Aprovado por", "Motivo"];
    const rows = approved.map((a) => {
      const r = byId.get(a.recId);
      const d = p.decisoes.find((x) => x.recId === a.recId);
      return [r?.sku, r?.canal, r?.produto, r?.preco_atual, a.preco, dataBR(a.aplicaEm), a.status, a.origem, d?.autor, d?.justificativa];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `precos-aprovados-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const groups = [
    { title: "ERP", hint: "Cadastro, preços, custos, vendas, estoque e campanhas", items: SOURCES.filter((x) => x.direction === "read" && x.system !== "Módulo de coleta de concorrência") },
    { title: "Módulo de coleta de concorrência", hint: "Já existe na Popular Pet e faz a correspondência de produtos", items: SOURCES.filter((x) => x.system === "Módulo de coleta de concorrência") },
    { title: "Saída para o ERP", hint: "Só o que foi aprovado", items: SOURCES.filter((x) => x.direction === "write") },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[62ch]">
          <h1 className="text-2xl font-semibold">Integrações</h1>
          <p className="mt-1 text-sm text-suave">
            O Pet Pricing não substitui o ERP nem o módulo de coleta de concorrência: lê o que eles já têm e devolve só os preços aprovados. No protótipo, os dados vêm da base do desafio.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Botao disabled={!approved.length} onClick={exportCsv}><Download size={16} /> Baixar CSV</Botao>
          <span className="text-xs text-suave">{approved.length ? `${approved.length} ${approved.length === 1 ? "preço aprovado" : "preços aprovados"}, para o ERP` : "Aprove preços na fila para gerar"}</span>
        </div>
      </header>

      <Card>
        <Titulo eyebrow="Na prática">Como a conexão evolui</Titulo>
        <ol className="grid gap-4 md:grid-cols-3 md:gap-0">
          {STAGES.map((st, i) => (
            <li key={st.n} className="relative md:pr-6">
              {i < STAGES.length - 1 && <span className="absolute top-3.5 right-0 left-9 hidden h-px bg-linha md:block" aria-hidden />}
              <span className={clsx("num relative grid size-7 place-items-center rounded-full text-sm font-semibold",
                st.ready ? "bg-roxo text-white" : "bg-superficie text-suave ring-1 ring-linha-forte")}>
                {st.ready ? <Check size={15} aria-hidden /> : st.n}
              </span>
              <p className="mt-3 font-display font-semibold text-tinta">{st.title}</p>
              <p className="mt-1 max-w-[34ch] text-sm text-texto">{st.text}</p>
              <p className={clsx("mt-2 text-xs font-medium", st.ready ? "text-roxo-800" : "text-suave")}>{st.ready ? "Já funciona no protótipo" : st.effort}</p>
            </li>
          ))}
        </ol>
      </Card>

      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`grupo-${g.title}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`grupo-${g.title}`} className="text-lg font-semibold">{g.title}</h2>
            <p className="text-sm text-suave">{g.hint}</p>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {g.items.map((src) => {
              const Icon = src.icon;
              const expanded = open === src.id;
              return (
                <li key={src.id} className={clsx("rounded-[15px] border bg-superficie p-5 transition-colors", expanded ? "border-roxo" : "border-linha")}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-roxo-50 text-roxo"><Icon size={20} aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-tinta">{src.name}</p>
                        <span className="rounded-full border border-dashed border-revisar px-2.5 py-0.5 text-xs font-semibold text-revisar">A conectar</span>
                      </div>
                      <p className="mt-1 text-sm text-suave">{src.what}</p>
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-texto">
                        {src.direction === "read" ? <ArrowDownToLine size={13} aria-hidden /> : <ArrowUpFromLine size={13} aria-hidden />}
                        {src.direction === "read" ? "Leitura" : "Envio"} · {src.frequency.toLowerCase()} · alimenta {src.rules.charAt(0).toLowerCase() + src.rules.slice(1)}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setOpen(expanded ? null : src.id)} aria-expanded={expanded}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-roxo hover:bg-roxo-50">
                    <ChevronDown size={16} className={clsx("transition-transform", expanded && "rotate-180")} aria-hidden />
                    {expanded ? "Ocultar campos" : `Ver campos (${src.fields.length})`}
                  </button>
                  {expanded && (
                    <div className="mt-2 space-y-3 rounded-[12px] bg-fundo p-4 text-sm">
                      <ul className="flex flex-wrap gap-1.5">
                        {src.fields.map((f) => <li key={f} className="rounded-full border border-linha bg-superficie px-2.5 py-0.5 text-xs">{f}</li>)}
                      </ul>
                      <p className="text-texto"><span className="text-suave">Hoje, no protótipo:</span> {src.direction === "read" ? `aba ${src.sheet} da base do desafio` : "arquivo CSV baixado nesta tela"}.</p>
                      {src.id === "competitors" && lastCollection && <p className="text-texto"><span className="text-suave">Coleta mais recente na base:</span> <span className="num">{dataHoraBR(lastCollection)}</span>.</p>}
                      <p className="flex items-start gap-2 text-suave"><Plug size={15} className="mt-0.5 shrink-0" aria-hidden /> Conectar depende de a Popular Pet indicar o sistema e liberar acesso de leitura.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
