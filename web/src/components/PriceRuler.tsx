import clsx from "clsx";
import { limiteTxt, manchete } from "@/lib/explain";
import { moeda, pct } from "@/lib/format";
import type { Recomendacao } from "@/lib/types";

/**
 * Mapa de preço: cada referência tem a própria linha, com nome em palavras,
 * todas na mesma escala. A faixa de ±5% ao fundo mostra o alcance de uma decisão.
 */
export function MapaPreco({ r }: { r: Recomendacao }) {
  const concorrentes = r.concorrentes.filter((c) => c.preco != null && c.disponivel === "Sim");
  const ehRampa = r.preco_sugerido == null && r.proposta.rampa != null;
  const sugerido = r.preco_sugerido ?? r.proposta.rampa?.preco_etapa_1 ?? null;
  const valores = [r.preco_atual, r.preco_minimo, r.preco_alvo, r.limite_inferior, r.limite_superior, ...concorrentes.map((c) => c.preco!)];
  if (sugerido != null) valores.push(sugerido);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const folga = (max - min) * 0.06 || r.preco_atual * 0.04;
  const lo = min - folga;
  const hi = max + folga;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const cor = r.acao === "SUBIR" ? "var(--subir)" : r.acao === "BAIXAR" ? "var(--baixar)" : r.acao === "MANTER" ? "var(--manter)" : "var(--revisar)";
  const pendente = ehRampa || r.acao === "REVISAR";

  const linhas: { rotulo: string; detalhe: string; valor: string; marca: React.ReactNode; destaque?: boolean }[] = [
    {
      rotulo: "Preço hoje",
      detalhe: `margem de ${pct(r.margem.atual)}`,
      valor: moeda(r.preco_atual),
      marca: <Ponto v={x(r.preco_atual)} className="size-3.5 bg-tinta ring-2 ring-white" />,
    },
    {
      rotulo: "Concorrentes",
      detalhe: r.preco_mercado != null ? `mediana de ${concorrentes.length}` : "sem preço válido",
      valor: moeda(r.preco_mercado),
      marca: (
        <>
          {concorrentes.map((c) => (
            <Ponto key={c.nome} v={x(c.preco!)} className="size-3 border-2 border-suave bg-white" titulo={`${c.nome}: ${moeda(c.preco)}`} />
          ))}
          {r.preco_mercado != null && <Ponto v={x(r.preco_mercado)} className="size-2.5 rotate-45 rounded-none bg-suave" titulo="mediana" />}
        </>
      ),
    },
    {
      rotulo: "Mínimo para a margem",
      detalhe: `abaixo disso, menos de ${pct(r.margem.minima, 0)}`,
      valor: moeda(r.preco_minimo),
      marca: (
        <>
          <div className="absolute inset-y-1 left-0 rounded-l bg-piso-bg" style={{ width: x(r.preco_minimo) }} />
          <div className="absolute inset-y-0 w-0.5 bg-piso" style={{ left: x(r.preco_minimo) }} />
        </>
      ),
    },
    {
      rotulo: "Preço ideal",
      detalhe: `margem alvo de ${pct(r.margem.alvo, 0)}`,
      valor: moeda(r.preco_alvo),
      marca: <div className="absolute inset-y-1 w-0.5 border-l-2 border-dotted border-roxo" style={{ left: x(r.preco_alvo) }} />,
    },
  ];

  if (sugerido != null) {
    const de = Math.min(r.preco_atual, sugerido);
    const ate = Math.max(r.preco_atual, sugerido);
    linhas.push({
      rotulo: ehRampa ? "1ª etapa da rampa" : r.acao === "REVISAR" ? "Preço calculado" : "Sugestão",
      detalhe: ehRampa ? `de ${r.proposta.rampa!.etapas} etapas` : r.acao === "REVISAR" ? "depende de revisão" : pct(r.variacao ?? 0, 1, true),
      valor: moeda(sugerido),
      destaque: true,
      marca: (
        <>
          <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: x(de), width: `calc(${x(ate)} - ${x(de)})`, background: cor, opacity: pendente ? 0.45 : 1 }} />
          <Ponto v={x(r.preco_atual)} className="size-2.5 bg-tinta" />
          <Ponto v={x(sugerido)} className={clsx("size-4 border-[3px] bg-white", pendente && "border-dashed")} style={{ borderColor: cor }} />
        </>
      ),
    });
  }

  return (
    <figure>
      <p className="font-display text-[15px] leading-snug font-semibold text-tinta">{manchete(r)}</p>
      <div className="mt-4 grid grid-cols-[minmax(130px,auto)_1fr_auto] items-center gap-x-4 text-sm">
        <div />
        <div className="relative h-6">
          <div className="absolute inset-y-0 flex items-center justify-center rounded-t-md border-x border-t border-dashed border-roxo bg-roxo-50 text-xs font-medium text-roxo-700"
            style={{ left: x(r.limite_inferior), width: `calc(${x(r.limite_superior)} - ${x(r.limite_inferior)})` }}>
            <span className="truncate px-1">alcance de uma decisão (±{limiteTxt(r)})</span>
          </div>
        </div>
        <div />
        {linhas.map((l, i) => (
          <Linha key={l.rotulo} {...l} ultima={i === linhas.length - 1} faixa={{ esq: x(r.limite_inferior), dir: x(r.limite_superior) }} />
        ))}
        <div />
        <div className="relative h-5 text-xs text-suave">
          <span className="absolute -translate-x-1/2 num" style={{ left: x(r.limite_inferior) }}>{moeda(r.limite_inferior)}</span>
          <span className="absolute -translate-x-1/2 num" style={{ left: x(r.limite_superior) }}>{moeda(r.limite_superior)}</span>
        </div>
        <div />
      </div>
      <figcaption className="sr-only">
        {linhas.map((l) => `${l.rotulo}: ${l.valor} (${l.detalhe})`).join("; ")}
      </figcaption>
    </figure>
  );
}

function Linha({ rotulo, detalhe, valor, marca, destaque, ultima, faixa }: {
  rotulo: string; detalhe: string; valor: string; marca: React.ReactNode; destaque?: boolean; ultima: boolean; faixa: { esq: string; dir: string };
}) {
  return (
    <>
      <div className={clsx("py-2.5", destaque && "font-semibold")}>
        <p className={clsx("leading-tight", destaque ? "text-tinta" : "text-texto")}>{rotulo}</p>
        <p className="text-xs font-normal text-suave">{detalhe}</p>
      </div>
      <div className={clsx("relative h-full min-h-11", !ultima && "border-b border-linha/70")}>
        <div className={clsx("absolute inset-y-0 border-x border-dashed border-roxo/40 bg-roxo-50/60", ultima && "rounded-b-md border-b")} style={{ left: faixa.esq, width: `calc(${faixa.dir} - ${faixa.esq})` }} />
        <div className="absolute inset-x-0 top-1/2 h-px bg-linha" />
        {marca}
      </div>
      <p className={clsx("num py-2.5 text-right", destaque ? "rounded-md bg-limao-100 px-2 font-display font-semibold text-tinta" : "text-texto")}>{valor}</p>
    </>
  );
}

function Ponto({ v, className, titulo, style }: { v: string; className: string; titulo?: string; style?: React.CSSProperties }) {
  return <span title={titulo} className={clsx("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full", className)} style={{ left: v, ...style }} />;
}

/** Movimento sugerido, em texto: substitui a minirrégua na tabela. */
export function Movimento({ r }: { r: Recomendacao }) {
  if (r.preco_sugerido == null && r.proposta.rampa) {
    return (
      <span className="text-xs">
        <span className="font-semibold text-revisar">precisa de {pct(r.proposta.rampa.aumento_necessario, 1, true)}</span>
        <span className="block text-suave">acima do limite de {limiteTxt(r)}</span>
      </span>
    );
  }
  if (r.preco_sugerido == null) return <span className="text-xs text-suave">sem preço possível</span>;
  const cor = r.acao === "SUBIR" ? "text-subir" : r.acao === "BAIXAR" ? "text-baixar" : r.acao === "MANTER" ? "text-manter" : "text-revisar";
  return (
    <span className="num whitespace-nowrap text-xs">
      <span className="text-suave">{moeda(r.preco_atual)} → </span>
      <span className={clsx("font-semibold", cor)}>{moeda(r.preco_sugerido)}</span>
      <span className="block text-suave">{r.acao === "MANTER" ? "sem mudança" : pct(r.variacao ?? 0, 1, true)}{r.acao === "REVISAR" ? " · se aprovado" : ""}</span>
    </span>
  );
}
