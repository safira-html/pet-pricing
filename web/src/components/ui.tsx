import clsx from "clsx";
import type { ReactNode } from "react";
import { ACAO_ROTULO } from "@/lib/explain";
import type { Acao, Modo, Risco } from "@/lib/types";

const ACAO_CLASSE: Record<Acao, string> = {
  SUBIR: "bg-subir-bg text-subir",
  BAIXAR: "bg-baixar-bg text-baixar",
  MANTER: "bg-manter-bg text-manter",
  REVISAR: "bg-revisar-bg text-revisar",
};
const ACAO_SETA: Record<Acao, string> = { SUBIR: "↑", BAIXAR: "↓", MANTER: "=", REVISAR: "!" };

export function AcaoBadge({ acao, grande = false }: { acao: Acao; grande?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold tracking-wide",
        grande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs",
        ACAO_CLASSE[acao],
      )}
    >
      <span aria-hidden>{ACAO_SETA[acao]}</span>
      {ACAO_ROTULO[acao]}
    </span>
  );
}

export function RiscoBadge({ risco }: { risco: Risco }) {
  const cls = risco === "Alto" ? "text-piso" : risco === "Médio" ? "text-revisar" : "text-subir";
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", cls)}>
      <span className="inline-block size-2 rounded-full bg-current" aria-hidden />
      {risco}
    </span>
  );
}

export function ModoBadge({ modo }: { modo: Modo }) {
  return modo === "autopiloto" ? (
    <span className="inline-flex items-center rounded-full bg-roxo-50 px-2 py-0.5 text-xs font-medium text-roxo-800 ring-1 ring-roxo-100">Piloto automático</span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-linha px-2 py-0.5 text-xs font-medium text-suave">Copiloto</span>
  );
}

export function SinteticoTag() {
  return (
    <span
      title="Custo alterado nos cenários sintéticos para demonstrar as quatro ações. Não é dado da Popular Pet."
      className="inline-flex items-center rounded border border-dashed border-revisar px-1.5 text-xs font-semibold uppercase tracking-wider text-revisar"
    >
      sintético
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("rounded-[15px] border border-linha bg-superficie p-5", className)}>{children}</section>;
}

export function Titulo({ eyebrow, children, acao }: { eyebrow?: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-roxo">{eyebrow}</p>}
        <h2 className="text-lg font-semibold">{children}</h2>
      </div>
      {acao}
    </header>
  );
}

export function Botao({
  children, variante = "primario", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "fantasma" | "perigo" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variante === "primario" && "bg-roxo text-white hover:bg-roxo-700",
        variante === "secundario" && "border border-roxo text-roxo hover:bg-roxo-50",
        variante === "fantasma" && "text-roxo hover:bg-roxo-50",
        variante === "perigo" && "border border-piso text-piso hover:bg-piso-bg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-[15px] border border-dashed border-linha bg-superficie px-6 py-10 text-center">
      <p className="font-semibold text-tinta">{titulo}</p>
      {children && <div className="mt-2 text-sm text-suave">{children}</div>}
    </div>
  );
}
