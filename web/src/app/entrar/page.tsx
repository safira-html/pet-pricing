"use client";

import clsx from "clsx";
import { ArrowRight, Building2, Check, Eye, ListChecks, LogIn, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AcaoBadge } from "@/components/ui";
import { resumoCurto } from "@/lib/explain";
import { moeda, pct } from "@/lib/format";
import { PERFIS, usePricing } from "@/lib/store";
import type { Perfil } from "@/lib/types";

const ICONE: Record<Perfil, typeof Eye> = { analista: ListChecks, gestor: ShieldCheck, visitante: Eye };

/** O ciclo do produto, na ordem em que acontece. */
const CICLO = [
  { n: 1, titulo: "Recomenda", texto: "subir, baixar, manter ou revisar" },
  { n: 2, titulo: "Você decide", texto: "ou o piloto age dentro das proteções" },
  { n: 3, titulo: "Mede e aprende", texto: "o resultado volta para as regras" },
];

// Telas baixas: a prévia do caso e os textos do ciclo saem para tudo caber sem rolar.
const BAIXA = "[@media(max-height:700px)]:hidden";
const MUITO_BAIXA = "[@media(max-height:600px)]:hidden";

export default function Entrar() {
  const p = usePricing();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>("analista");
  const [nome, setNome] = useState("");

  // Prévia com um caso real da base: o primeiro “subir” sem bloqueio.
  const exemplo = useMemo(() => p.recs.find((r) => r.acao === "SUBIR" && !r.bloqueios.length && r.preco_sugerido != null), [p.recs]);
  const entrar = () => { p.entrar(perfil, nome.trim()); router.push("/"); };

  return (
    <div className="min-h-dvh bg-[#ebe6f1] p-3 lg:flex lg:h-dvh lg:items-center lg:p-4">
      <div className="mx-auto grid w-full max-w-[1240px] overflow-hidden rounded-[24px] bg-superficie p-2 shadow-[0_24px_60px_rgba(61,35,88,0.12)] lg:h-full lg:max-h-[860px] lg:grid-cols-[1.05fr_1fr]">
        <section className="relative isolate hidden min-h-0 flex-col overflow-hidden rounded-[18px] bg-roxo-900 p-7 text-white lg:flex xl:px-9">
          {/* Fundo: degradê roxo com um brilho verde-limão da marca */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,#8a62b8_0%,transparent_55%),radial-gradient(90%_70%_at_100%_100%,#5a3580_0%,transparent_60%),linear-gradient(160deg,#764ea0_0%,#3d2358_100%)]" />
          <div aria-hidden className="absolute -right-24 -bottom-24 -z-10 size-80 rounded-full bg-limao/25 blur-3xl" />

          <span className="inline-flex w-fit shrink-0 rounded-[10px] bg-white px-3 py-2 shadow-sm">
            <Image src="/logo-popular-pet.png" alt="Popular Pet" width={112} height={27} priority />
          </span>

          <div className="flex min-h-0 flex-1 flex-col justify-center py-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur">
              <span className="size-2 rounded-full bg-limao" aria-hidden /> Pet Pricing · copiloto de precificação
            </span>
            <h1 className="mt-4 max-w-lg font-display text-[clamp(26px,4.4vh,38px)] leading-[1.12] font-semibold text-white">
              Subir, baixar ou manter: decida cada preço vendo o porquê.
            </h1>
            <p className="mt-3 max-w-md text-base text-white">
              Concorrência, custo, margem, vendas e estoque viram uma recomendação por produto e canal. A decisão final é de quem opera.
            </p>

            {exemplo && (
              <div className={clsx("mt-5 max-w-md rounded-[14px] bg-white p-3.5 text-texto shadow-[0_18px_40px_rgba(20,8,35,0.35)]", BAIXA)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-tinta">{exemplo.produto}</p>
                    <p className="text-xs text-suave">{exemplo.canal} · curva {exemplo.curva}</p>
                  </div>
                  <AcaoBadge acao={exemplo.acao} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="num flex items-baseline gap-2 text-sm">
                    <span className="text-suave line-through">{moeda(exemplo.preco_atual)}</span>
                    <ArrowRight size={14} className="self-center text-suave" aria-hidden />
                    <span className="font-display text-lg font-semibold text-tinta">{moeda(exemplo.preco_sugerido)}</span>
                    <span className="text-xs font-semibold text-subir">{pct(exemplo.variacao, 1, true)}</span>
                  </p>
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-subir px-3 text-xs font-semibold text-white"><Check size={14} aria-hidden /> Aprovar</span>
                </div>
                <p className="mt-1.5 text-xs text-suave">{resumoCurto(exemplo)}</p>
              </div>
            )}
          </div>

          <ol className="grid shrink-0 grid-cols-3 gap-2.5">
            {CICLO.map((c, i) => (
              <li key={c.n} className={clsx("rounded-[14px] p-3", i === 0 ? "bg-white text-tinta" : "bg-white/10 text-white ring-1 ring-white/15 backdrop-blur")}>
                <span className="flex items-center gap-2">
                  <span className={clsx("num grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", i === 0 ? "bg-roxo text-white" : "ring-1 ring-white/50")}>{c.n}</span>
                  <span className="text-sm font-semibold">{c.titulo}</span>
                </span>
                <p className={clsx("mt-1.5 text-xs", i === 0 ? "text-suave" : "text-white/90", MUITO_BAIXA)}>{c.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex min-h-0 flex-col overflow-y-auto px-5 py-6 sm:px-10 lg:px-12">
          <Image src="/logo-popular-pet.png" alt="Popular Pet" width={120} height={29} className="mb-6 lg:hidden" />
          <div className="mx-auto my-auto w-full max-w-[420px]">
            <h2 className="font-display text-2xl font-semibold">Entrar no Pet Pricing</h2>
            <p className="mt-1 text-sm text-suave">Na demonstração não há senha. Cada visitante trabalha na própria cópia da base.</p>

            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-medium text-tinta">Perfil</legend>
              <div className="space-y-2">
                {(Object.keys(PERFIS) as Perfil[]).map((k) => {
                  const Icone = ICONE[k];
                  const sel = perfil === k;
                  return (
                    <label key={k} className={clsx(
                      "flex cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-roxo",
                      sel ? "border-roxo bg-roxo-50/60 shadow-[0_0_0_1px_var(--roxo)]" : "border-linha hover:border-roxo/50 hover:bg-fundo",
                    )}>
                      <input type="radio" name="perfil" value={k} checked={sel} onChange={() => setPerfil(k)} className="sr-only" />
                      <span className={clsx("grid size-9 shrink-0 place-items-center rounded-[10px] transition-colors", sel ? "bg-roxo text-white" : "bg-fundo text-suave")}>
                        <Icone size={18} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-tinta">{PERFIS[k].nome}</span>
                        <span className="block text-xs text-suave">{PERFIS[k].descricao}</span>
                      </span>
                      <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full border-2", sel ? "border-roxo bg-roxo text-white" : "border-linha")} aria-hidden>
                        {sel && <Check size={12} strokeWidth={3} />}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-4 block text-sm font-medium text-tinta">
              Seu nome <span className="font-normal text-suave">(aparece no histórico)</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} placeholder="Ex.: Safira"
                className="mt-1.5 h-11 w-full rounded-[12px] border border-linha-forte bg-superficie px-4 text-sm outline-none transition-colors placeholder:text-suave focus:border-roxo" />
            </label>

            <button onClick={entrar} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-roxo text-sm font-semibold text-white shadow-[0_8px_20px_rgba(118,78,160,0.35)] transition-all hover:bg-roxo-700 active:scale-[0.99]">
              <LogIn size={18} aria-hidden /> Entrar
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-suave">
              <Building2 size={14} aria-hidden /> Em produção, o acesso é pela conta corporativa da Popular Pet.
            </p>
          </div>
          <p className="mx-auto mt-5 max-w-[420px] text-center text-xs text-suave">
            Protótipo acadêmico do ITA Challenge Sprint · Grupo 12. Não é um sistema oficial da Popular Pet.
          </p>
        </section>
      </div>
    </div>
  );
}
