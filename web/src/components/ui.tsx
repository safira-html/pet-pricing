import clsx from "clsx";
import { ArrowDown, ArrowUp, CircleAlert, Equal, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ACAO_ROTULO } from "@/lib/explain";
import type { Acao, Modo, Risco } from "@/lib/types";

const ACAO_CLASSE: Record<Acao, string> = {
  SUBIR: "bg-subir-bg text-subir",
  BAIXAR: "bg-baixar-bg text-baixar",
  MANTER: "bg-manter-bg text-manter",
  REVISAR: "bg-revisar-bg text-revisar",
};
const ACAO_ICONE: Record<Acao, LucideIcon> = { SUBIR: ArrowUp, BAIXAR: ArrowDown, MANTER: Equal, REVISAR: CircleAlert };

export function AcaoBadge({ acao, grande = false }: { acao: Acao; grande?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold tracking-wide",
        grande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs",
        ACAO_CLASSE[acao],
      )}
    >
      {(() => { const Icone = ACAO_ICONE[acao]; return <Icone size={grande ? 15 : 13} strokeWidth={2.5} aria-hidden />; })()}
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
        {eyebrow && <p className="mb-0.5 text-sm font-medium text-roxo-800">{eyebrow}</p>}
        <h2 className="text-lg font-semibold">{children}</h2>
      </div>
      {acao}
    </header>
  );
}

export type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo" | "perigoForte";

/** Classes do botão, para reaproveitar em links com cara de botão. */
export function botaoClasses(variante: VarianteBotao = "primario", className?: string) {
  return clsx(
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
    variante === "primario" && "bg-roxo text-white hover:bg-roxo-700",
    variante === "secundario" && "border border-roxo text-roxo hover:bg-roxo-50",
    variante === "fantasma" && "text-roxo hover:bg-roxo-50",
    variante === "perigo" && "border border-piso text-piso hover:bg-piso-bg",
    variante === "perigoForte" && "bg-piso text-white hover:bg-piso/90",
    className,
  );
}

export function Botao({
  children, variante = "primario", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao }) {
  return (
    <button {...props} className={botaoClasses(variante, className)}>
      {children}
    </button>
  );
}

/** Confirmação em linha para ações que apagam ou desfazem (dica #23 do guia). */
export function Confirmar({ texto, acao, onConfirmar, onCancelar, className }: {
  texto: ReactNode; acao: string; onConfirmar: () => void; onCancelar: () => void; className?: string;
}) {
  return (
    <div role="alertdialog" aria-label={acao} className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] bg-piso-bg px-4 py-3 text-sm text-piso", className)}>
      <span className="min-w-0 flex-1">{texto}</span>
      <span className="flex flex-wrap gap-2">
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
        <Botao variante="perigoForte" onClick={onConfirmar} autoFocus>{acao}</Botao>
      </span>
    </div>
  );
}

export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="rounded-[15px] border border-dashed border-linha bg-superficie px-6 py-10 text-center">
      <p className="font-semibold text-tinta">{titulo}</p>
      {children && <div className="mx-auto mt-2 max-w-[60ch] text-sm text-suave">{children}</div>}
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  );
}
