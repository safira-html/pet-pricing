"use client";

import clsx from "clsx";
import { BookOpenCheck, ChevronRight, Database, Gauge, History, ListChecks, LogOut, Plane, Plug, Scale } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { dataBR } from "@/lib/format";
import { SOURCES } from "@/lib/integrations";
import { PERFIS, usePricing } from "@/lib/store";

type NavKey = "fila" | "pilotagem" | "aprendizado" | "integrations";
const NAV_GROUPS: { label: string; items: { href: string; rotulo: string; icone: typeof Gauge; key?: NavKey }[] }[] = [
  { label: "Decidir", items: [
    { href: "/", rotulo: "Visão geral", icone: Gauge },
    { href: "/fila", rotulo: "Fila de decisões", icone: ListChecks, key: "fila" },
  ] },
  { label: "Automatizar", items: [
    { href: "/pilotagem", rotulo: "Pilotagem", icone: Plane, key: "pilotagem" },
    { href: "/regras", rotulo: "Regras e margem", icone: Scale },
  ] },
  { label: "Acompanhar", items: [
    { href: "/aprendizado", rotulo: "Impacto e aprendizado", icone: History, key: "aprendizado" },
  ] },
  { label: "Dados", items: [
    { href: "/integrations", rotulo: "Integrações", icone: Plug, key: "integrations" },
    { href: "/base", rotulo: "Base e demo", icone: Database },
  ] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const p = usePricing();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (p.carregado && !p.perfil) router.replace("/entrar");
  }, [p.carregado, p.perfil, router]);

  if (!p.carregado || !p.perfil) {
    return <div className="grid min-h-screen place-items-center text-sm text-suave">Carregando…</div>;
  }

  const aguardandoVeto = p.agendamentos.filter((a) => a.status === "aguardando veto").length;
  const decididos = new Set(p.decisoes.map((d) => d.recId));
  const pendentes = p.recs.filter((r) => !decididos.has(r.id)).length;
  const foraDoPiloto = p.learnings.filter((l) => l.effect === "hold" && !l.dismissed).length;
  const badges: Record<NavKey, { valor: string | number; tom: string; titulo: string } | null> = {
    fila: pendentes ? { valor: pendentes, tom: "bg-roxo-100 text-roxo-800", titulo: `${pendentes} itens sem decisão` } : null,
    pilotagem: aguardandoVeto ? { valor: aguardandoVeto, tom: "bg-limao text-tinta", titulo: `${aguardandoVeto} mudanças aguardando veto` } : null,
    aprendizado: foraDoPiloto ? { valor: foraDoPiloto, tom: "bg-piso-bg text-piso", titulo: `${foraDoPiloto} grupos fora do piloto automático por aprendizado` } : null,
    integrations: { valor: SOURCES.length, tom: "bg-revisar-bg text-revisar", titulo: `${SOURCES.length} fontes a conectar` },
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-linha bg-superficie lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <Image src="/logo-popular-pet.png" alt="Popular Pet" width={126} height={30} priority />
        </div>
        <div className="mx-5 mb-4 border-l-2 border-limao pl-3">
          <p className="font-display text-sm font-semibold text-tinta">Pet Pricing</p>
          <p className="text-xs text-suave">Copiloto de precificação</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-5 lg:overflow-visible lg:pb-4" aria-label="Seções">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="contents lg:block">
              <p className="hidden px-3 pb-1.5 text-xs font-semibold tracking-[0.12em] text-suave uppercase lg:block">{g.label}</p>
              <ul className="contents lg:block lg:space-y-1">
                {g.items.map(({ href, rotulo, icone: Icone, key }) => {
                  const ativo = href === "/" ? path === "/" : path.startsWith(href);
                  const badge = key ? badges[key] : null;
                  return (
                    <li key={href} className="shrink-0">
                      <Link
                        href={href}
                        aria-current={ativo ? "page" : undefined}
                        className={clsx(
                          "group flex min-h-11 items-center gap-3 rounded-[12px] py-1.5 pr-2 pl-1.5 text-sm font-medium transition-all active:scale-[0.98]",
                          ativo ? "bg-roxo-50 font-semibold text-roxo-800" : "text-texto hover:bg-roxo-50/70 hover:text-roxo-800",
                        )}
                      >
                        <span className={clsx(
                          "grid size-8 shrink-0 place-items-center rounded-[9px] transition-colors",
                          ativo ? "bg-roxo text-white shadow-[0_2px_6px_rgba(118,78,160,0.35)]" : "bg-fundo text-suave group-hover:bg-white group-hover:text-roxo",
                        )}>
                          <Icone size={17} aria-hidden />
                        </span>
                        <span className="whitespace-nowrap">{rotulo}</span>
                        {badge && (
                          <span className={clsx("num ml-auto rounded-full px-2 py-0.5 text-xs font-semibold", badge.tom)} title={badge.titulo}>{badge.valor}</span>
                        )}
                        <ChevronRight size={15} aria-hidden className={clsx("hidden shrink-0 transition-all lg:block", badge ? "" : "ml-auto",
                          ativo ? "text-roxo" : "-translate-x-1 text-suave opacity-0 group-hover:translate-x-0 group-hover:opacity-100")} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-3 px-5 pb-5 lg:block">
          <Link href="/base" className="block rounded-[12px] border border-linha p-3 text-xs hover:border-roxo">
            <p className="font-semibold text-tinta">{p.cenario === "oficial" ? "Base oficial do desafio" : "Cenários sintéticos"}</p>
            <p className="text-suave">Referência {dataBR(p.base.data_referencia)} · {p.recs.length} itens</p>
          </Link>
          <div className="flex items-center justify-between gap-2 rounded-[12px] bg-roxo-50 p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-tinta">{p.nome || PERFIS[p.perfil].nome}</p>
              <p className="text-xs text-roxo">{PERFIS[p.perfil].nome}</p>
            </div>
            <button onClick={() => { p.sair(); router.replace("/entrar"); }} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-white hover:text-roxo" aria-label="Trocar de perfil" title="Trocar de perfil">
              <LogOut size={16} />
            </button>
          </div>
          <p className="flex gap-1.5 text-xs leading-snug text-suave">
            <BookOpenCheck size={14} className="shrink-0" aria-hidden />
            Protótipo acadêmico do ITA Challenge Sprint. Não é um sistema oficial da Popular Pet.
          </p>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">{children}</main>
      <Aviso />
    </div>
  );
}

function Aviso() {
  const p = usePricing();
  const aviso = p.aviso;
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(p.fecharAviso, 7000);
    return () => clearTimeout(t);
  }, [aviso, p.fecharAviso]);
  if (!aviso) return null;
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-[12px] bg-tinta px-4 py-3 text-sm text-white shadow-xl">
      <span className="text-limao" aria-hidden>✓</span>
      <span>{aviso.texto}</span>
      <button onClick={() => p.desfazer(aviso.recId)} className="font-semibold text-limao underline-offset-2 hover:underline">Desfazer</button>
      <button onClick={p.fecharAviso} className="text-white/60 hover:text-white" aria-label="Fechar aviso">✕</button>
    </div>
  );
}
