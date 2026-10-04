"use client";

import clsx from "clsx";
import { Check, CheckCheck, ChevronRight, Footprints, MessageSquareText, PauseCircle, Search, X, Zap, type LucideIcon } from "lucide-react";
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
  { id: "rampa", rotulo: "Rampa de reajuste", dica: "O preço mínimo fica além do limite por decisão: a proposta é subir em etapas, com aprovação.", icone: Footprints },
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
  const acaoFiltro = sp.get("acao") as Acao | null;
  // Vindo da visão geral com uma ação escolhida, a lista mostra todos os pendentes dessa ação.
  const grupo = (sp.get("grupo") as Grupo | null) ?? (acaoFiltro ? null : grupoPadrao);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return comGrupo
      .filter((x) => (grupo ? x.g === grupo : x.g !== "decididas"))
      .map((x) => x.r)
      .filter((r) => !acaoFiltro || r.acao === acaoFiltro)
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
        <label className="relative w-full sm:w-72">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-suave" aria-hidden />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, SKU ou marca" aria-label="Buscar produto, SKU ou marca"
            className="h-11 w-full rounded-[10px] border border-linha-forte bg-superficie pr-3 pl-9 text-sm outline-none focus:border-roxo" />
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
        {grupo ? (
          <p className="text-sm text-texto">{GRUPOS.find((g) => g.id === grupo)?.dica}</p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm text-texto">
            Todos os pendentes com a recomendação <AcaoBadge acao={acaoFiltro!} />
            <button onClick={() => setParam("acao", null)} className="inline-flex h-9 items-center gap-1 rounded-full border border-linha px-3 text-xs font-medium hover:border-roxo hover:text-roxo">
              <X size={14} aria-hidden /> Limpar filtro
            </button>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por canal">
          <span className="mr-1 text-xs font-medium text-suave">Canal</span>
          {CANAIS.map((c) => (
            <button key={c} onClick={() => setParam("canal", c)} aria-pressed={sp.get("canal") === c}
              className={clsx("inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
                sp.get("canal") === c ? "border-roxo bg-roxo-50 font-semibold text-roxo-800" : "border-linha bg-superficie text-texto hover:border-roxo")}>
              {sp.get("canal") === c && <Check size={14} aria-hidden />}{c}
            </button>
          ))}
        </div>
      </div>

      {grupo === "rapida" && lista.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-roxo-50 px-4 py-2.5 text-sm">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="size-[18px] accent-[var(--roxo)]" checked={selecionadas.length > 0 && selecionadas.length === lista.filter(podeRapido).length}
              onChange={(e) => setSel(e.target.checked ? new Set(lista.filter(podeRapido).map((r) => r.id)) : new Set())} />
            Selecionar todos que posso aprovar
          </label>
          <Botao disabled={!selecionadas.length} onClick={() => { p.decidirLote(selecionadas.map((r) => ({ recId: r.id, preco: r.preco_sugerido })), "Aprovação em lote"); setSel(new Set()); }}>
            <Check size={16} /> Aprovar {selecionadas.length || ""} selecionados
          </Botao>
        </div>
      )}

      {lista.length === 0 ? (
        <Vazio titulo={grupo === "decididas" ? "Nenhuma decisão ainda" : "Nada aqui por enquanto"}
          acao={(busca || sp.get("canal") || acaoFiltro) && (
            <Botao variante="secundario" onClick={() => { setBusca(""); const q = new URLSearchParams(sp.toString()); q.delete("canal"); q.delete("acao"); router.replace(`${path}?${q}`, { scroll: false }); }}>
              <X size={16} /> Limpar filtros
            </Botao>
          )}>
          {grupo === "decididas" ? "Abra um item de outro grupo e registre a primeira decisão." : "Tente outro grupo, ou limpe a busca e os filtros."}
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
    <li className={clsx("relative overflow-hidden rounded-[14px] border border-linha transition-shadow hover:shadow-md", d ? "bg-fundo" : "bg-superficie")}>
      <span className={clsx("absolute inset-y-0 left-0 w-1.5", BARRA[r.acao])} aria-hidden />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3.5 pr-3 pl-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:pr-4 sm:pl-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(250px,auto)_minmax(0,1.4fr)_auto]">
        <input type="checkbox" aria-label={`Selecionar ${r.produto}, ${r.canal}`} disabled={!podeRapido}
          className="size-[18px] accent-[var(--roxo)] disabled:invisible" checked={selecionado} onChange={(e) => onSel(e.target.checked)} />

        <button onClick={onAbrir} className="min-w-0 text-left">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-tinta"><span className="min-w-0 truncate">{r.produto}</span>{r.sintetico && <SinteticoTag />}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-suave">{r.canal} · {r.sku} · curva {r.curva} <RiscoBadge risco={r.risco} /></span>
        </button>

        <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-3 lg:col-start-auto lg:row-start-auto">
          <AcaoBadge acao={r.acao} grande />
          <Preco r={r} />
        </div>

        <div className="col-start-2 min-w-0 lg:col-start-auto">
          <p className="line-clamp-2 text-sm text-tinta sm:line-clamp-none sm:truncate" title={resumoCurto(r)}>
            {d ? (
              <strong className={clsx("inline-flex items-center gap-1", d.tipo === "rejeitar" ? "text-piso" : d.tipo === "revisar" ? "text-revisar" : "text-subir")}>
                {d.tipo === "rejeitar" ? <X size={14} aria-hidden /> : d.tipo === "revisar" ? <PauseCircle size={14} aria-hidden /> : <Check size={14} aria-hidden />}
                {d.tipo === "rejeitar" ? "Rejeitada" : d.tipo === "revisar" ? "Em revisão" : "Aprovada"} por {d.autor}
              </strong>
            ) : resumoCurto(r)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            <Fato alerta={abaixoMin}>margem {pct(r.margem.atual)} <span className={abaixoMin ? "" : "text-suave"}>/ mín. {pct(r.margem.minima, 0)}</span></Fato>
            {r.preco_mercado != null && <Fato>{pos === "alinhado" ? "no preço do mercado" : `${pct(Math.abs(r.diferenca_mercado ?? 0))} ${pos} do mercado`}</Fato>}
            <Fato alerta={r.estoque.cobertura_dias < 15}>{r.estoque.cobertura_dias} dias de estoque</Fato>
          </div>
        </div>

        <div className="col-start-2 flex items-center justify-between gap-1.5 sm:col-start-3 sm:row-span-3 sm:row-start-1 sm:justify-end lg:col-start-auto lg:row-span-1 lg:row-start-auto">
          {podeRapido && !d && (
            <button onClick={() => p.decidir(r.id, "aprovar", { preco: r.preco_sugerido })} aria-label={`${r.acao === "MANTER" ? "Manter" : "Aprovar"} ${r.produto}, ${r.canal}, ${moeda(r.preco_sugerido)}`}
              className="flex h-11 items-center gap-1.5 rounded-[10px] border-2 border-subir/40 px-3 text-sm font-semibold text-subir hover:bg-subir-bg">
              <Check size={16} aria-hidden /> {r.acao === "MANTER" ? "Manter" : "Aprovar"}
            </button>
          )}
          <button onClick={onAbrir} className="ml-auto grid size-11 place-items-center rounded-[10px] text-suave hover:bg-roxo-50 hover:text-roxo sm:ml-0" aria-label={`Abrir ${r.produto}, ${r.canal}`}>
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
