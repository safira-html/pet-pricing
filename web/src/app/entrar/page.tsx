"use client";

import clsx from "clsx";
import { Check, LogIn } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Botao } from "@/components/ui";
import { PERFIS, usePricing } from "@/lib/store";
import type { Perfil } from "@/lib/types";

const PODE: Record<Perfil, string[]> = {
  analista: ["Decidir recomendações", "Vetar mudanças do piloto automático"],
  gestor: ["Tudo do analista", "Ligar o piloto automático e definir travas", "Ajustar regras", "Aprovar casos de risco alto"],
  visitante: ["Navegar por todas as telas", "Ver por que cada preço foi sugerido"],
};

export default function Entrar() {
  const p = usePricing();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>("analista");
  const [nome, setNome] = useState("");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-roxo-800 p-12 text-white lg:flex">
        <span className="inline-flex w-fit rounded-[12px] bg-white px-4 py-3 shadow-sm">
          <Image src="/logo-popular-pet.png" alt="Popular Pet" width={150} height={36} priority />
        </span>
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-limao">Pet Pricing</p>
          <h1 className="max-w-md font-display text-4xl leading-tight font-semibold text-white">
            Subir, baixar ou manter: decida cada preço vendo o porquê.
          </h1>
          <p className="mt-5 max-w-md text-base text-roxo-100">
            O Pet Pricing cruza concorrência, custo, margem, vendas e estoque e recomenda o que fazer com cada produto em cada canal. A decisão final é sempre de quem opera.
          </p>
          <ul className="mt-8 max-w-md space-y-3 text-sm text-white">
            {[
              "Nenhuma recomendação abaixo da margem mínima",
              "Aprovação em um clique quando nenhuma regra pede motivo",
              "Toda decisão registrada com autor, horário e motivo",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check size={18} className="mt-0.5 shrink-0 text-limao" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-roxo-100">Protótipo acadêmico do ITA Challenge Sprint · Grupo 12. Não é um sistema oficial da Popular Pet.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Image src="/logo-popular-pet.png" alt="Popular Pet" width={140} height={33} className="mb-8 lg:hidden" />
          <h2 className="text-2xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-suave">Na demonstração não há senha: escolha o perfil para ver o que ele pode fazer. Cada visitante trabalha na própria cópia da base.</p>
          <fieldset className="mt-6 space-y-3">
            <legend className="sr-only">Perfil</legend>
            {(Object.keys(PERFIS) as Perfil[]).map((k) => (
              <label
                key={k}
                className={clsx(
                  "flex cursor-pointer gap-3 rounded-[15px] border bg-superficie p-4 transition-colors",
                  perfil === k ? "border-roxo ring-1 ring-roxo" : "border-linha hover:border-roxo-100",
                )}
              >
                <input type="radio" name="perfil" value={k} checked={perfil === k} onChange={() => setPerfil(k)} className="mt-1 accent-[var(--roxo)]" />
                <span>
                  <span className="block font-semibold text-tinta">{PERFIS[k].nome}</span>
                  <span className="mt-1 block space-y-0.5 text-sm text-suave">
                    {PODE[k].map((t) => (
                      <span key={t} className="flex items-center gap-1.5"><Check size={13} className="text-limao-700" aria-hidden />{t}</span>
                    ))}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="mt-5 block text-sm font-medium text-tinta">
            Seu nome <span className="font-normal text-suave">(aparece no histórico de decisões)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Safira" className="mt-1.5 w-full rounded-[10px] border border-linha bg-superficie px-3 py-2.5 text-sm outline-none focus:border-roxo" />
          </label>
          <Botao className="mt-6 h-12 w-full" onClick={() => { p.entrar(perfil, nome.trim()); router.push("/"); }}>
            <LogIn size={18} /> Entrar
          </Botao>
          <p className="mt-4 text-xs text-suave">Em produção, o acesso seria pela conta corporativa da Popular Pet, com perfis definidos pela área comercial.</p>
        </div>
      </section>
    </div>
  );
}
