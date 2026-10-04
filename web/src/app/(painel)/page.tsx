"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Info } from "lucide-react";
import { Movimento } from "@/components/PriceRuler";
import { AcaoBadge, Card, SinteticoTag, Titulo } from "@/components/ui";
import { ACAO_ROTULO, resumoCurto, rotuloAlerta } from "@/lib/explain";
import { dataBR, inteiro, pct, pp } from "@/lib/format";
import { FAIXA_COMPETITIVA, metricas } from "@/lib/metricas";
import { usePricing } from "@/lib/store";
import type { Acao, Canal } from "@/lib/types";

const ACOES: Acao[] = ["SUBIR", "BAIXAR", "MANTER", "REVISAR"];
const CANAIS: Canal[] = ["Loja física", "E-commerce", "Marketplace"];
const COR: Record<Acao, string> = { SUBIR: "bg-subir", BAIXAR: "bg-baixar", MANTER: "bg-manter", REVISAR: "bg-revisar" };

export default function VisaoGeral() {
  const p = usePricing();
  const m = metricas(p.recs, p.decisoes);
  const pendentes = p.recs.filter((r) => !p.decisaoDe(r.id));
  const porAcao = (lista: typeof p.recs) => Object.fromEntries(ACOES.map((a) => [a, lista.filter((r) => r.acao === a).length])) as Record<Acao, number>;
  const total = porAcao(p.recs);
  const semPreco = p.recs.filter((r) => r.preco_sugerido == null).length;
  const comRampa = p.recs.filter((r) => r.proposta.rampa).length;
  const elegiveis = p.recs.filter((r) => p.eligibility(r).elegivel).length;
  const proximas = [...pendentes].sort((a, b) => b.prioridade - a.prioridade).slice(0, 5);

  const grupos = new Map<string, { texto: string; tipo: string; n: number }>();
  p.recs.forEach((r) =>
    r.alertas.forEach((a) => {
      const chave = a.codigo ?? (a.texto.startsWith("Piso") ? "PISO" : a.texto);
      const g = grupos.get(chave) ?? { texto: a.texto.startsWith("Regra “") ? a.texto.replace(/ exige aprovação\.$/, "") : rotuloAlerta(a), tipo: a.tipo, n: 0 };
      g.n++;
      grupos.set(chave, g);
    }),
  );
  const alertas = [...grupos.values()].sort((a, b) => b.n - a.n);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-suave">
            {p.cenario === "oficial" ? "Base oficial do desafio" : p.cenario === "sintetico" ? "Cenários sintéticos" : `Base enviada (${p.base.fonte})`} · referência {dataBR(p.base.data_referencia)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            {pendentes.length} preços para decidir
          </h1>
        </div>
        <Link href="/fila" className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-roxo px-4 text-sm font-semibold text-white hover:bg-roxo-700">
          Abrir a fila <ArrowRight size={16} />
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {ACOES.map((a) => (
          <Link key={a} href={`/fila?acao=${a}`} className="group rounded-[15px] border border-linha bg-superficie p-4 transition-all hover:border-roxo hover:shadow-[0_6px_18px_rgba(61,35,88,0.08)] active:scale-[0.99]">
            <span className="flex items-center justify-between">
              <AcaoBadge acao={a} />
              <ArrowRight size={16} className="text-suave transition-transform group-hover:translate-x-0.5 group-hover:text-roxo" aria-hidden />
            </span>
            <p className="num mt-3 font-display text-3xl font-semibold text-tinta">{total[a]}</p>
            <p className="text-xs text-suave">
              {a === "SUBIR" && "recompõem margem ou acompanham o mercado"}
              {a === "BAIXAR" && "ganham competitividade com margem folgada"}
              {a === "MANTER" && "já estão no ponto de equilíbrio"}
              {a === "REVISAR" && `${semPreco} sem preço possível dentro de ${pct(p.parametros.R02, 0)}`}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <Titulo eyebrow="Por canal">Como as recomendações se distribuem</Titulo>
          <div className="space-y-4">
            {CANAIS.map((c) => {
              const lista = p.recs.filter((r) => r.canal === c);
              const n = porAcao(lista);
              return (
                <div key={c}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-tinta">{c}</span>
                    <span className="text-suave">{lista.length} produtos</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-fundo" role="img" aria-label={ACOES.map((a) => `${ACAO_ROTULO[a]} ${n[a]}`).join(", ")}>
                    {ACOES.map((a) => n[a] > 0 && <div key={a} className={COR[a]} style={{ width: `${(n[a] / lista.length) * 100}%` }} />)}
                  </div>
                  <p className="mt-1 text-xs text-suave">
                    {ACOES.filter((a) => n[a]).map((a) => `${ACAO_ROTULO[a]} ${n[a]}`).join(" · ")}
                  </p>
                </div>
              );
            })}
          </div>
          {comRampa > 0 && (
            <p className="mt-5 rounded-[10px] bg-revisar-bg p-3 text-sm text-revisar">
              <strong>{comRampa} {comRampa === 1 ? "caso precisaria" : "casos precisariam"}</strong> subir mais de {pct(p.parametros.R02, 0)} para chegar à margem mínima. A proposta da V2 é reajustar em etapas, com aprovação.{" "}
              <Link href="/regras#rampa" className="font-semibold underline">Ver proposta</Link>
            </p>
          )}
        </Card>

        <Card>
          <Titulo eyebrow="Medido nesta sessão">Impacto das suas decisões</Titulo>
          <dl className="space-y-4 text-sm">
            <Metrica rotulo={`Na faixa competitiva (até ${pct(FAIXA_COMPETITIVA, 0)} do mercado)`} hoje={pct(m.faixaHoje, 0)} depois={pct(m.faixaDepois, 0)} delta={pp(m.faixaDepois - m.faixaHoje)} />
            <Metrica rotulo={p.marginFormula === "contribution" ? "Margem média de contribuição" : "Margem bruta média"} hoje={pct(m.margemHoje)} depois={pct(m.margemDepois)} delta={pp(m.margemDepois - m.margemHoje)} />
            <Metrica rotulo="Itens abaixo do preço mínimo" hoje={inteiro(m.abaixoPisoHoje)} depois={inteiro(m.abaixoPisoDepois)} delta={m.abaixoPisoDepois !== m.abaixoPisoHoje ? `${m.abaixoPisoDepois > m.abaixoPisoHoje ? "+" : "−"}${Math.abs(m.abaixoPisoDepois - m.abaixoPisoHoje)}` : undefined} />
            <div className="grid grid-cols-2 gap-3 border-t border-linha pt-4">
              <div>
                <dt className="text-xs text-suave">Aceitação das recomendações</dt>
                <dd className="num font-display text-xl font-semibold text-tinta">{m.aceitacao == null ? "—" : pct(m.aceitacao, 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-suave">Tempo médio por decisão</dt>
                <dd className="num font-display text-xl font-semibold text-tinta">{m.tempoMedioSeg == null ? "—" : `${Math.round(m.tempoMedioSeg)} s`}</dd>
              </div>
            </div>
          </dl>
          <p className="mt-4 text-xs text-suave">Linha de base informada na base (fictícia): 67% na faixa competitiva, 18 h por semana de revisão manual.</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <Titulo eyebrow="Maior prioridade" acao={<Link href="/fila" className="text-sm font-semibold text-roxo">Ver todas</Link>}>
            Comece por aqui
          </Titulo>
          <ul className="divide-y divide-linha">
            {proximas.map((r) => (
              <li key={r.id}>
                <Link href={`/fila?item=${encodeURIComponent(r.id)}`} className="-mx-3 flex items-center gap-4 rounded-[10px] px-3 py-3 transition-colors hover:bg-roxo-50/60">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-tinta">
                      {r.produto} {r.sintetico && <SinteticoTag />}
                    </p>
                    <p className="truncate text-xs text-suave">{r.sku} · {r.canal} · {resumoCurto(r)}</p>
                  </div>
                  <div className="hidden sm:block"><Movimento r={r} /></div>
                  <AcaoBadge acao={r.acao} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <Titulo eyebrow="Agrupados por regra">Regras acionadas</Titulo>
          <ul className="space-y-2 text-sm">
            {alertas.map((g) => (
              <li key={g.texto} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  {g.tipo === "bloqueio" ? <Ban size={15} className="shrink-0 text-piso" aria-label="Bloqueia" />
                    : g.tipo === "aprovacao" ? <AlertTriangle size={15} className="shrink-0 text-revisar" aria-label="Pede aprovação" />
                    : <Info size={15} className="shrink-0 text-suave" aria-label="Informativo" />}
                  {g.texto}
                </span>
                <span className="num text-suave">{g.n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-suave">
            <span className="inline-flex items-center gap-1"><Info size={13} aria-hidden /> informativo</span>
            <span className="inline-flex items-center gap-1"><AlertTriangle size={13} className="text-revisar" aria-hidden /> pede aprovação</span>
            <span className="inline-flex items-center gap-1"><Ban size={13} className="text-piso" aria-hidden /> bloqueia a sugestão</span>
          </p>
          <div className="mt-4 rounded-[10px] bg-roxo-50 p-3 text-sm">
            <span className="font-semibold text-tinta">{elegiveis}</span> itens poderiam ir para o piloto automático com o teto atual de {pct(p.piloto.teto, 0)}.{" "}
            <Link href="/pilotagem" className="font-semibold text-roxo">Pilotagem</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metrica({ rotulo, hoje, depois, delta }: { rotulo: string; hoje: string; depois: string; delta?: string }) {
  return (
    <div>
      <dt className="text-xs text-suave">{rotulo}</dt>
      <dd className="num mt-0.5 flex items-baseline gap-2 text-tinta">
        <span className="text-base">{hoje}</span>
        <span className="text-suave">→</span>
        <span className="font-display text-xl font-semibold">{depois}</span>
        {delta && <span className="text-xs text-suave">{delta}</span>}
      </dd>
    </div>
  );
}
