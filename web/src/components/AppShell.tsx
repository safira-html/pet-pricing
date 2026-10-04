"use client";

import clsx from "clsx";
import { BookOpenCheck, Gauge, History, ListChecks, LogOut, Plane, Scale, Database } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { dataBR } from "@/lib/format";
import { PERFIS, usePricing } from "@/lib/store";

const NAV = [
  { href: "/", rotulo: "Visão geral", icone: Gauge },
  { href: "/fila", rotulo: "Fila de decisões", icone: ListChecks },
  { href: "/pilotagem", rotulo: "Pilotagem", icone: Plane },
  { href: "/regras", rotulo: "Regras e margem", icone: Scale },
  { href: "/aprendizado", rotulo: "Aprendizado", icone: History },
  { href: "/base", rotulo: "Base e demo", icone: Database },
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
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible" aria-label="Seções">
          {NAV.map(({ href, rotulo, icone: Icone }) => {
            const ativo = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? "page" : undefined}
                className={clsx(
                  "flex shrink-0 items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                  ativo ? "bg-roxo-50 font-semibold text-roxo-800 shadow-[inset_3px_0_0_var(--roxo)]" : "text-texto hover:bg-roxo-50",
                )}
              >
                <Icone size={17} aria-hidden />
                {rotulo}
                {href === "/pilotagem" && aguardandoVeto > 0 && (
                  <span className={clsx("ml-auto rounded-full px-1.5 text-xs", ativo ? "bg-roxo text-white" : "bg-limao text-tinta")}>{aguardandoVeto}</span>
                )}
              </Link>
            );
          })}
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
