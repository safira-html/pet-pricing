"use client";

import clsx from "clsx";
import { Check, CheckCheck, ChevronRight, Footprints, MessageSquareText, Search, Zap, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { Detalhe } from "@/components/Detalhe";
import { AcaoBadge, Botao, RiscoBadge, SinteticoTag, Vazio } from "@/components/ui";
import { posicaoMercado, resumoCurto } from "@/lib/explain";
import { moeda, pct } from "@/lib/format";
import { usePricing } from "@/lib/store";
import type { Acao, Recomendacao } from "@/lib/types";

type Grupo = "rapida" | "motivo" | "rampa" | "decididas";
const GRUPOS: { id: Grupo; rotulo: string; dica: string; icone: LucideIcon }[] = [
  { id: "rapida", rotulo: "Aprovação rápida", dica: "Nenhuma regra pede motivo: dá para aprovar em um clique.", icone: Zap },
  { id: "motivo", rotulo: "Pedem motivo", dica: "Uma regra pede revisão ou aprovação justificada.", icone: MessageSquareText },
  { id: "rampa", rotulo: "Rampa de reajuste", dica: "O preço mínimo está a mais de 5% de distância: a proposta é subir em etapas.", icone: Footprints },
  { id: "decididas", rotulo: "Decididos", dica: "Tudo o que já tem decisão registrada.", icone: CheckCheck },
];
const BARRA: Record<Acao, string> = { SUBIR: "bg-subir", BAIXAR: "bg-baixar", MANTER: "bg-manter", REVISAR: "bg-revisar" };
const CANAIS = ["Loja física", "E-commerce", "Marketplace"] as const;

function grupoDe(r: Recomendacao, decidida: boolean): Grupo {
  if (decidida) return "decididas";
  if (r.preco_sugerido == null && r.proposta.rampa) return "rampa";
  if (r.acao !== "REVISAR" && !r.alertas.some((a) => a.tipo !== "informativo")) return "rapida";
  return "motivo";
}

function Fila() {
  const p = usePricing();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const item = sp.get("item");

  const setParam = useCallback(
    (k: string, v: string | null) => {
      const q = new URLSearchParams(sp.toString());
      if (v == null || q.get(k) === v) q.delete(k);
      else q.set(k, v);
      router.replace(`${path}?${q.toString()}`, { scroll: false });
    },
    [sp, router, path],
  );

  const comGrupo = useMemo(() => p.recs.map((r) => ({ r, g: grupoDe(r, !!p.decisaoDe(r.id)) })), [p]);
  const contagem = Object.fromEntries(GRUPOS.map((g) => [g.id, comGrupo.filter((x) => x.g === g.id).length])) as Record<Grupo, number>;
  const grupoPadrao = (GRUPOS.find((g) => g.id !== "decididas" && contagem[g.id] > 0)?.id ?? "decididas") as Grupo;
  const grupo = (sp.get("grupo") as Grupo) ?? grupoPadrao;

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return comGrupo
      .filter((x) => x.g === grupo)
      .map((x) => x.r)
      .filter((r) => !sp.get("acao") || r.acao === sp.get("acao"))
      .filter((r) => !sp.get("canal") || r.canal === sp.get("canal"))
      .filter((r) => !t || `${r.sku} ${r.produto} ${r.categoria} ${r.marca}`.toLowerCase().includes(t))
      .sort((a, b) => b.prioridade - a.prioridade || a.sku.localeCompare(b.sku));
  }, [comGrupo, grupo, sp, busca]);

  const podeRapido = (r: Recomendacao) => grupoDe(r, false) === "rapida" && (r.risco !== "Alto" || p.pode("risco_alto")) && p.pode("decidir");
  const selecionadas = lista.filter((r) => sel.has(r.id) && podeRapido(r));
  const aberto = item ? p.recs.find((r) => r.id === item) : undefined;
  const decididas = p.recs.filter((r) => p.decisaoDe(r.id)).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fila de decisões</h1>
          <p className="text-sm text-suave">{decididas} de {p.recs.length} itens decididos · cada item é um produto em um canal</p>
        </div>
        <label className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-suave" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, SKU ou marca" aria-label="Buscar" className="w-64 rounded-[10px] border border-linha bg-superficie py-2 pr-3 pl-9 text-sm outline-none focus:border-roxo" />
        </label>
      </header>

      <div role="tablist" aria-label="Grupos" className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {GRUPOS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            role="tab"
            aria-selected={grupo === id}
            onClick={() => { const q = new URLSearchParams(sp.toString()); q.set("grupo", id); q.delete("acao"); router.replace(`${path}?${q}`, { scroll: false }); setSel(new Set()); }}
            className={clsx("flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors",
              grupo === id ? "border-roxo bg-roxo-50 ring-1 ring-roxo" : "border-linha bg-superficie hover:border-roxo")}
          >
            <Icone size={20} className="text-roxo" aria-hidden />
            <span className="min-w-0">
              <span className="num block font-display text-xl leading-none font-semibold text-tinta">{contagem[id]}</span>
              <span className={clsx("text-sm", grupo === id ? "font-medium text-roxo-800" : "text-suave")}>{rotulo}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-texto">{GRUPOS.find((g) => g.id === grupo)?.dica}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {CANAIS.map((c) => (
            <button key={c} onClick={() => setParam("canal", c)} aria-pressed={sp.get("canal") === c}
              className={clsx("rounded-full border px-3 py-1 text-xs", sp.get("canal") === c ? "border-roxo bg-roxo-50 font-semibold text-roxo" : "border-linha bg-superficie hover:border-roxo")}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {grupo === "rapida" && lista.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-roxo-50 px-4 py-2.5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[var(--roxo)]" checked={selecionadas.length > 0 && selecionadas.length === lista.filter(podeRapido).length}
              onChange={(e) => setSel(e.target.checked ? new Set(lista.filter(podeRapido).map((r) => r.id)) : new Set())} />
            Selecionar todos que posso aprovar
          </label>
          <Botao disabled={!selecionadas.length} onClick={() => { selecionadas.forEach((r) => p.decidir(r.id, "aprovar", { preco: r.preco_sugerido, justificativa: "Aprovação em lote" })); setSel(new Set()); }}>
            <Check size={16} /> Aprovar {selecionadas.length || ""} selecionados
          </Botao>
        </div>
      )}

      {lista.length === 0 ? (
        <Vazio titulo={grupo === "decididas" ? "Nenhuma decisão ainda" : "Nada aqui por enquanto"}>
          {grupo === "decididas" ? "Abra um item de outro grupo e registre a primeira decisão." : "Tente outro grupo ou limpe a busca e o filtro de canal."}
        </Vazio>
      ) : (
        <ul className="space-y-2">
          {lista.map((r) => <LinhaFila key={r.id} r={r} selecionado={sel.has(r.id)} podeRapido={podeRapido(r)}
            onSel={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })}
            onAbrir={() => setParam("item", r.id)} />)}
        </ul>
      )}

      {aberto && (() => {
        const i = lista.findIndex((r) => r.id === aberto.id);
        const prox = lista.slice(i + 1).find((r) => !p.decisaoDe(r.id) && r.id !== aberto.id) ?? lista.find((r) => !p.decisaoDe(r.id) && r.id !== aberto.id);
        return (
          <Detalhe key={aberto.id} r={aberto} progresso={`${decididas} de ${p.recs.length} decididos`}
            onFechar={() => setParam("item", null)}
            onAnterior={i > 0 ? () => setParam("item", lista[i - 1].id) : undefined}
            onProximo={prox ? () => setParam("item", prox.id) : undefined} />
        );
      })()}
    </div>
  );
}

function LinhaFila({ r, selecionado, podeRapido, onSel, onAbrir }: {
  r: Recomendacao; selecionado: boolean; podeRapido: boolean; onSel: (v: boolean) => void; onAbrir: () => void;
}) {
  const p = usePricing();
  const d = p.decisaoDe(r.id);
  const pos = posicaoMercado(r);
  const abaixoMin = r.margem.atual < r.margem.minima;
  return (
    <li className={clsx("relative overflow-hidden rounded-[14px] border border-linha bg-superficie transition-shadow hover:shadow-md", d && "opacity-75")}>
      <span className={clsx("absolute inset-y-0 left-0 w-1.5", BARRA[r.acao])} aria-hidden />
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(250px,auto)_minmax(0,1.4fr)_auto]">
        <input type="checkbox" aria-label={`Selecionar ${r.produto}, ${r.canal}`} disabled={!podeRapido}
          className="accent-[var(--roxo)] disabled:invisible" checked={selecionado} onChange={(e) => onSel(e.target.checked)} />

        <button onClick={onAbrir} className="min-w-0 text-left">
          <span className="flex items-center gap-2 truncate font-semibold text-tinta">{r.produto} {r.sintetico && <SinteticoTag />}</span>
          <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-suave">{r.canal} · {r.sku} · curva {r.curva} <RiscoBadge risco={r.risco} /></span>
        </button>

        <div className="col-start-2 row-start-2 flex items-center gap-3 lg:col-start-auto lg:row-start-auto">
          <AcaoBadge acao={r.acao} grande />
          <Preco r={r} />
        </div>

        <div className="col-start-2 min-w-0 lg:col-start-auto">
          <p className="truncate text-sm text-tinta" title={resumoCurto(r)}>
            {d ? <strong className="text-limao-700">✓ {d.tipo === "rejeitar" ? "Rejeitada" : d.tipo === "revisar" ? "Em revisão" : "Aprovada"} por {d.autor}</strong> : resumoCurto(r)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            <Fato alerta={abaixoMin}>margem {pct(r.margem.atual)} <span className="opacity-70">/ mín. {pct(r.margem.minima, 0)}</span></Fato>
            {r.preco_mercado != null && <Fato>{pos === "alinhado" ? "no preço do mercado" : `${pct(Math.abs(r.diferenca_mercado ?? 0))} ${pos} do mercado`}</Fato>}
            <Fato alerta={r.estoque.cobertura_dias < 15}>{r.estoque.cobertura_dias} dias de estoque</Fato>
          </div>
        </div>

        <div className="col-start-3 row-span-3 row-start-1 flex items-center gap-1.5 lg:col-start-auto lg:row-span-1 lg:row-start-auto">
          {podeRapido && !d && (
            <button onClick={() => p.decidir(r.id, "aprovar", { preco: r.preco_sugerido })} title={`Aprovar ${moeda(r.preco_sugerido)}`}
              className="flex h-11 items-center gap-1.5 rounded-[10px] border-2 border-subir/40 px-3 text-sm font-semibold text-subir hover:bg-subir-bg">
              <Check size={16} strokeWidth={2.6} /> {r.acao === "MANTER" ? "Manter" : "Aprovar"}
            </button>
          )}
          <button onClick={onAbrir} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-roxo-50 hover:text-roxo" aria-label={`Abrir ${r.produto}, ${r.canal}`}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </li>
  );
}

function Preco({ r }: { r: Recomendacao }) {
  if (r.preco_sugerido == null && r.proposta.rampa) {
    return (
      <span className="num text-sm leading-tight whitespace-nowrap">
        <span className="text-suave">{moeda(r.preco_atual)} → </span><strong className="text-tinta">{moeda(r.proposta.rampa.preco_etapa_1)}</strong>
        <span className="block text-xs text-revisar">1ª de {r.proposta.rampa.etapas} etapas</span>
      </span>
    );
  }
  if (r.preco_sugerido == null) return <span className="text-xs text-suave">sem preço possível</span>;
  return (
    <span className="num text-sm leading-tight whitespace-nowrap">
      <span className="text-suave">{moeda(r.preco_atual)} → </span><strong className="text-tinta">{moeda(r.preco_sugerido)}</strong>
      <span className="block text-xs text-suave">{r.acao === "MANTER" ? "sem mudança" : pct(r.variacao ?? 0, 1, true)}</span>
    </span>
  );
}

function Fato({ children, alerta }: { children: React.ReactNode; alerta?: boolean }) {
  return <span className={clsx("rounded-full px-2 py-0.5", alerta ? "bg-piso-bg text-piso" : "bg-fundo text-texto")}>{children}</span>;
}

export default function PaginaFila() {
  return (
    <Suspense fallback={<p className="text-sm text-suave">Carregando a fila…</p>}>
      <Fila />
    </Suspense>
  );
}
