"use client";

import clsx from "clsx";
import { ArrowRight, Building2, Check, Eye, ListChecks, LogIn, Plane, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AcaoBadge } from "@/components/ui";
import { resumoCurto } from "@/lib/explain";
import { moeda, pct } from "@/lib/format";
import { PERFIS, usePricing } from "@/lib/store";
import type { Perfil } from "@/lib/types";

const PODE: Record<Perfil, string[]> = {
  analista: ["Decidir recomendações", "Vetar mudanças do piloto automático"],
  gestor: ["Tudo do analista", "Ligar o piloto automático e definir proteções", "Ajustar regras e a fórmula de margem", "Aprovar casos de risco alto"],
  visitante: ["Navegar por todas as telas", "Ver por que cada preço foi sugerido"],
};
const ICONE: Record<Perfil, typeof Eye> = { analista: ListChecks, gestor: ShieldCheck, visitante: Eye };

/** O ciclo do produto, na ordem em que acontece. */
const CICLO = [
  { n: 1, titulo: "Recomenda", texto: "subir, baixar, manter ou revisar" },
  { n: 2, titulo: "Você decide", texto: "ou o piloto age dentro das proteções" },
  { n: 3, titulo: "Mede e aprende", texto: "o resultado volta para as regras" },
];

export default function Entrar() {
  const p = usePricing();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>("analista");
  const [nome, setNome] = useState("");

  // Prévia com um caso real da base: o primeiro “subir” sem bloqueio.
  const exemplo = useMemo(() => p.recs.find((r) => r.acao === "SUBIR" && !r.bloqueios.length && r.preco_sugerido != null), [p.recs]);
  const entrar = () => { p.entrar(perfil, nome.trim()); router.push("/"); };

  return (
    <div className="min-h-screen bg-[#ebe6f1] p-3 sm:p-6 lg:grid lg:place-items-center">
      <div className="mx-auto grid w-full max-w-[1240px] overflow-hidden rounded-[28px] bg-superficie p-2.5 shadow-[0_24px_60px_rgba(61,35,88,0.12)] lg:min-h-[min(820px,calc(100vh-3rem))] lg:grid-cols-[1.05fr_1fr]">
        <section className="relative isolate hidden flex-col justify-between overflow-hidden rounded-[22px] bg-roxo-900 p-8 text-white xl:p-10 lg:flex">
          {/* Fundo: degradê roxo com um brilho verde-limão da marca */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,#8a62b8_0%,transparent_55%),radial-gradient(90%_70%_at_100%_100%,#5a3580_0%,transparent_60%),linear-gradient(160deg,#764ea0_0%,#3d2358_100%)]" />
          <div aria-hidden className="absolute -right-24 -bottom-24 -z-10 size-80 rounded-full bg-limao/25 blur-3xl" />

          <span className="inline-flex w-fit rounded-[12px] bg-white px-3.5 py-2.5 shadow-sm">
            <Image src="/logo-popular-pet.png" alt="Popular Pet" width={128} height={31} priority />
          </span>

          <div className="mt-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur">
              <span className="size-2 rounded-full bg-limao" aria-hidden /> Pet Pricing · copiloto de precificação
            </span>
            <h1 className="mt-5 max-w-lg font-display text-[34px] leading-[1.12] xl:text-[38px] font-semibold text-white">
              Subir, baixar ou manter: decida cada preço vendo o porquê.
            </h1>
            <p className="mt-4 max-w-md text-base text-white/80">
              Concorrência, custo, margem, vendas e estoque viram uma recomendação por produto e canal. A decisão final é de quem opera.
            </p>

            {exemplo && (
              <div className="relative mt-6 max-w-md">
                <div className="rounded-[16px] bg-white p-4 text-texto shadow-[0_18px_40px_rgba(20,8,35,0.35)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-tinta">{exemplo.produto}</p>
                      <p className="text-xs text-suave">{exemplo.canal} · curva {exemplo.curva}</p>
                    </div>
                    <AcaoBadge acao={exemplo.acao} />
                  </div>
                  <p className="num mt-3 flex items-baseline gap-2 text-sm">
                    <span className="text-suave line-through">{moeda(exemplo.preco_atual)}</span>
                    <ArrowRight size={14} className="self-center text-suave" aria-hidden />
                    <span className="font-display text-xl font-semibold text-tinta">{moeda(exemplo.preco_sugerido)}</span>
                    <span className="text-xs font-semibold text-subir">{pct(exemplo.variacao, 1, true)}</span>
                  </p>
                  <p className="mt-2 text-xs text-suave">{resumoCurto(exemplo)}</p>
                  <div className="mt-3 flex gap-2">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-subir px-3 text-xs font-semibold text-white"><Check size={14} aria-hidden /> Aprovar</span>
                    <span className="inline-flex h-8 items-center rounded-[8px] border border-linha px-3 text-xs font-medium text-texto">Ajustar preço</span>
                  </div>
                </div>
                <div className="absolute -top-4 -right-6 hidden items-center gap-2 rounded-[12px] bg-white/95 px-3 py-2 text-xs font-medium text-tinta shadow-lg xl:flex">
                  <Plane size={14} className="text-roxo" aria-hidden /> Piloto automático com janela de veto
                </div>
              </div>
            )}
          </div>

          <ol className="mt-6 grid grid-cols-3 gap-3">
            {CICLO.map((c, i) => (
              <li key={c.n} className={clsx("rounded-[16px] p-4", i === 0 ? "bg-white text-tinta" : "bg-white/10 text-white ring-1 ring-white/15 backdrop-blur")}>
                <span className={clsx("num grid size-7 place-items-center rounded-full text-sm font-semibold", i === 0 ? "bg-roxo text-white" : "ring-1 ring-white/50")}>{c.n}</span>
                <p className="mt-4 text-sm font-semibold">{c.titulo}</p>
                <p className={clsx("text-xs", i === 0 ? "text-suave" : "text-white/75")}>{c.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col px-5 py-8 sm:px-10 lg:px-14">
          <Image src="/logo-popular-pet.png" alt="Popular Pet" width={128} height={31} className="mb-8 lg:hidden" />
          <div className="mx-auto my-auto w-full max-w-[420px]">
            <h2 className="font-display text-[28px] font-semibold">Entrar no Pet Pricing</h2>
            <p className="mt-1.5 text-sm text-suave">Na demonstração não há senha. Escolha um perfil: cada visitante trabalha na própria cópia da base.</p>

            <fieldset className="mt-7">
              <legend className="mb-2 text-sm font-medium text-tinta">Perfil</legend>
              <div className="space-y-2.5">
                {(Object.keys(PERFIS) as Perfil[]).map((k) => {
                  const Icone = ICONE[k];
                  const sel = perfil === k;
                  return (
                    <label key={k} className={clsx(
                      "block cursor-pointer rounded-[14px] border p-3.5 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-roxo",
                      sel ? "border-roxo bg-roxo-50/60 shadow-[0_0_0_1px_var(--roxo)]" : "border-linha hover:border-roxo/50 hover:bg-fundo",
                    )}>
                      <input type="radio" name="perfil" value={k} checked={sel} onChange={() => setPerfil(k)} className="sr-only" />
                      <span className="flex items-center gap-3">
                        <span className={clsx("grid size-10 shrink-0 place-items-center rounded-[10px] transition-colors", sel ? "bg-roxo text-white" : "bg-fundo text-suave")}>
                          <Icone size={19} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-tinta">{PERFIS[k].nome}</span>
                          <span className="block text-xs text-suave">{PERFIS[k].descricao}</span>
                        </span>
                        <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full border-2", sel ? "border-roxo bg-roxo text-white" : "border-linha")} aria-hidden>
                          {sel && <Check size={12} strokeWidth={3} />}
                        </span>
                      </span>
                      {sel && (
                        <span className="mt-3 flex flex-wrap gap-1.5 pl-[52px]">
                          {PODE[k].map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-texto ring-1 ring-roxo-100">
                              <Check size={12} className="text-limao-700" aria-hidden />{t}
                            </span>
                          ))}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-6 block text-sm font-medium text-tinta">
              Seu nome <span className="font-normal text-suave">(aparece no histórico)</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} placeholder="Ex.: Safira"
                className="mt-1.5 h-12 w-full rounded-[12px] border border-transparent bg-fundo px-4 text-sm outline-none transition-colors placeholder:text-suave/70 focus:border-roxo focus:bg-superficie" />
            </label>

            <button onClick={entrar} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-roxo text-sm font-semibold text-white shadow-[0_8px_20px_rgba(118,78,160,0.35)] transition-all hover:bg-roxo-700 active:scale-[0.99]">
              <LogIn size={18} aria-hidden /> Entrar
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-suave" aria-hidden>
              <span className="h-px flex-1 bg-linha" /> ou <span className="h-px flex-1 bg-linha" />
            </div>
            <button disabled className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[12px] border border-linha text-sm font-medium text-suave">
              <Building2 size={18} aria-hidden /> Conta corporativa Popular Pet
              <span className="rounded-full bg-fundo px-2 py-0.5 text-xs">em produção</span>
            </button>
          </div>
          <p className="mx-auto mt-8 max-w-[420px] text-center text-xs text-suave">
            Protótipo acadêmico do ITA Challenge Sprint · Grupo 12. Não é um sistema oficial da Popular Pet.
          </p>
        </section>
      </div>
    </div>
  );
}
