"use client";

import clsx from "clsx";
import { Card, Titulo } from "@/components/ui";
import { REGRAS } from "@/lib/explain";
import { pct } from "@/lib/format";
import { usePricing } from "@/lib/store";
import type { Canal } from "@/lib/types";

const CANAIS: Canal[] = ["Loja física", "E-commerce", "Marketplace"];

/** Como cada regra da base funciona no protótipo hoje (auditoria de 04/10). */
const STATUS: Record<string, { estado: "ativa" | "parcial" | "sem dados"; nota: string }> = {
  R01: { estado: "ativa", nota: "Nenhuma sugestão fica abaixo do preço mínimo." },
  R02: { estado: "ativa", nota: "Quando o preço mínimo exige mais de 5%, o item vai para a rampa." },
  R03: { estado: "parcial", nota: "Pede aprovação, mas não manda o item para revisão como diz a base." },
  R04: { estado: "sem dados", nota: "A base não marca nenhum produto como estratégico." },
  R05: { estado: "ativa", nota: "Ofertas indisponíveis ficam fora da mediana." },
  R06: { estado: "ativa", nota: "Coletas com mais de 48 h são descartadas." },
  R07: { estado: "parcial", nota: "Compara loja física e e-commerce; o marketplace fica de fora." },
  R08: { estado: "ativa", nota: "Nenhum item mudou de preço nos 3 dias anteriores à referência." },
  R09: { estado: "ativa", nota: "Itens em campanha vão para revisão." },
  R10: { estado: "sem dados", nota: "Há uma coleta por concorrente; não dá para medir salto em 24 h." },
  R11: { estado: "ativa", nota: "Só age em redução de preço." },
  R12: { estado: "ativa", nota: "Nenhum item tem 3 quedas seguidas com estoque acima de 90 dias." },
};

export default function Regras() {
  const p = usePricing();
  const abaixoContrib = p.recs.filter((r) => r.margem.atual < r.margem.minima).length;
  const abaixoSimples = p.recs.filter((r) => (r.margem.simples_reposicao ?? 1) < r.margem.minima).length;
  const rampa = p.recs.filter((r) => r.proposta.rampa);
  const etapas = [2, 3, 4].map((n) => ({ n, q: rampa.filter((r) => (n === 4 ? r.proposta.rampa!.etapas >= 4 : r.proposta.rampa!.etapas === n)).length }));
  const ocorrencias = (cod: string) => p.recs.filter((r) => r.alertas.some((a) => a.codigo === cod)).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Regras e margem</h1>
        <p className="max-w-3xl text-sm text-suave">As regras protegem a operação: nenhuma recomendação passa por cima delas. Aqui ficam as duas decisões de política que mais mudam o resultado e o estado de cada regra da base.</p>
      </header>

      <Card className="scroll-mt-6" >
        <div id="margem" className="scroll-mt-6" />
        <Titulo eyebrow="Decisão pendente com o mentor">Qual margem vale?</Titulo>
        <p className="max-w-3xl text-sm text-texto">
          O deck da Semana 2 calculou a margem só sobre o custo de reposição. O protótipo usa a margem de contribuição, que também desconta impostos, frete e a taxa do canal. A escolha muda quase tudo:
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-[12px] border-2 border-roxo p-4">
            <p className="text-xs font-semibold tracking-wide text-roxo uppercase">Em uso no protótipo</p>
            <p className="mt-1 font-display text-lg font-semibold text-tinta">Margem de contribuição</p>
            <p className="mt-1 text-xs text-suave">(preço × (1 − taxa do canal) − reposição − impostos − frete) ÷ preço</p>
            <p className="mt-3 text-sm"><strong className="num text-piso">{abaixoContrib} de {p.recs.length}</strong> itens abaixo da margem mínima</p>
          </div>
          <div className="rounded-[12px] border border-linha p-4">
            <p className="text-xs font-semibold tracking-wide text-suave uppercase">Usada no deck da Semana 2</p>
            <p className="mt-1 font-display text-lg font-semibold text-tinta">Margem sobre a reposição</p>
            <p className="mt-1 text-xs text-suave">(preço − custo de reposição) ÷ preço</p>
            <p className="mt-3 text-sm"><strong className="num text-tinta">{abaixoSimples} de {p.recs.length}</strong> itens abaixo da margem mínima</p>
          </div>
        </div>
        <table className="mt-4 w-full max-w-xl text-sm">
          <thead className="text-left text-xs text-suave"><tr><th className="py-1 font-medium">Margem média</th>{CANAIS.map((c) => <th key={c} className="py-1 text-right font-medium">{c}</th>)}</tr></thead>
          <tbody className="num">
            <tr><td className="py-1">Contribuição</td>{CANAIS.map((c) => { const l = p.recs.filter((r) => r.canal === c); return <td key={c} className="py-1 text-right">{pct(l.reduce((s, r) => s + r.margem.atual, 0) / l.length)}</td>; })}</tr>
            <tr><td className="py-1">Sobre a reposição</td>{CANAIS.map((c) => { const l = p.recs.filter((r) => r.canal === c); return <td key={c} className="py-1 text-right">{pct(l.reduce((s, r) => s + (r.margem.simples_reposicao ?? 0), 0) / l.length)}</td>; })}</tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-suave">O indicador da base “margem bruta média de 31,8%” fica perto da conta sobre a reposição. Pergunta para o mentor: qual é a fórmula oficial da Popular Pet?</p>
      </Card>

      <Card>
        <div id="rampa" className="scroll-mt-6" />
        <Titulo eyebrow="Proposta da V2">Rampa de reajuste</Titulo>
        <p className="max-w-3xl text-sm text-texto">
          Quando o preço mínimo fica a mais de 5% do preço de hoje, as regras R01 (margem mínima) e R02 (no máximo 5% por decisão) não cabem juntas. O protótipo original mandava esses itens para revisão sem preço. A proposta é subir em etapas de até 5%, com 3 dias entre elas (regra R08), sempre com aprovação e nunca pelo piloto automático.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-lg">
          {etapas.map((e) => (
            <div key={e.n} className="rounded-[12px] bg-fundo p-3 text-center">
              <p className="num font-display text-2xl font-semibold text-tinta">{e.q}</p>
              <p className="text-xs text-suave">{e.n === 4 ? "4 etapas ou mais" : `${e.n} etapas`}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-suave">{rampa.length} itens nesta base. Marketplace concentra os casos de mais etapas, porque a taxa do canal é de 12%.</p>
      </Card>

      <Card>
        <Titulo eyebrow="Base do desafio">As 12 regras</Titulo>
        <div className="divide-y divide-linha">
          {p.base.regras.map((rg) => {
            const st = STATUS[rg.id];
            return (
              <div key={rg.id} className="grid gap-2 py-3 md:grid-cols-[64px_minmax(0,1.4fr)_minmax(0,1.6fr)_auto] md:items-center">
                <span className="num text-sm font-semibold text-roxo">{rg.id}</span>
                <div>
                  <p className="text-sm font-medium text-tinta">{REGRAS[rg.id]?.nome ?? rg.tema}</p>
                  <p className="text-xs text-suave">{REGRAS[rg.id]?.frase ?? rg.regra}</p>
                </div>
                <p className="text-xs text-texto">{st?.nota}</p>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className="num text-xs text-suave">{ocorrencias(rg.id)} itens</span>
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold",
                    st?.estado === "ativa" ? "bg-subir-bg text-subir" : st?.estado === "parcial" ? "bg-revisar-bg text-revisar" : "bg-manter-bg text-manter")}>
                    {st?.estado}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-suave">Ajustar parâmetros e simular o efeito antes de salvar entra com o backend, depois da aprovação desta interface.</p>
      </Card>
    </div>
  );
}
