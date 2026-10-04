"use client";

import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface OpcaoSelect<T extends string> {
  valor: T;
  rotulo: string;
  detalhe?: string;
}

/**
 * Dropdown com a identidade do Pet Pricing, no lugar do menu nativo do sistema.
 * Acessível: botão com aria-expanded, lista com role="listbox", navegação por setas,
 * Enter/Espaço para escolher e Esc para fechar.
 */
export function Select<T extends string>({
  rotulo, valor, opcoes, onChange, disabled, className, multiplo,
}: {
  rotulo: string;
  valor: T | T[];
  opcoes: OpcaoSelect<T>[];
  onChange: (v: T | T[]) => void;
  disabled?: boolean;
  className?: string;
  multiplo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();
  const selecionados = (Array.isArray(valor) ? valor : [valor]) as T[];
  const texto = multiplo
    ? selecionados.length === 0 ? "Escolha uma ou mais opções"
      : selecionados.length <= 2 ? opcoes.filter((o) => selecionados.includes(o.valor)).map((o) => o.rotulo).join(", ")
      : `${selecionados.length} selecionados`
    : opcoes.find((o) => o.valor === valor)?.rotulo ?? "Escolha";

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  useEffect(() => {
    if (aberto) lista.current?.children[ativo]?.scrollIntoView({ block: "nearest" });
  }, [aberto, ativo]);

  const escolher = (o: OpcaoSelect<T>) => {
    if (multiplo) {
      const prox = selecionados.includes(o.valor) ? selecionados.filter((v) => v !== o.valor) : [...selecionados, o.valor];
      onChange(prox);
    } else {
      onChange(o.valor);
      setAberto(false);
    }
  };

  const teclado = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!aberto && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      setAtivo(Math.max(0, opcoes.findIndex((o) => selecionados.includes(o.valor))));
      setAberto(true);
      return;
    }
    if (!aberto) return;
    if (e.key === "Escape") { e.preventDefault(); setAberto(false); }
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(opcoes.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(opcoes[ativo]); }
    if (e.key === "Tab") setAberto(false);
  };

  return (
    <div ref={raiz} className={clsx("relative", className)}>
      <span id={`${id}-rotulo`} className="block text-sm font-medium text-tinta">{rotulo}</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-labelledby={`${id}-rotulo ${id}-valor`}
        onClick={() => { setAtivo(Math.max(0, opcoes.findIndex((o) => selecionados.includes(o.valor)))); setAberto((a) => !a); }}
        onKeyDown={teclado}
        className={clsx(
          "mt-1.5 flex h-11 w-full items-center justify-between gap-2 rounded-[10px] border bg-superficie px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          aberto ? "border-roxo ring-2 ring-roxo-100" : "border-linha hover:border-roxo",
        )}
      >
        <span id={`${id}-valor`} className={clsx("truncate", multiplo && selecionados.length === 0 ? "text-suave" : "text-tinta")}>{texto}</span>
        <ChevronDown size={18} className={clsx("shrink-0 text-suave transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto && (
        <ul
          ref={lista}
          role="listbox"
          aria-multiselectable={multiplo || undefined}
          aria-labelledby={`${id}-rotulo`}
          tabIndex={-1}
          onKeyDown={teclado}
          className="absolute z-30 mt-1.5 max-h-72 w-full min-w-48 overflow-auto rounded-[12px] border border-linha bg-superficie p-1.5 shadow-[0_12px_32px_rgba(61,35,88,0.16)]"
        >
          {opcoes.map((o, i) => {
            const sel = selecionados.includes(o.valor);
            return (
              <li
                key={o.valor || "__vazio"}
                role="option"
                aria-selected={sel}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => { e.preventDefault(); escolher(o); }}
                className={clsx(
                  "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-sm",
                  i === ativo && "bg-roxo-50",
                  sel ? "font-semibold text-roxo-800" : "text-texto",
                )}
              >
                <span>
                  {o.rotulo}
                  {o.detalhe && <span className="block text-xs font-normal text-suave">{o.detalhe}</span>}
                </span>
                {sel && <Check size={16} className="shrink-0 text-roxo" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
