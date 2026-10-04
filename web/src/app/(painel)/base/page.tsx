"use client";

import clsx from "clsx";
import { Database, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Botao, Card, SinteticoTag, Titulo } from "@/components/ui";
import { dataBR } from "@/lib/format";
import { usePricing } from "@/lib/store";
import type { Cenario } from "@/lib/types";

const BASES: Record<Cenario, { titulo: string; texto: string }> = {
  oficial: {
    titulo: "Base oficial do desafio",
    texto: "Os dados fictícios entregues pela Popular Pet, sem alteração. Mostra o problema real: quase todo item tem uma regra pedindo uma pessoa.",
  },
  sintetico: {
    titulo: "Cenários sintéticos",
    texto: "A base oficial com o custo de 9 produtos alterado para demonstrar as quatro recomendações e o piloto automático. Esses itens aparecem marcados como sintéticos.",
  },
};

/** Roteiro para a banca: a ordem importa, porque cada passo usa o anterior. */
const TRILHA = [
  { titulo: "Ver o tamanho do problema", texto: "Na visão geral, a base oficial mostra quantos itens estão abaixo da margem mínima.", href: "/" },
  { titulo: "Comparar as fórmulas de margem", texto: "Em Regras e margem, veja como a escolha entre contribuição e margem bruta muda o resultado.", href: "/regras#margem" },
  { titulo: "Trocar para os cenários sintéticos", texto: "Use o botão abaixo. Aparecem itens para baixar e manter.", href: "/base" },
  { titulo: "Aprovar em um clique", texto: "No grupo Aprovação rápida, aprove o sachê da loja física e veja o aviso com Desfazer.", href: "/fila?grupo=rapida" },
  { titulo: "Ligar o piloto automático", texto: "Em Pilotagem, ligue a chave, suba o teto para 4%, crie a regra “curva B em qualquer canal” e agende. Depois vete uma das mudanças.", href: "/pilotagem" },
  { titulo: "Medir o impacto", texto: "Em Impacto e aprendizado, simule 30 dias: cada mudança mostra vendas e contribuição antes e depois.", href: "/aprendizado" },
  { titulo: "Ver o aprendizado agir", texto: "Grupos em que as mudanças pioraram a contribuição saem do piloto automático sozinhos.", href: "/aprendizado" },
  { titulo: "Mostrar como entra na operação", texto: "Em Integrações, as fontes da Popular Pet e o arquivo de preços aprovados para o ERP.", href: "/integrations" },
];

export default function Base() {
  const p = usePricing();
  const [confirmar, setConfirmar] = useState<Cenario | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Base e demonstração</h1>
        <p className="text-sm text-suave">Referência {dataBR(p.base.data_referencia)} · {p.recs.length} itens (40 produtos × 3 canais)</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(BASES) as Cenario[]).map((c) => {
          const ativa = p.cenario === c;
          return (
            <Card key={c} className={clsx(ativa && "border-2 border-roxo")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-tinta">{BASES[c].titulo} {c === "sintetico" && <SinteticoTag />}</p>
                  <p className="mt-1 text-sm text-texto">{BASES[c].texto}</p>
                </div>
                {ativa && <span className="rounded-full bg-subir-bg px-2.5 py-0.5 text-xs font-semibold text-subir">Em uso</span>}
              </div>
              {!ativa && (
                confirmar === c ? (
                  <div className="mt-4 rounded-[10px] bg-revisar-bg p-3 text-sm text-revisar">
                    Trocar a base apaga as decisões desta sessão.
                    <div className="mt-2 flex gap-2">
                      <Botao variante="perigo" onClick={() => { p.trocarCenario(c); setConfirmar(null); }}><Trash2 size={16} /> Trocar base</Botao>
                      <Botao variante="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Botao>
                    </div>
                  </div>
                ) : (
                  <Botao variante="secundario" className="mt-4" onClick={() => (p.decisoes.length ? setConfirmar(c) : p.trocarCenario(c))}><Database size={16} /> Usar esta base</Botao>
                )
              )}
              {c === "sintetico" && (
                <p className="mt-3 text-xs text-suave">Produtos alterados: {p.base.cenario === "sintetico" ? p.base.skus_sinteticos.join(", ") : "PP-0017, PP-0024, PP-0025, PP-0027, PP-0028, PP-0029, PP-0032, PP-0038, PP-0040"}.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <Titulo eyebrow="Roteiro para a banca" acao={<Botao variante="secundario" onClick={p.recomecar}><RotateCcw size={16} /> Recomeçar</Botao>}>
          Demonstração em {TRILHA.length} passos
        </Titulo>
        <ol className="grid gap-3 md:grid-cols-2">
          {TRILHA.map((t, i) => (
            <li key={t.titulo}>
              <Link href={t.href} className="flex gap-3 rounded-[12px] border border-linha p-4 hover:border-roxo">
                <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-roxo-50 text-sm font-semibold text-roxo-800 ring-1 ring-roxo-100">{i + 1}</span>
                <span>
                  <span className="block font-semibold text-tinta">{t.titulo}</span>
                  <span className="text-sm text-suave">{t.texto}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-suave">Recomeçar apaga decisões, modos e histórico desta sessão. O perfil e a base escolhida continuam.</p>
      </Card>
    </div>
  );
}
