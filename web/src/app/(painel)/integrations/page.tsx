"use client";

import clsx from "clsx";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Download, FileSpreadsheet, Plug } from "lucide-react";
import { useState } from "react";
import { Botao, Card, Titulo } from "@/components/ui";
import { dataBR, dataHoraBR } from "@/lib/format";
import { SOURCES } from "@/lib/integrations";
import { usePricing } from "@/lib/store";

const STAGES = [
  { n: 1, title: "Arquivo", text: "ERP e módulo de coleta exportam planilhas neste formato. O Pet Pricing importa e devolve um arquivo com os preços aprovados.", effort: "Quase nenhum esforço de TI", ready: true },
  { n: 2, title: "Leitura automática", text: "Conectores leem do ERP e do módulo de coleta em horário agendado, sem gravar nada nesses sistemas.", effort: "Esforço médio de TI", ready: false },
  { n: 3, title: "Gravação com aprovação", text: "O preço aprovado volta ao ERP sozinho. Fica fora do escopo de propósito: a IA não altera preço sem controle.", effort: "Esforço alto de TI", ready: false },
];

function csvCell(v: string | number | null | undefined) {
  const s = v == null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Integrations() {
  const p = usePricing();
  const [open, setOpen] = useState<string | null>(null);
  const lastCollection = p.recs.flatMap((r) => r.concorrentes.map((c) => c.coleta)).filter(Boolean).sort().at(-1);
  const approved = p.agendamentos.filter((a) => a.status !== "vetado");
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
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Integrações</h1>
        <p className="max-w-3xl text-sm text-suave">
          A Popular Pet já tem um módulo que coleta os preços da concorrência e um ERP com custo, estoque e vendas. O Pet Pricing não substitui nenhum dos dois: lê o que eles já têm e devolve só os preços aprovados. No protótipo, tudo vem da base do desafio.
        </p>
      </header>

      <Card>
        <Titulo eyebrow="Do mais simples ao mais completo">Como conectar na prática</Titulo>
        <ol className="grid gap-3 md:grid-cols-3">
          {STAGES.map((s) => (
            <li key={s.n} className={clsx("rounded-[12px] border p-4", s.ready ? "border-roxo bg-roxo-50/50" : "border-linha")}>
              <p className="flex items-center gap-2">
                <span className={clsx("num grid size-7 place-items-center rounded-full text-sm font-semibold", s.ready ? "bg-roxo text-white" : "bg-fundo text-suave")}>{s.n}</span>
                <span className="font-display font-semibold text-tinta">{s.title}</span>
              </p>
              <p className="mt-2 text-sm text-texto">{s.text}</p>
              <p className={clsx("mt-2 text-xs font-medium", s.ready ? "text-roxo-800" : "text-suave")}>{s.ready ? "Já funciona no protótipo" : s.effort}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <Titulo eyebrow="Fontes e saídas" acao={<span className="rounded-full bg-revisar-bg px-2.5 py-1 text-xs font-semibold text-revisar">{SOURCES.length} a conectar</span>}>
          Ferramentas da Popular Pet
        </Titulo>
        <ul className="divide-y divide-linha">
          {SOURCES.map((s) => {
            const Icon = s.icon;
            const expanded = open === s.id;
            return (
              <li key={s.id} className="py-3">
                <button onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}
                  className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] p-1 text-left hover:bg-roxo-50/50">
                  <span className="grid size-11 place-items-center rounded-[12px] bg-roxo-50 text-roxo"><Icon size={20} aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-tinta">{s.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-suave">
                        {s.direction === "read" ? <ArrowDownToLine size={12} aria-hidden /> : <ArrowUpFromLine size={12} aria-hidden />}
                        {s.direction === "read" ? `lê de ${s.system}` : `envia para ${s.system}`}
                      </span>
                    </span>
                    <span className="block text-sm text-suave">{s.what}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="hidden rounded-full border border-dashed border-revisar px-2.5 py-1 text-xs font-semibold text-revisar sm:inline">A conectar</span>
                    <ChevronDown size={18} className={clsx("text-suave transition-transform", expanded && "rotate-180")} aria-hidden />
                  </span>
                </button>
                {expanded && (
                  <div className="mt-3 grid gap-4 rounded-[12px] bg-fundo p-4 text-sm md:ml-14 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-suave uppercase">Campos esperados</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {s.fields.map((f) => <li key={f} className="rounded-full border border-linha bg-superficie px-2.5 py-0.5 text-xs">{f}</li>)}
                      </ul>
                    </div>
                    <dl className="space-y-2">
                      <div><dt className="text-xs text-suave">Hoje, no protótipo</dt><dd>{s.direction === "read" ? `Aba ${s.sheet} da base do desafio` : "Arquivo CSV baixado nesta tela"}</dd></div>
                      <div><dt className="text-xs text-suave">Alimenta</dt><dd>{s.rules}</dd></div>
                      <div><dt className="text-xs text-suave">Atualização prevista</dt><dd>{s.frequency}</dd></div>
                      {s.id === "competitors" && lastCollection && <div><dt className="text-xs text-suave">Coleta mais recente na base</dt><dd className="num">{dataHoraBR(lastCollection)}</dd></div>}
                    </dl>
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                      <Botao variante="secundario" disabled title="Depende de a Popular Pet indicar o sistema e liberar o acesso"><Plug size={16} /> Conectar</Botao>
                      <span className="text-xs text-suave">Depende de a Popular Pet indicar o sistema e liberar acesso de leitura.</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-limao-100 text-limao-700"><FileSpreadsheet size={20} aria-hidden /></span>
          <div>
            <p className="font-medium text-tinta">Arquivo de preços aprovados para o ERP</p>
            <p className="text-sm text-suave">
              {approved.length
                ? `${approved.length} ${approved.length === 1 ? "preço aprovado" : "preços aprovados"} (vetados ficam de fora). CSV com ponto e vírgula, pronto para abrir no Excel.`
                : "Aprove recomendações na fila para gerar o arquivo."}
            </p>
          </div>
        </div>
        <Botao disabled={!approved.length} onClick={exportCsv}><Download size={16} /> Baixar CSV</Botao>
      </Card>
    </div>
  );
}
