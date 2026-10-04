"use client";

import clsx from "clsx";
import { BookOpenCheck, Check, ChevronRight, Database, Gauge, History, ListChecks, LogOut, Plane, Plug, Scale, Undo2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
  // Relógio de minuto em minuto: o contador de veto some quando a janela acaba.
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const router = useRouter();

  useEffect(() => {
    if (p.carregado && !p.perfil) router.replace("/entrar");
  }, [p.carregado, p.perfil, router]);

  if (!p.carregado || !p.perfil) {
    return <div className="grid min-h-screen place-items-center text-sm text-suave">Carregando…</div>;
  }

  const aguardandoVeto = p.agendamentos.filter((a) => a.status === "aguardando veto" && new Date(a.aplicaEm).getTime() > agoraMs).length;
  const decididos = new Set(p.decisoes.map((d) => d.recId));
  const pendentes = p.recs.filter((r) => !decididos.has(r.id)).length;
  const foraDoPiloto = p.learnings.filter((l) => l.effect === "hold" && !l.dismissed).length;
  const badges: Record<NavKey, { valor: string | number; tom: string; titulo: string } | null> = {
    fila: pendentes ? { valor: pendentes, tom: "bg-roxo-100 text-roxo-800", titulo: `${pendentes} ${pendentes === 1 ? "item" : "itens"} sem decisão` } : null,
    pilotagem: aguardandoVeto ? { valor: aguardandoVeto, tom: "bg-limao text-tinta", titulo: `${aguardandoVeto} ${aguardandoVeto === 1 ? "mudança aguardando" : "mudanças aguardando"} veto` } : null,
    aprendizado: foraDoPiloto ? { valor: foraDoPiloto, tom: "bg-piso-bg text-piso", titulo: `${foraDoPiloto} ${foraDoPiloto === 1 ? "grupo" : "grupos"} fora do piloto automático por aprendizado` } : null,
    integrations: { valor: SOURCES.length, tom: "bg-revisar-bg text-revisar", titulo: `${SOURCES.length} fontes a conectar` },
  };

  const nomeVisivel = p.nome || PERFIS[p.perfil].nome;
  const iniciais = nomeVisivel.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const sair = () => { p.sair(); router.replace("/entrar"); };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-linha bg-superficie lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 lg:pb-6">
          <div>
            <Image src="/logo-popular-pet.png" alt="Popular Pet" width={116} height={28} priority />
            <p className="mt-1.5 text-xs font-medium text-suave">Pet Pricing · copiloto de precificação</p>
          </div>
          <button onClick={sair} className="grid size-11 place-items-center rounded-[10px] text-suave hover:bg-fundo hover:text-roxo lg:hidden" aria-label="Trocar de perfil" title="Trocar de perfil">
            <LogOut size={18} />
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1 lg:space-y-5 lg:overflow-y-auto lg:pb-4" aria-label="Seções">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="contents lg:block">
              <p className="hidden px-3 pb-1 text-xs font-medium tracking-[0.08em] text-suave uppercase lg:block">{g.label}</p>
              <ul className="contents lg:block lg:space-y-0.5">
                {g.items.map(({ href, rotulo, icone: Icone, key }) => {
                  const ativo = href === "/" ? path === "/" : path.startsWith(href);
                  const badge = key ? badges[key] : null;
                  return (
                    <li key={href} className="shrink-0">
                      <Link
                        href={href}
                        aria-current={ativo ? "page" : undefined}
                        className={clsx(
                          "group relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors active:scale-[0.99]",
                          ativo ? "bg-roxo-50 font-semibold text-roxo-800" : "font-medium text-texto hover:bg-fundo hover:text-tinta",
                        )}
                      >
                        <Icone size={18} aria-hidden className={clsx("shrink-0", ativo ? "text-roxo" : "text-suave group-hover:text-roxo")} />
                        <span className="whitespace-nowrap">{rotulo}</span>
                        {badge ? (
                          <span className={clsx("num ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", badge.tom)} title={badge.titulo}>{badge.valor}</span>
                        ) : (
                          <ChevronRight size={15} aria-hidden className="ml-auto hidden shrink-0 text-suave opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-linha px-4 pt-4 pb-5 lg:block">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-roxo-100 text-xs font-semibold text-roxo-800" aria-hidden>{iniciais}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-tinta">{nomeVisivel}</p>
              {p.nome && <p className="truncate text-xs text-suave">{PERFIS[p.perfil].nome}</p>}
            </div>
            <button onClick={sair} className="grid size-11 shrink-0 place-items-center rounded-[10px] text-suave hover:bg-fundo hover:text-roxo" aria-label="Trocar de perfil" title="Trocar de perfil">
              <LogOut size={17} />
            </button>
          </div>
          <Link href="/base" className="mt-3 flex items-center gap-2 rounded-[8px] text-xs text-suave hover:text-roxo">
            <Database size={14} className="shrink-0" aria-hidden />
            <span className="truncate">{p.cenario === "oficial" ? "Base oficial" : p.cenario === "sintetico" ? "Cenários sintéticos" : "Base enviada"} · {dataBR(p.base.data_referencia)} · {p.recs.length} itens</span>
          </Link>
          <p className="mt-2 flex gap-2 text-xs leading-snug text-suave">
            <BookOpenCheck size={14} className="mt-px shrink-0" aria-hidden />
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
  const [pausado, setPausado] = useState(false);
  const fechar = p.fecharAviso;
  useEffect(() => {
    if (!aviso || pausado) return;
    const t = setTimeout(fechar, 12000);
    return () => clearTimeout(t);
  }, [aviso, pausado, fechar]);
  if (!aviso) return null;
  return (
    <div role="status" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)} onFocus={() => setPausado(true)} onBlur={() => setPausado(false)}
      className="anim-toast fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-[12px] bg-tinta py-1.5 pr-1.5 pl-4 text-sm text-white shadow-xl">
      <Check size={16} className="shrink-0 text-limao" aria-hidden />
      <span className="mr-2">{aviso.texto}</span>
      <button onClick={p.desfazer} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 font-semibold text-limao hover:bg-white/10">
        <Undo2 size={15} aria-hidden /> Desfazer
      </button>
      <button onClick={fechar} className="grid size-9 place-items-center rounded-[8px] text-white/70 hover:bg-white/10 hover:text-white" aria-label="Fechar aviso">
        <X size={16} />
      </button>
    </div>
  );
}
