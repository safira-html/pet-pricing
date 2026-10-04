"use client";

import clsx from "clsx";
import { Database, FileUp, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Botao, Card, Confirmar, SinteticoTag, Titulo } from "@/components/ui";
import { dataBR } from "@/lib/format";
import { usePricing } from "@/lib/store";
import type { Cenario } from "@/lib/types";

const BASES: Record<Cenario, { titulo: string; texto: string }> = {
  oficial: {
    titulo: "Base oficial do desafio",
    texto: "Os dados fictícios entregues pela Popular Pet, sem alteração. Mostra o problema real: quase todo item tem uma regra pedindo uma pessoa.",
  },
  enviada: {
    titulo: "Base enviada",
    texto: "A planilha que o gestor enviou nesta sessão, processada pelo mesmo motor. Fica só na sessão e some depois de 24 h sem uso.",
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
  { titulo: "Ligar o piloto automático", texto: "Em Pilotagem, ligue a chave, suba o teto para 4% e crie a regra “curva B em qualquer canal”: o piloto agenda sozinho. Depois vete uma das mudanças.", href: "/pilotagem" },
  { titulo: "Medir o impacto", texto: "Em Impacto e aprendizado, simule 30 dias: cada mudança mostra vendas e contribuição antes e depois.", href: "/aprendizado" },
  { titulo: "Ver o aprendizado agir", texto: "Grupos em que as mudanças pioraram a contribuição saem do piloto automático sozinhos.", href: "/aprendizado" },
  { titulo: "Mostrar como entra na operação", texto: "Em Integrações, as fontes da Popular Pet e o arquivo de preços aprovados para o ERP.", href: "/integrations" },
];

export default function Base() {
  const p = usePricing();
  const [confirmar, setConfirmar] = useState<Cenario | null>(null);
  const [recomecando, setRecomecando] = useState(false);
  const gestor = p.pode("regras");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Base e demonstração</h1>
        <p className="text-sm text-suave">
          Referência {dataBR(p.base.data_referencia)} · {p.recs.length} itens ({new Set(p.recs.map((r) => r.sku)).size} produtos × {new Set(p.recs.map((r) => r.canal)).size} canais)
        </p>
      </header>

      <EnvioBase gestor={gestor} />

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(BASES) as Cenario[]).filter((c) => c !== "enviada" || p.temBaseEnviada).map((c) => {
          const ativa = p.cenario === c;
          return (
            <Card key={c} className={clsx(ativa && "border-2 border-roxo")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-tinta">{BASES[c].titulo} {c === "sintetico" && <SinteticoTag />}</p>
                  <p className="mt-1 text-sm text-texto">{BASES[c].texto}</p>
                </div>
                {ativa && <span className="shrink-0 rounded-full bg-subir-bg px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-subir">Em uso</span>}
              </div>
              {!ativa && gestor && (
                confirmar === c ? (
                  <Confirmar className="mt-4" acao="Trocar base" onCancelar={() => setConfirmar(null)} onConfirmar={() => { p.trocarCenario(c); setConfirmar(null); }}
                    texto="Trocar a base apaga decisões, regras, exceções, resultados medidos e histórico desta sessão." />
                ) : (
                  <Botao variante="secundario" className="mt-4" onClick={() => setConfirmar(c)}><Database size={16} /> Usar esta base</Botao>
                )
              )}
              {!ativa && !gestor && <p className="mt-4 text-sm text-suave">Só o gestor troca a base.</p>}
              {c === "enviada" && p.cenario === "enviada" && (p.base.avisos_importacao?.length ?? 0) > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-revisar">{p.base.avisos_importacao!.length} {p.base.avisos_importacao!.length === 1 ? "aviso" : "avisos"} de qualidade dos dados</summary>
                  <ul className="mt-2 space-y-1 text-texto">
                    {p.base.avisos_importacao!.slice(0, 20).map((a, i) => (
                      <li key={i} className="rounded-[8px] bg-revisar-bg px-3 py-1.5">{[a.aba, a.sku, a.canal].filter(Boolean).join(" · ")}: {a.tipo}</li>
                    ))}
                  </ul>
                </details>
              )}
              {c === "sintetico" && (
                <p className="mt-3 text-xs text-suave">Produtos alterados: {p.base.cenario === "sintetico" ? p.base.skus_sinteticos.join(", ") : "PP-0017, PP-0024, PP-0025, PP-0027, PP-0028, PP-0029, PP-0032, PP-0038, PP-0040"}.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <Titulo eyebrow="Roteiro para a banca" acao={gestor && !recomecando && <Botao variante="perigo" onClick={() => setRecomecando(true)}><RotateCcw size={16} /> Recomeçar</Botao>}>
          Demonstração em {TRILHA.length} passos
        </Titulo>
        {recomecando && (
          <Confirmar className="mb-4" acao="Recomeçar" onCancelar={() => setRecomecando(false)} onConfirmar={() => { p.recomecar(); setRecomecando(false); }}
            texto="Recomeçar apaga decisões, regras, exceções, resultados medidos e histórico. O perfil, a base e a fórmula de margem continuam." />
        )}
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

      </Card>
    </div>
  );
}

function EnvioBase({ gestor }: { gestor: boolean }) {
  const p = usePricing();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const online = p.statusApi === "online";

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviando(true);
    setResultado(null);
    const r = await p.enviarBase(arquivo);
    setEnviando(false);
    if (entrada.current) entrada.current.value = "";
    setResultado(r.ok
      ? { ok: true, texto: `${r.itens} itens processados pelo motor${r.avisos ? `, com ${r.avisos} ${r.avisos === 1 ? "aviso" : "avisos"} de qualidade dos dados` : ""}. A base enviada já está em uso.` }
      : { ok: false, texto: r.mensagem });
  };

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex max-w-[68ch] items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-roxo-50 text-roxo"><FileUp size={20} aria-hidden /></span>
        <div>
          <p className="font-medium text-tinta">Enviar uma base de produtos</p>
          <p className="text-sm text-suave">
            Planilha .xlsx de até 5 MB, com as mesmas abas e colunas da base do desafio. O motor recalcula todas as recomendações e aponta problemas nos dados.
          </p>
          <p className={clsx("mt-1 inline-flex items-center gap-1.5 text-xs", online ? "text-subir" : "text-suave")}>
            <span className={clsx("size-2 rounded-full", online ? "bg-subir" : p.statusApi === "conectando" ? "bg-revisar" : "bg-linha-forte")} aria-hidden />
            {online ? (p.persistenciaServidor ? "Servidor conectado: decisões e histórico salvos na sua sessão" : "Servidor conectado: o motor roda no servidor e as decisões ficam salvas neste navegador") : p.statusApi === "conectando" ? "Conectando ao servidor…" : p.statusApi === "offline" ? "Servidor indisponível: o protótipo segue só no navegador" : "Sem servidor configurado: o protótipo roda só no navegador"}
          </p>
          {resultado && (
            <p role="status" className={clsx("mt-2 text-sm", resultado.ok ? "text-subir" : "text-piso")}>{resultado.texto}</p>
          )}
        </div>
      </div>
      <div>
        <input ref={entrada} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" id="arquivo-base" aria-label="Planilha da base de produtos"
          onChange={(e) => enviar(e.target.files?.[0])} disabled={!gestor || !online || enviando} />
        <Botao variante="secundario" disabled={!gestor || !online || enviando} onClick={() => entrada.current?.click()}>
          <FileUp size={16} /> {enviando ? "Processando…" : "Escolher planilha"}
        </Botao>
        {!gestor && <p className="mt-1 text-xs text-suave">Só o gestor envia bases.</p>}
      </div>
    </Card>
  );
}
