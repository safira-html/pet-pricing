"use client";

import clsx from "clsx";
import { Check, CheckCircle2, Footprints, PauseCircle, Pencil, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fraseAlerta } from "@/lib/explain";
import { dataHoraBR, moeda, pct } from "@/lib/format";
import { margemCom } from "@/lib/metricas";
import { usePricing } from "@/lib/store";
import { botaoClasses } from "./ui";
import type { Recomendacao, TipoDecisao } from "@/lib/types";

interface Opcao {
  tipo: TipoDecisao;
  rotulo: string;
  icone: LucideIcon;
  tecla: string;
  estilo: string;
  ativo: string;
  preco: number | null;
  ok: boolean;
  motivo?: string;
  exigeMotivo: boolean;
}

const MOTIVOS: Partial<Record<TipoDecisao, string[]>> = {
  aprovar: ["Alinhado à estratégia do canal", "Promoção já encerrada", "Conferi a concorrência"],
  editar: ["Arredondar preço de gôndola", "Ficar abaixo do principal concorrente", "Preservar coerência entre canais"],
  etapa_rampa: ["Recompor margem aos poucos", "Margem abaixo da mínima"],
  revisar: ["Promoção em andamento", "Validar custo com compras", "Checar concorrente manualmente"],
  rejeitar: ["Concorrente não comparável", "Estratégia comercial do item", "Custo desatualizado"],
};

const DECISAO_ROTULO: Record<TipoDecisao, string> = {
  aprovar: "Aprovada", editar: "Ajustada e aprovada", etapa_rampa: "1ª etapa aprovada", revisar: "Em revisão", rejeitar: "Rejeitada",
};

export function PainelDecisao({ r, onDecidido }: { r: Recomendacao; onDecidido: () => void }) {
  const p = usePricing();
  const feita = p.decisaoDe(r.id);
  const temBloqueio = r.alertas.some((a) => a.tipo === "bloqueio");
  const regras = r.alertas.filter((a) => a.tipo !== "informativo");
  const pedeAprovacao = r.alertas.some((a) => a.tipo === "aprovacao");
  const gestor = p.pode("risco_alto");
  const travaAlto = r.risco === "Alto" && !gestor ? "Risco alto: só o gestor aprova." : undefined;

  const opcoes = useMemo<Opcao[]>(() => {
    const o: Opcao[] = [];
    const verde = "border-subir/40 text-subir hover:bg-subir-bg";
    const verdeAtivo = "border-subir bg-subir text-white";
    if (r.preco_sugerido != null && r.acao !== "REVISAR") {
      o.push({ tipo: "aprovar", rotulo: r.acao === "MANTER" ? "Manter preço" : "Aprovar", icone: Check, tecla: "A", estilo: verde, ativo: verdeAtivo, preco: r.preco_sugerido, ok: !travaAlto, motivo: travaAlto, exigeMotivo: pedeAprovacao });
    } else if (r.preco_sugerido != null && !temBloqueio) {
      o.push({ tipo: "aprovar", rotulo: "Aprovar mesmo assim", icone: CheckCircle2, tecla: "A", estilo: verde, ativo: verdeAtivo, preco: r.preco_sugerido, ok: gestor, motivo: gestor ? undefined : "Só o gestor aprova um caso que pediu revisão.", exigeMotivo: true });
    }
    if (r.proposta.rampa) {
      o.push({ tipo: "etapa_rampa", rotulo: "Aprovar 1ª etapa", icone: Footprints, tecla: "A", estilo: verde, ativo: verdeAtivo, preco: r.proposta.rampa.preco_etapa_1, ok: !travaAlto, motivo: travaAlto, exigeMotivo: true });
    }
    if (!temBloqueio) {
      o.push({ tipo: "editar", rotulo: "Ajustar preço", icone: Pencil, tecla: "E", estilo: "border-roxo/40 text-roxo hover:bg-roxo-50", ativo: "border-roxo bg-roxo text-white", preco: null, ok: !travaAlto, motivo: travaAlto, exigeMotivo: true });
    }
    o.push({ tipo: "revisar", rotulo: "Revisar depois", icone: PauseCircle, tecla: "R", estilo: "border-revisar/40 text-revisar hover:bg-revisar-bg", ativo: "border-revisar bg-revisar text-white", preco: null, ok: true, exigeMotivo: true });
    o.push({ tipo: "rejeitar", rotulo: "Rejeitar", icone: X, tecla: "X", estilo: "border-piso/40 text-piso hover:bg-piso-bg", ativo: "border-piso bg-piso text-white", preco: null, ok: true, exigeMotivo: true });
    return o;
  }, [r, temBloqueio, gestor, travaAlto, pedeAprovacao]);

  const [escolha, setEscolha] = useState<TipoDecisao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [preco, setPreco] = useState((r.preco_sugerido ?? r.preco_atual).toFixed(2).replace(".", ","));
  const precoRef = useRef<HTMLInputElement>(null);
  const opcao = opcoes.find((o) => o.tipo === escolha) ?? null;

  const valor = Number(preco.replace(/\./g, "").replace(",", "."));
  const erroPreco = escolha !== "editar" ? null
    : !Number.isFinite(valor) || valor <= 0 ? "Digite um preço válido."
    : valor < r.preco_minimo ? `Fica abaixo do mínimo para a margem (${moeda(r.preco_minimo)}).`
    : valor > r.limite_superior + 0.001 || valor < r.limite_inferior - 0.001 ? `Fora do alcance de uma decisão: ${moeda(r.limite_inferior)} a ${moeda(r.limite_superior)}.`
    : null;
  const precoFinal = escolha === "editar" ? (erroPreco ? null : valor) : opcao?.preco ?? null;

  const confirmar = (tipo: TipoDecisao, texto: string, valorPreco: number | null) => {
    p.decidir(r.id, tipo, { preco: valorPreco, justificativa: texto.trim() });
    setEscolha(null);
    setMotivo("");
    onDecidido();
  };

  const clicar = (o: Opcao) => {
    if (!o.ok) return;
    if (!o.exigeMotivo && o.tipo !== "editar") return confirmar(o.tipo, "", o.preco);
    setEscolha(o.tipo);
    if (o.tipo === "editar") setTimeout(() => precoRef.current?.select(), 0);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!p.pode("decidir") || (e.target as HTMLElement).tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
      const o = opcoes.find((x) => x.tecla === e.key.toUpperCase() && x.ok);
      if (o) { e.preventDefault(); clicar(o); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (!p.pode("decidir")) {
    return <footer className="border-t border-linha bg-superficie px-6 py-4 text-sm text-suave">Como visitante, você vê tudo mas não decide. Para decidir, entre como analista ou gestor.</footer>;
  }
  if (p.aplicado(r.id)) {
    return (
      <footer className="flex items-center gap-2 border-t border-linha bg-superficie px-6 py-4 text-sm text-texto">
        <CheckCircle2 size={18} className="shrink-0 text-subir" aria-hidden />
        Preço já aplicado neste ciclo{feita?.preco != null ? `: ${moeda(feita.preco)}` : ""}. Uma nova decisão entra no próximo ciclo de recomendações.
      </footer>
    );
  }
  // A recomendação principal aparece cheia (ação primária); as demais, com contorno.
  // Em item que pede revisão, nenhuma opção é destacada: aprovar "mesmo assim" não pode parecer o caminho padrão.
  const principal = r.acao === "REVISAR"
    ? (r.proposta.rampa && opcoes.some((o) => o.tipo === "etapa_rampa" && o.ok) ? "etapa_rampa" : undefined)
    : opcoes.find((o) => o.ok && o.tipo === "aprovar")?.tipo;

  const podeConfirmar = opcao && opcao.ok && motivo.trim().length >= 3 && (escolha !== "editar" || precoFinal != null);

  return (
    <footer className="border-t border-linha bg-superficie px-6 py-4">
      {feita && !escolha && (
        <div className="mb-3 flex items-center gap-2 rounded-[10px] bg-limao-100 px-3 py-2 text-sm text-limao-700">
          <CheckCircle2 size={16} className="shrink-0" aria-hidden />
          <span><strong>{DECISAO_ROTULO[feita.tipo]}</strong>{feita.preco != null ? ` a ${moeda(feita.preco)}` : ""} por {feita.autor}, {dataHoraBR(feita.quando)}{feita.justificativa ? ` · “${feita.justificativa}”` : ""}. Para mudar, escolha outra decisão.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {opcoes.map((o) => {
          const Icone = o.icone;
          return (
            <button
              key={o.tipo}
              onClick={() => clicar(o)}
              disabled={!o.ok}
              title={o.motivo ?? `Atalho: tecla ${o.tecla}`}
              aria-pressed={escolha === o.tipo}
              className={clsx(
                "group flex min-h-16 flex-col items-center justify-center gap-1 rounded-[10px] border-2 px-3 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                escolha === o.tipo || (!escolha && !feita && o.tipo === principal) ? o.ativo : clsx("bg-superficie", o.estilo),
              )}
            >
              <Icone size={20} aria-hidden />
              <span>{o.rotulo}</span>
              <span className="num text-xs font-normal">
                {o.preco != null ? moeda(o.preco) : o.tipo === "editar" ? "outro valor" : o.tipo === "revisar" ? "sem mudar o preço" : r.acao === "MANTER" ? "discordo da análise" : "manter o atual"}
              </span>
            </button>
          );
        })}
      </div>
      {opcoes.some((o) => o.motivo && !o.ok) && <p className="mt-2 text-xs text-revisar">{opcoes.find((o) => o.motivo && !o.ok)?.motivo}</p>}

      {escolha && opcao && (
        <div className="mt-3 rounded-[12px] border border-linha bg-fundo p-3">
          {escolha === "editar" && (
            <label className="mb-3 block text-sm font-medium text-tinta">
              Novo preço
              <span className="mt-1 flex items-center gap-3">
                <input ref={precoRef} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" aria-invalid={!!erroPreco}
                  className="num h-11 w-32 rounded-[10px] border border-linha-forte-forte bg-superficie px-3 text-base outline-none focus:border-roxo" />
                <span className={clsx("text-sm", erroPreco ? "text-piso" : "text-suave")}>
                  {erroPreco ?? `margem de ${pct(margemCom(r, valor))} · ${pct(valor / r.preco_atual - 1, 1, true)} sobre hoje`}
                </span>
              </span>
            </label>
          )}
          <label htmlFor={`motivo-${r.id}`} className="text-sm font-medium text-tinta">Motivo <span className="font-normal text-suave">· toque numa sugestão ou escreva</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(MOTIVOS[escolha] ?? []).map((m) => (
              <button key={m} onClick={() => setMotivo(m)} aria-pressed={motivo === m}
                className={clsx("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm", motivo === m ? "border-roxo bg-roxo-50 font-medium text-roxo-800" : "border-linha bg-superficie hover:border-roxo")}>
                {motivo === m && <Check size={14} aria-hidden />}{m}
              </button>
            ))}
          </div>
          <input id={`motivo-${r.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && podeConfirmar && confirmar(escolha, motivo, precoFinal)}
            placeholder="Ou escreva o motivo" autoFocus={escolha !== "editar"}
            className="mt-2 h-11 w-full rounded-[10px] border border-linha-forte-forte bg-superficie px-3 text-sm outline-none focus:border-roxo" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[60ch] text-sm text-suave">
              Fica registrado: {p.nome || "você"}, agora{precoFinal != null ? `, ${moeda(precoFinal)}` : ""}
              {regras.length ? `, regras ${regras.map((a) => a.codigo ?? (a.texto.startsWith("Regra “") ? "do gestor" : "preço mínimo")).join(", ")}` : ""} e o motivo.
              {precoFinal != null && " Aplica amanhã, só na simulação."}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setEscolha(null)} className={botaoClasses("fantasma")}>Cancelar</button>
              <button disabled={!podeConfirmar} onClick={() => confirmar(escolha, motivo, precoFinal)}
                className={clsx(botaoClasses("primario"), "border-2", opcao.ativo)}>
                <Check size={16} aria-hidden /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {!escolha && regras.length > 0 && (
        <p className="mt-2 text-sm text-suave">Motivo obrigatório: {fraseAlerta(regras[0], r).replace(/\.$/, "").toLowerCase()}.</p>
      )}
    </footer>
  );
}
