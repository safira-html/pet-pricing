"use client";

import clsx from "clsx";
import { ArrowRight, BrainCircuit, CalendarClock, Check, CirclePause, History, LineChart, Plane, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Botao, Card, Titulo, Vazio } from "@/components/ui";
import { REGRAS } from "@/lib/explain";
import { dataBR, dataHoraBR, inteiro, moeda, pct } from "@/lib/format";
import { MEASUREMENT_DAYS, profitChange, verb, VERDICT_COUNT, VERDICT_LABEL, type SegmentLearning } from "@/lib/impact";
import { MARGIN_FORMULAS } from "@/lib/margin";
import { metricas } from "@/lib/metricas";
import { usePricing } from "@/lib/store";
import type { Evento, OutcomeVerdict } from "@/lib/types";

type Tab = "impact" | "learnings" | "history";
const TABS: { id: Tab; label: string; icon: typeof LineChart }[] = [
  { id: "impact", label: "Impacto", icon: LineChart },
  { id: "learnings", label: "Aprendizados", icon: BrainCircuit },
  { id: "history", label: "Histórico", icon: History },
];
const EVENT_TYPES: Evento["tipo"][] = ["decisão", "impacto", "piloto automático", "veto", "modo", "configuração", "base"];
const VERDICT_CLASS: Record<OutcomeVerdict, string> = {
  improved: "bg-subir-bg text-subir",
  neutral: "bg-manter-bg text-manter",
  worsened: "bg-piso-bg text-piso",
};

export default function ImpactAndLearning() {
  const p = usePricing();
  const [tab, setTab] = useState<Tab>("impact");
  const holds = p.learnings.filter((l) => l.effect === "hold" && !l.dismissed).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Impacto e aprendizado</h1>
        <p className="max-w-[68ch] text-sm text-suave">
          Cada mudança aplicada é medida {MEASUREMENT_DAYS} dias depois. O resultado, somado às decisões das pessoas, vira aprendizado por categoria e canal, e o aprendizado pode tirar um grupo do piloto automático.
        </p>
      </header>

      <div role="tablist" aria-label="Seções" className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={clsx("inline-flex h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition-colors",
              tab === id ? "border-roxo bg-roxo-50 font-semibold text-roxo-800" : "border-linha bg-superficie text-texto hover:border-roxo")}>
            <Icon size={16} aria-hidden /> {label}
            {id === "impact" && p.outcomes.length > 0 && <span className="num rounded-full bg-roxo-100 px-1.5 text-xs">{p.outcomes.length}</span>}
            {id === "learnings" && holds > 0 && <span className="num rounded-full bg-piso-bg px-1.5 text-xs text-piso">{holds}</span>}
          </button>
        ))}
      </div>

      {tab === "impact" && <ImpactTab />}
      {tab === "learnings" && <LearningsTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

function ImpactTab() {
  const p = usePricing();
  const m = metricas(p.recs, p.decisoes);
  const pending = p.agendamentos.filter((a) => a.status === "agendado" || a.status === "aguardando veto");
  const byId = new Map(p.recs.map((r) => [r.id, r]));
  const sum = (f: (o: (typeof p.outcomes)[number]) => number) => p.outcomes.reduce((s, o) => s + f(o), 0);
  const profitBefore = sum((o) => o.profitBefore);
  const profitAfter = sum((o) => o.profitAfter);
  const unitsBefore = sum((o) => o.unitsBefore);
  const unitsAfter = sum((o) => o.unitsAfter);
  const count = (v: OutcomeVerdict) => p.outcomes.filter((o) => o.verdict === v).length;
  const [ran, setRan] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-roxo-50 text-roxo"><CalendarClock size={20} aria-hidden /></span>
          <div>
            <p className="font-medium text-tinta">
              {pending.length
                ? `${pending.length} ${pending.length === 1 ? "mudança agendada espera" : "mudanças agendadas esperam"} para ser aplicada${pending.length === 1 ? "" : "s"} e medida${pending.length === 1 ? "" : "s"}`
                : "Nenhuma mudança agendada esperando medição"}
            </p>
            <p className="text-sm text-suave">
              Sem o ERP conectado, o protótipo simula as vendas dos {MEASUREMENT_DAYS} dias seguintes. <Link href="/integrations" className="text-roxo underline">Ver integrações</Link>
            </p>
            {ran != null && <p className="mt-1 text-sm font-medium text-subir">{ran} {ran === 1 ? "mudança medida" : "mudanças medidas"}. Os resultados estão abaixo.</p>}
          </div>
        </div>
        {p.pode("pilotar") && (
          <Botao disabled={!pending.length} onClick={() => setRan(p.simulateMeasurement())}>
            <CalendarClock size={16} /> Simular {MEASUREMENT_DAYS} dias
          </Botao>
        )}
      </Card>

      <Card>
        <Titulo eyebrow="Carteira inteira">Antes e depois das decisões</Titulo>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Itens na faixa competitiva (±2% do mercado)", before: pct(m.faixaHoje, 0), after: pct(m.faixaDepois, 0) },
            { label: `Margem média (${MARGIN_FORMULAS[p.marginFormula].label.toLowerCase()})`, before: pct(m.margemHoje), after: pct(m.margemDepois) },
            { label: "Itens abaixo da margem mínima", before: inteiro(m.abaixoPisoHoje), after: inteiro(m.abaixoPisoDepois) },
          ].map((x) => (
            <div key={x.label} className="rounded-[12px] bg-fundo p-4">
              <p className="text-xs text-suave">{x.label}</p>
              <p className="num mt-1 flex items-center gap-2 font-display text-xl font-semibold text-tinta">
                <span className="text-suave">{x.before}</span><ArrowRight size={16} className="text-suave" aria-hidden />{x.after}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {p.outcomes.length === 0 ? (
        <Vazio titulo="Ainda não há mudanças medidas">
          Aprove recomendações na <Link href="/fila" className="text-roxo underline">fila de decisões</Link> ou agende mudanças pelo piloto automático. Depois, simule os {MEASUREMENT_DAYS} dias para ver o resultado de cada uma.
        </Vazio>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="Contribuição por mês, só nos itens alterados" before={moeda(profitBefore)} after={moeda(profitAfter)}
              delta={profitBefore ? pct((profitAfter - profitBefore) / Math.abs(profitBefore), 1, true) : null} good={profitAfter >= profitBefore} />
            <Kpi label="Unidades vendidas por mês" before={inteiro(unitsBefore)} after={inteiro(unitsAfter)}
              delta={unitsBefore ? pct(unitsAfter / unitsBefore - 1, 1, true) : null} good={unitsAfter >= unitsBefore * 0.97} />
            <Card className="p-4">
              <p className="text-xs text-suave">Resultado das mudanças</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["improved", "neutral", "worsened"] as OutcomeVerdict[]).map((v) => (
                  <span key={v} className={clsx("num rounded-full px-2.5 py-1 text-sm font-semibold", VERDICT_CLASS[v])}>{count(v)} {verb(count(v), ...VERDICT_COUNT[v])}</span>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <Titulo eyebrow={`Medido ${MEASUREMENT_DAYS} dias depois de aplicar`}>Mudança por mudança</Titulo>
            <ul className="divide-y divide-linha">
              {p.outcomes.map((o) => {
                const r = byId.get(o.recId);
                const change = profitChange(o);
                return (
                  <li key={o.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-tinta">{r?.produto ?? o.recId}</p>
                      <p className="text-xs text-suave">{r?.canal} · {o.origin === "piloto automático" ? "piloto automático" : "decisão humana"} · aplicada em {dataBR(o.appliedAt)}</p>
                    </div>
                    <p className="num text-sm">
                      <span className="text-suave">{moeda(o.oldPrice)}</span> → <strong className="text-tinta">{moeda(o.newPrice)}</strong>
                      <span className="block text-xs text-suave">{pct(o.newPrice / o.oldPrice - 1, 1, true)}</span>
                    </p>
                    <p className="num text-sm">
                      {inteiro(o.unitsBefore)} → <strong className="text-tinta">{inteiro(o.unitsAfter)}</strong> un./mês
                      <span className="block text-xs text-suave">previsto: {inteiro(o.unitsExpected)}</span>
                    </p>
                    <p className="num text-sm">
                      {moeda(o.profitAfter - o.profitBefore)}/mês
                      <span className="block text-xs text-suave">{change == null ? "—" : `${pct(change, 1, true)} de contribuição`}</span>
                    </p>
                    <span className={clsx("justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold md:justify-self-end", VERDICT_CLASS[o.verdict])}>{VERDICT_LABEL[o.verdict]}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      <Card>
        <Titulo eyebrow="Como a simulação funciona">De onde vêm os números</Titulo>
        <ul className="list-disc space-y-1 pl-5 text-sm text-texto">
          <li>Vendas antes: média mensal dos 3 últimos meses da base, por produto e canal.</li>
          <li>Vendas previstas: sensibilidade a preço de cada categoria, estimada das vendas de 12 meses da própria base.</li>
          <li>Vendas “observadas”: o previsto com variação de até 10% para cima ou para baixo e perda extra de 8% quando o preço novo fica mais de 3% acima do mercado. É simulação, não dado real.</li>
          <li>Contribuição: unidades × (preço − custos da fórmula em uso). Melhora ou piora conta a partir de 1%.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(p.elasticity).sort((a, b) => a[1] - b[1]).map(([cat, e]) => (
            <span key={cat} className="num rounded-full border border-linha px-3 py-1 text-xs">{cat}: {e.toFixed(2).replace(".", ",")}</span>
          ))}
        </div>
        <p className="mt-2 text-xs text-suave">Quanto mais negativo, mais as vendas caem quando o preço sobe. Com o ERP conectado, as vendas depois da mudança vêm do sistema.</p>
      </Card>
    </div>
  );
}

function Kpi({ label, before, after, delta, good }: { label: string; before: string; after: string; delta: string | null; good: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-suave">{label}</p>
      <p className="num mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-semibold text-tinta">
        <span className="text-suave">{before}</span><ArrowRight size={16} className="text-suave" aria-hidden />{after}
      </p>
      {delta && <p className={clsx("num mt-1 text-sm font-semibold", good ? "text-subir" : "text-piso")}>{delta}</p>}
    </Card>
  );
}

function LearningsTab() {
  const p = usePricing();
  const active = p.learnings.filter((l) => l.effect !== "none");
  const quiet = p.learnings.filter((l) => l.effect === "none");
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

  return (
    <div className="space-y-6">
      <Card>
        <Titulo eyebrow="Por categoria e canal">O que o sistema aprendeu</Titulo>
        <p className="max-w-[68ch] text-sm text-texto">
          Um grupo sai do piloto automático quando metade ou mais das mudanças medidas piorou a contribuição (mínimo de 2) ou quando os analistas rejeitaram metade ou mais das recomendações (mínimo de 3). Colocar um grupo no piloto continua sendo decisão do gestor.
        </p>
        {active.length === 0 ? (
          <div className="mt-4">
            <Vazio titulo="Nenhum aprendizado com efeito ainda">
              Aparece depois de mudanças medidas na aba Impacto ou de decisões na fila. Grupos com poucos casos não mudam nada.
            </Vazio>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {active.map((l) => <LearningCard key={l.key} l={l} />)}
          </ul>
        )}
      </Card>

      {quiet.length > 0 && (
        <Card>
          <Titulo eyebrow="Sem efeito no piloto">Grupos acompanhados</Titulo>
          <ul className="divide-y divide-linha text-sm">
            {quiet.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium text-tinta">{l.categoria}</span> <span className="text-suave">· {l.canal}</span></span>
                <span className="num text-xs text-suave">
                  {l.measured} {verb(l.measured, "mudança medida", "mudanças medidas")} ({l.improved} {verb(l.improved, "melhorou", "melhoraram")}, {l.worsened} {verb(l.worsened, "piorou", "pioraram")}) · {l.decisions} {verb(l.decisions, "decisão", "decisões")} ({l.rejected} {verb(l.rejected, "rejeitada", "rejeitadas")})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
    </div>
  );
}

function LearningCard({ l }: { l: SegmentLearning }) {
  const p = usePricing();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const inSegment = p.recs.filter((r) => r.categoria === l.categoria && r.canal === l.canal);
  const inAutopilot = inSegment.filter((r) => p.modoDe(r.id) === "autopiloto").length;
  const hasRule = p.regrasPiloto.some((g) => g.categoria === l.categoria && g.canal === l.canal && !g.curva);
  const hold = l.effect === "hold";

  return (
    <li className={clsx("rounded-[12px] border p-4", hold && !l.dismissed ? "border-piso/40 bg-piso-bg/40" : hold ? "border-linha" : "border-subir/40 bg-subir-bg/40")}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-tinta">{l.categoria} · {l.canal}</span>
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          hold && !l.dismissed ? "bg-piso-bg text-piso" : hold ? "bg-manter-bg text-manter" : "bg-subir-bg text-subir")}>
          {hold ? <CirclePause size={12} aria-hidden /> : <Plane size={12} aria-hidden />}
          {hold ? (l.dismissed ? "Ignorado pelo gestor" : "Fora do piloto automático") : "Candidato ao piloto automático"}
        </span>
      </p>
      <p className="mt-2 text-sm text-texto">Motivo: {l.reason}.</p>
      <p className="mt-1 text-xs text-suave">
        {inSegment.length} {inSegment.length === 1 ? "item" : "itens"} no grupo, {inAutopilot} em piloto automático{hold && !l.dismissed && inAutopilot ? ": viram copiloto até o aprendizado mudar" : ""}.
      </p>

      {p.pode("pilotar") && (
        <div className="mt-3">
          {hold && !l.dismissed && !asking && (
            <Botao variante="fantasma" className="-ml-3" onClick={() => setAsking(true)}><X size={16} /> Ignorar este aprendizado</Botao>
          )}
          {hold && l.dismissed && (
            <Botao variante="fantasma" className="-ml-3" onClick={() => p.restoreLearning(l.key)}><RotateCcw size={16} /> Voltar a aplicar</Botao>
          )}
          {asking && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-56 flex-1 text-sm font-medium text-tinta">Motivo
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Queda causada por ruptura de estoque"
                  className="mt-1.5 h-11 w-full rounded-[10px] border border-linha-forte bg-superficie px-3 text-sm outline-none focus:border-roxo" />
              </label>
              <Botao variante="fantasma" onClick={() => setAsking(false)}>Cancelar</Botao>
              <Botao disabled={reason.trim().length < 5} onClick={() => { p.dismissLearning(l.key, reason.trim()); setAsking(false); }}><Check size={16} /> Confirmar</Botao>
            </div>
          )}
          {!hold && (hasRule ? (
            <p className="text-xs font-medium text-subir">Já existe regra de piloto para este grupo.</p>
          ) : (
            <Botao variante="secundario" onClick={() => p.adicionarRegraPiloto({ curva: null, canal: l.canal, categoria: l.categoria })}>
              <Plane size={16} /> Criar regra de piloto
            </Botao>
          ))}
        </div>
      )}
    </li>
  );
}

function HistoryTab() {
  const p = usePricing();
  const [filter, setFilter] = useState<Evento["tipo"] | null>(null);
  const events = p.eventos.filter((e) => !filter || e.tipo === filter);
  return (
    <Card>
      <Titulo eyebrow="Rastreabilidade">Linha do tempo</Titulo>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {EVENT_TYPES.map((t) => (
          <button key={t} onClick={() => setFilter(filter === t ? null : t)} aria-pressed={filter === t}
            className={clsx("min-h-10 rounded-full border px-3.5 text-sm capitalize", filter === t ? "border-roxo bg-roxo-50 font-semibold text-roxo" : "border-linha hover:border-roxo")}>
            {t}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <Vazio titulo="Nada registrado ainda">Toda decisão, medição, mudança de modo e veto aparece aqui com autor e horário. <Link href="/fila" className="text-roxo underline">Ir para a fila</Link></Vazio>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-roxo-100 pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className={clsx("absolute top-1.5 -left-[27px] size-3 rounded-full ring-4 ring-superficie",
                e.tipo === "veto" ? "bg-piso" : e.tipo === "piloto automático" ? "bg-roxo" : e.tipo === "decisão" ? "bg-limao" : e.tipo === "impacto" ? "bg-baixar" : "bg-linha-forte")} aria-hidden />
              <p><strong className="text-tinta">{e.autor}</strong> {e.texto}</p>
              <p className="text-xs text-suave">{dataHoraBR(e.quando)} · {e.tipo}{e.recId && <> · <Link href={`/fila?item=${encodeURIComponent(e.recId)}`} className="text-roxo underline">abrir item</Link></>}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
