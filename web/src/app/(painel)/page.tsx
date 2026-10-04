"use client";

import clsx from "clsx";
import { ArrowRight, BrainCircuit, CalendarClock, Check, ChevronRight, Hand, Minus, Plane, TrendingDown, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AcaoBadge, Botao, Card, SinteticoTag, Titulo, botaoClasses } from "@/components/ui";
import { rotuloAlerta } from "@/lib/explain";
import { dataBR, inteiro, moeda, pct } from "@/lib/format";
import { MARGIN_FORMULAS } from "@/lib/margin";
import { FAIXA_COMPETITIVA } from "@/lib/metricas";
import { monthlyGain, queueGroup } from "@/lib/queue";
import { usePricing } from "@/lib/store";
import type { Acao, Canal, Recomendacao } from "@/lib/types";

const CHANNELS: Canal[] = ["Loja física", "E-commerce", "Marketplace"];

/** As perguntas que o enunciado do desafio faz; cada cartão responde uma. */
const QUESTIONS: { action: Acao; question: string; icon: LucideIcon; tone: string }[] = [
  { action: "SUBIR", question: "Onde subir?", icon: TrendingUp, tone: "text-subir bg-subir-bg" },
  { action: "BAIXAR", question: "Onde baixar?", icon: TrendingDown, tone: "text-baixar bg-baixar-bg" },
  { action: "MANTER", question: "O que não mexer?", icon: Minus, tone: "text-manter bg-manter-bg" },
  { action: "REVISAR", question: "O que precisa de uma pessoa?", icon: Hand, tone: "text-revisar bg-revisar-bg" },
];

/** Motivo principal de um item que precisa de revisão, para agrupar no cartão. */
function reviewReason(r: Recomendacao) {
  if (r.preco_sugerido == null && r.proposta.rampa) return "Rampa de reajuste";
  const alert = r.alertas.find((a) => a.tipo === "bloqueio") ?? r.alertas.find((a) => a.tipo === "aprovacao");
  if (!alert) return "Outros sinais";
  if (alert.codigo === "R09") return "Promoção ativa";
  if (alert.codigo === "R06" || alert.codigo === "R10") return "Concorrência";
  return rotuloAlerta(alert).replace(/^R\d+ · /, "");
}

export default function Overview() {
  const p = usePricing();
  const decided = new Set(p.decisoes.map((d) => d.recId));
  const pending = p.recs.filter((r) => !decided.has(r.id));
  const quick = pending.filter((r) => queueGroup(r, false) === "rapida");
  const gains = new Map(pending.map((r) => [r.id, r.acao === "SUBIR" || r.acao === "BAIXAR" ? monthlyGain(r, p.elasticity) : null]));
  const atStake = [...gains.values()].reduce<number>((s, g) => s + (g ?? 0), 0);
  const belowMin = p.recs.filter((r) => r.margem.atual < r.margem.minima - 1e-9).length;
  const humanDecisions = p.decisoes.filter((d) => d.perfil !== "sistema" && d.segundosAteDecidir != null);
  const avgSeconds = humanDecisions.length ? humanDecisions.reduce((s, d) => s + (d.segundosAteDecidir ?? 0), 0) / humanDecisions.length : null;
  const canQuickApprove = (r: Recomendacao) => p.pode("decidir") && queueGroup(r, false) === "rapida" && (r.risco !== "Alto" || p.pode("risco_alto"));

  const opportunities = pending
    .filter((r) => (gains.get(r.id) ?? 0) > 0)
    .sort((a, b) => (gains.get(b.id) ?? 0) - (gains.get(a.id) ?? 0))
    .slice(0, 6);

  // Canal com a maior distância entre margem média e mínima média: a leitura principal do cartão.
  const worst = CHANNELS.map((c) => {
    const list = p.recs.filter((r) => r.canal === c);
    if (!list.length) return null;
    const avg = list.reduce((s, r) => s + r.margem.atual, 0) / list.length;
    const min = list.reduce((s, r) => s + r.margem.minima, 0) / list.length;
    return { channel: c, gap: min - avg, fee: p.marginFormula === "gross" ? 0 : list[0].custo.taxa_canal };
  }).filter((x): x is { channel: Canal; gap: number; fee: number } => !!x && x.gap > 0).sort((a, b) => b.gap - a.gap)[0];

  const scenario = p.cenario === "oficial" ? "Base oficial do desafio" : p.cenario === "sintetico" ? "Cenários sintéticos" : `Base enviada (${p.base.fonte})`;
  const vetoPending = p.agendamentos.filter((a) => a.status === "aguardando veto").length;
  const holds = p.learnings.filter((l) => l.effect === "hold" && !l.dismissed).length;
  const improved = p.outcomes.filter((o) => o.verdict === "improved").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hoje: o tamanho do trabalho, o dinheiro em jogo e o próximo passo */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-suave">{scenario} · referência {dataBR(p.base.data_referencia)} {p.cenario === "sintetico" && <SinteticoTag />}</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Hoje</h1>
        </div>
        {quick.length > 0 ? (
          <Link href="/fila?grupo=rapida" className={botaoClasses("primario")}>
            <Zap size={16} aria-hidden /> Começar pela aprovação rápida ({quick.length})
          </Link>
        ) : (
          <Link href="/fila" className={botaoClasses("primario")}>Abrir a fila <ArrowRight size={16} aria-hidden /></Link>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Preços para decidir" value={inteiro(pending.length)}
          hint={avgSeconds ? `cerca de ${Math.max(1, Math.round((pending.length * avgSeconds) / 60))} min no seu ritmo atual` : `${quick.length} com aprovação em um clique`} />
        <Stat label="Margem em jogo por mês" value={moeda(atStake)} tone={atStake >= 0 ? "text-subir" : "text-piso"}
          hint="se as sugestões de subir e baixar forem aprovadas (estimativa)" />
        <Stat label="Itens abaixo da margem mínima" value={`${inteiro(belowMin)} de ${p.recs.length}`} tone={belowMin ? "text-piso" : "text-tinta"}
          hint={MARGIN_FORMULAS[p.marginFormula].label.toLowerCase()} href="/regras#margem" />
      </div>

      {/* As perguntas do desafio, cada uma levando para a fila filtrada */}
      <section aria-labelledby="perguntas">
        <h2 id="perguntas" className="mb-3 text-lg font-semibold">O que o motor recomenda</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUESTIONS.map(({ action, question, icon: Icon, tone }) => {
            const items = pending.filter((r) => r.acao === action);
            const gain = items.reduce((s, r) => s + (gains.get(r.id) ?? 0), 0);
            const reasons = action === "REVISAR"
              ? Object.entries(items.reduce<Record<string, number>>((acc, r) => { const k = reviewReason(r); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)
              : [];
            const quickHere = items.filter((r) => queueGroup(r, false) === "rapida").length;
            return (
              <Link key={action} href={`/fila?acao=${action}`}
                className="group flex flex-col rounded-[15px] border border-linha bg-superficie p-5 transition-[border-color,box-shadow,transform,background-color] duration-200 hover:border-roxo hover:shadow-[0_6px_18px_rgba(61,35,88,0.08)] active:scale-[0.99]">
                <span className="flex items-center justify-between">
                  <span className={clsx("grid size-9 place-items-center rounded-[10px]", tone)}><Icon size={18} aria-hidden /></span>
                  <ArrowRight size={16} className="text-suave transition-transform group-hover:translate-x-0.5 group-hover:text-roxo" aria-hidden />
                </span>
                <span className="mt-3 text-sm font-medium text-texto">{question}</span>
                <span className="num font-display text-3xl font-semibold text-tinta">{items.length}</span>
                <span className="mt-1 text-sm text-suave">
                  {action === "SUBIR" && (items.length ? <>{moeda(gain)}/mês a mais · {quickHere} em um clique</> : "Nenhum item para subir")}
                  {action === "BAIXAR" && (items.length ? <>{gain >= 0 ? `${moeda(gain)}/mês a mais` : `${moeda(gain)}/mês, ganhando competitividade`}</> : "Nenhum item acima do mercado com margem folgada")}
                  {action === "MANTER" && (items.length ? "o preço já equilibra margem e mercado" : "Nenhum item no ponto de equilíbrio")}
                  {action === "REVISAR" && (items.length ? reasons.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ") : "Nada pede revisão")}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <Titulo eyebrow="Maior retorno primeiro" acao={<Link href="/fila" className="rounded-[8px] px-2 py-1 text-sm font-semibold text-roxo hover:bg-roxo-50 hover:text-roxo-800">Ver a fila</Link>}>
            Maiores oportunidades
          </Titulo>
          {opportunities.length === 0 ? (
            <p className="text-sm text-suave">Nenhuma sugestão pendente aumenta a contribuição. Veja os itens que pedem revisão.</p>
          ) : (
            <ul className="divide-y divide-linha">
              {opportunities.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <Link href={`/fila?item=${encodeURIComponent(r.id)}`} className="group min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tinta underline-offset-2 group-hover:text-roxo-800 group-hover:underline">{r.produto}</span>
                    <span className="text-xs text-suave">{r.canal} · {moeda(r.preco_atual)} → {moeda(r.preco_sugerido)} ({pct(r.variacao, 1, true)})</span>
                  </Link>
                  <span className="num text-right text-sm font-semibold text-subir">+{moeda(gains.get(r.id))}<span className="block text-xs font-normal text-suave">por mês</span></span>
                  {canQuickApprove(r) ? (
                    <Botao variante="secundario" className="h-10 px-3" onClick={() => p.decidir(r.id, "aprovar", { preco: r.preco_sugerido })} aria-label={`Aprovar ${r.produto}, ${r.canal}`}>
                      <Check size={16} aria-hidden /> Aprovar
                    </Botao>
                  ) : (
                    <Link href={`/fila?item=${encodeURIComponent(r.id)}`} className={clsx(botaoClasses("fantasma"), "h-10 px-3")} aria-label={`Abrir ${r.produto}, ${r.canal}`}>
                      <AcaoBadge acao={r.acao} /> <ChevronRight size={16} aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-suave">Ganho estimado com as vendas dos últimos 3 meses e a sensibilidade a preço de cada categoria.</p>
        </Card>

        <Card>
          <Titulo eyebrow="Saúde por canal">Margem hoje × mínima</Titulo>
          <ul className="space-y-5">
            {CHANNELS.map((c) => {
              const list = p.recs.filter((r) => r.canal === c);
              if (!list.length) return null;
              const avg = list.reduce((s, r) => s + r.margem.atual, 0) / list.length;
              const min = list.reduce((s, r) => s + r.margem.minima, 0) / list.length;
              const below = list.filter((r) => r.margem.atual < r.margem.minima - 1e-9).length;
              const withMarket = list.filter((r) => r.preco_mercado != null);
              const inBand = withMarket.filter((r) => Math.abs(r.preco_atual / r.preco_mercado! - 1) <= FAIXA_COMPETITIVA).length;
              const scale = 0.45;
              return (
                <li key={c}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-tinta">{c}</span>
                    <span className={clsx("num font-semibold", avg < min ? "text-piso" : "text-subir")}>{pct(avg)}</span>
                  </div>
                  {/* barra = margem média; risco vertical = mínima média */}
                  <div className="relative mt-1.5 h-2.5 rounded-full bg-fundo" role="img" aria-label={`Margem média ${pct(avg)}, mínima média ${pct(min)}`}>
                    <div className={clsx("h-full rounded-full", avg < min ? "bg-piso" : "bg-subir")} style={{ width: `${Math.max(0, Math.min(1, avg / scale)) * 100}%` }} />
                    <span className="absolute -top-1 h-[18px] w-0.5 rounded bg-tinta" style={{ left: `${Math.min(1, min / scale) * 100}%` }} aria-hidden />
                  </div>
                  <p className="mt-1.5 text-xs text-suave">
                    mínima média {pct(min)} · <span className={below ? "font-medium text-piso" : ""}>{below} de {list.length} abaixo</span> · {withMarket.length ? `${pct(inBand / withMarket.length, 0)} na faixa competitiva` : "sem mercado"}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-xs text-suave">
            <span className="inline-block h-3 w-0.5 rounded bg-tinta" aria-hidden /> margem mínima média do canal · barra = margem média hoje
          </p>
          {worst && (
            <p className="mt-4 rounded-[10px] bg-fundo p-3 text-sm text-texto">
              <strong className="text-tinta">{worst.channel}</strong> é o canal mais distante da mínima: na média, {(worst.gap * 100).toFixed(1).replace(".", ",")} pontos percentuais abaixo
              {worst.fee > 0 ? `, pesando a taxa de ${pct(worst.fee, 0)} do canal.` : "."}
            </p>
          )}
        </Card>
      </div>

      {/* Automação e aprendizado em uma faixa, cada item levando à tela certa */}
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Automação e aprendizado">
        <Strip href="/pilotagem" icon={Plane} title={p.piloto.ligado ? "Piloto automático ligado" : "Piloto automático desligado"}
          text={vetoPending ? `${vetoPending} ${vetoPending === 1 ? "mudança aguardando" : "mudanças aguardando"} veto` : `${p.regrasPiloto.length} ${p.regrasPiloto.length === 1 ? "regra de grupo" : "regras de grupo"} · teto de ${pct(p.piloto.teto, 0)}`} />
        <Strip href="/aprendizado" icon={CalendarClock} title="Impacto medido"
          text={p.outcomes.length ? `${improved} de ${p.outcomes.length} ${p.outcomes.length === 1 ? "mudança melhorou" : "mudanças melhoraram"} a contribuição` : "Nenhuma mudança medida ainda"} />
        <Strip href="/aprendizado" icon={BrainCircuit} title="Aprendizado"
          text={holds ? `${holds} ${holds === 1 ? "grupo fora" : "grupos fora"} do piloto por resultado ou rejeição` : "Nenhum grupo tirado do piloto"} tone={holds ? "text-piso" : undefined} />
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone = "text-tinta", href }: { label: string; value: string; hint: string; tone?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-texto">{label}</p>
      <p className={clsx("num mt-1 font-display text-3xl font-semibold", tone)}>{value}</p>
      <p className="mt-1 text-xs text-suave">{hint}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-[15px] border border-linha bg-superficie p-5 transition-[border-color,box-shadow,transform,background-color] duration-200 hover:border-roxo hover:shadow-[0_6px_18px_rgba(61,35,88,0.08)]">{body}</Link>
  ) : (
    <Card>{body}</Card>
  );
}

function Strip({ href, icon: Icon, title, text, tone }: { href: string; icon: LucideIcon; title: string; text: string; tone?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-[15px] border border-linha bg-superficie p-4 transition-[border-color,box-shadow,transform,background-color] duration-200 hover:border-roxo hover:shadow-[0_6px_18px_rgba(61,35,88,0.08)]">
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-roxo-50 text-roxo"><Icon size={18} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-tinta">{title}</span>
        <span className={clsx("block text-sm", tone ?? "text-suave")}>{text}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-suave group-hover:text-roxo" aria-hidden />
    </Link>
  );
}
