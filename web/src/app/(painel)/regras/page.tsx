"use client";

import clsx from "clsx";
import { Check, Lock, Pause, Pencil, Play, Plus, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EditorRegra } from "@/components/EditorRegra";
import { Select } from "@/components/Select";
import { Botao, Card, Confirmar, Titulo, Vazio } from "@/components/ui";
import { REGRAS } from "@/lib/explain";
import { dataBR, pct } from "@/lib/format";
import { MARGIN_FORMULAS, marginAt, type MarginFormula } from "@/lib/margin";
import { recalculateAll, vigente } from "@/lib/recalcular";
import { usePricing } from "@/lib/store";
import { PARAMETROS_PADRAO, type Canal, type ParametrosBase, type RegraPreco } from "@/lib/types";

const CANAIS: Canal[] = ["Loja física", "E-commerce", "Marketplace"];
const FORMULAS: MarginFormula[] = ["contribution", "gross"];

/** Como cada regra da base funciona no protótipo (auditoria de 04/10). */
const STATUS: Record<string, { estado: "ativa" | "parcial" | "sem dados"; nota: string }> = {
  R01: { estado: "ativa", nota: "Nenhuma sugestão fica abaixo do preço mínimo, pela fórmula de margem em uso." },
  R02: { estado: "ativa", nota: "Quando o preço mínimo exige mais que isso, o item vai para a rampa." },
  R03: { estado: "parcial", nota: "Pede aprovação, mas não manda o item para revisão como diz a base." },
  R04: { estado: "ativa", nota: "A base não marca nenhum produto como estratégico: o gestor marca aqui." },
  R05: { estado: "ativa", nota: "Ofertas indisponíveis ficam fora da mediana." },
  R06: { estado: "ativa", nota: "Coletas com mais de 48 h são descartadas." },
  R07: { estado: "parcial", nota: "Compara loja física e e-commerce; o marketplace fica de fora." },
  R08: { estado: "ativa", nota: "Também define o intervalo entre as etapas da rampa." },
  R09: { estado: "ativa", nota: "Itens em campanha vão para revisão." },
  R10: { estado: "sem dados", nota: "Há uma coleta por concorrente; não dá para medir salto em 24 h." },
  R11: { estado: "ativa", nota: "Só age em redução de preço." },
  R12: { estado: "ativa", nota: "Nenhum item tem 3 quedas seguidas com estoque acima de 90 dias." },
};

/** Parâmetros que o gestor pode deixar mais rígidos e que a prévia já recalcula. */
const AJUSTAVEIS: Partial<Record<keyof ParametrosBase, { rotulo: string; unidade: "%" | "dias"; passo: number; min: number; max: number }>> = {
  R02: { rotulo: "Variação máxima por decisão", unidade: "%", passo: 0.005, min: 0.01, max: PARAMETROS_PADRAO.R02 },
  R03: { rotulo: "Variação que pede aprovação na curva A", unidade: "%", passo: 0.005, min: 0.005, max: PARAMETROS_PADRAO.R03 },
  R07: { rotulo: "Diferença máxima entre loja física e e-commerce", unidade: "%", passo: 0.005, min: 0.01, max: PARAMETROS_PADRAO.R07 },
  R08: { rotulo: "Dias entre mudanças do mesmo item", unidade: "dias", passo: 1, min: PARAMETROS_PADRAO.R08, max: 14 },
};

const fmtParam = (v: number, unidade: "%" | "dias") => (unidade === "%" ? pct(v, 1) : `${v} ${v === 1 ? "dia" : "dias"}`);

const ESCOPO_ROTULO: Record<RegraPreco["escopo"], string> = {
  todos: "Todos os produtos", curva: "Curva", categoria: "Categoria", marca: "Marca", canal: "Canal", sku: "Produto",
};

function resumoRegra(g: RegraPreco) {
  const quem = g.escopo === "todos" ? "Todos os produtos" : `${ESCOPO_ROTULO[g.escopo]}: ${g.valores.join(", ")}`;
  const partes = [quem, `mínima ${pct(g.margemMinima, 1)}`, `alvo ${pct(g.margemAlvo, 1)}`, `até +${pct(g.subidaMax, 1)} / −${pct(g.reducaoMax, 1)}`];
  if (g.exigeAprovacao) partes.push("exige aprovação");
  partes.push(g.fim ? `até ${dataBR(g.fim)}` : "sem data de fim");
  return partes.join(" · ");
}

export default function Regras() {
  const p = usePricing();
  const gestor = p.pode("regras");
  const [editando, setEditando] = useState<RegraPreco | "nova" | null>(null);

  const rampa = p.recs.filter((r) => r.proposta.rampa);
  const etapas = [2, 3, 4].map((n) => ({ n, q: rampa.filter((r) => (n === 4 ? r.proposta.rampa!.etapas >= 4 : r.proposta.rampa!.etapas === n)).length }));
  const ocorrencias = (cod: string) => p.recs.filter((r) => r.alertas.some((a) => a.codigo === cod)).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Regras e margem</h1>
        <p className="max-w-[68ch] text-sm text-suave">
          As regras protegem a operação: nenhuma recomendação passa por cima delas. {gestor
            ? "Como gestor, você escolhe a fórmula de margem, cria regras por grupo de produtos e deixa as regras da base mais rígidas. Afrouxar não é permitido."
            : "Só o gestor altera regras. Você vê o que está valendo e o efeito de cada uma."}
        </p>
      </header>

      <FormulaMargem gestor={gestor} />

      <Card>
        <Titulo
          eyebrow="Política por grupo"
          acao={gestor && <Botao onClick={() => setEditando("nova")}><Plus size={16} /> Nova regra</Botao>}
        >
          Regras por grupo de produtos
        </Titulo>
        {p.regrasPreco.length === 0 ? (
          <Vazio titulo="Nenhuma regra por grupo">
            {gestor
              ? "Crie uma regra para dar margem mínima, alvo ou limite de variação próprios a uma curva, categoria, marca, canal ou produto."
              : "Quando o gestor criar regras para curvas, categorias ou canais, elas aparecem aqui."}
          </Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {p.regrasPreco.map((g) => <LinhaRegra key={g.id} g={g} gestor={gestor} onEditar={() => setEditando(g)} />)}
          </ul>
        )}
      </Card>

      <Card>
        <div id="rampa" className="scroll-mt-6" />
        <Titulo eyebrow="Proposta da V2">Rampa de reajuste</Titulo>
        <p className="max-w-[68ch] text-sm text-texto">
          Quando o preço mínimo fica a mais de {pct(p.parametros.R02, 0)} do preço de hoje, as regras R01 (margem mínima) e R02 (variação máxima por decisão) não cabem juntas. O protótipo original mandava esses itens para revisão sem preço. A proposta é subir em etapas, com {p.parametros.R08} dias entre elas (R08), sempre com aprovação e nunca pelo piloto automático.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-lg">
          {etapas.map((e) => (
            <div key={e.n} className="rounded-[12px] bg-fundo p-3 text-center">
              <p className="num font-display text-2xl font-semibold text-tinta">{e.q}</p>
              <p className="text-xs text-suave">{e.n === 4 ? "4 etapas ou mais" : `${e.n} etapas`}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-suave">
          {rampa.length} {rampa.length === 1 ? "item precisa" : "itens precisam"} de rampa com a fórmula em uso.
          {p.marginFormula === "contribution" && " O marketplace concentra os casos de mais etapas, porque a taxa do canal é de 12%."}
        </p>
      </Card>

      <Card>
        <Titulo eyebrow="Base do desafio">As 12 regras</Titulo>
        <div className="divide-y divide-linha">
          {p.base.regras.map((rg) => <LinhaRegraBase key={rg.id} id={rg.id} tema={rg.tema} regra={rg.regra} ocorrencias={ocorrencias(rg.id)} gestor={gestor} />)}
        </div>
      </Card>

      {editando && <EditorRegra inicial={editando === "nova" ? undefined : editando} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function FormulaMargem({ gestor }: { gestor: boolean }) {
  const p = usePricing();
  const [trocarPara, setTrocarPara] = useState<MarginFormula | null>(null);
  const [motivo, setMotivo] = useState("");

  // Resultado das duas fórmulas sobre a mesma base, com as regras atuais.
  const porFormula = useMemo(() => {
    const out = {} as Record<MarginFormula, ReturnType<typeof recalculateAll>>;
    FORMULAS.forEach((f) => {
      out[f] = f === p.marginFormula ? p.recs : recalculateAll(p.base.recomendacoes, p.regrasPreco, p.parametros, p.estrategicos, f);
    });
    return out;
  }, [p.recs, p.marginFormula, p.base.recomendacoes, p.regrasPreco, p.parametros, p.estrategicos]);

  const mudam = trocarPara
    ? porFormula[trocarPara].filter((r, i) => r.acao !== p.recs[i].acao || r.preco_sugerido !== p.recs[i].preco_sugerido).length
    : 0;

  return (
    <Card>
      <div id="margem" className="scroll-mt-6" />
      <Titulo eyebrow="Decisão do grupo">Qual margem vale?</Titulo>
      <p className="max-w-[68ch] text-sm text-texto">
        Escolha a validar com o time e o mentor. O material do desafio não define a fórmula: o dicionário da base descreve a margem mínima só como “piso de margem”. A escolha muda quase tudo. O padrão é a margem de contribuição, porque o desafio lista impostos, frete e taxa do canal em “Custos e margem” e pede para considerar as diferenças entre canais.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Fórmula de margem">
        {FORMULAS.map((f) => {
          const info = MARGIN_FORMULAS[f];
          const recs = porFormula[f];
          const abaixo = recs.filter((r) => r.margem.atual < r.margem.minima - 1e-9).length;
          const emUso = p.marginFormula === f;
          const acoes = (["SUBIR", "BAIXAR", "MANTER", "REVISAR"] as const).map((a) => ({ a, q: recs.filter((r) => r.acao === a).length }));
          return (
            <button
              key={f}
              role="radio"
              aria-checked={emUso}
              disabled={!gestor || emUso}
              onClick={() => { setTrocarPara(f); setMotivo(""); }}
              className={clsx(
                "rounded-[12px] p-4 text-left transition-colors disabled:cursor-default",
                emUso ? "border-2 border-roxo bg-roxo-50/50" : "border border-linha",
                !emUso && gestor && "hover:border-roxo hover:bg-roxo-50/40",
                trocarPara === f && "ring-2 ring-roxo-100",
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                {emUso && <span className="inline-flex items-center gap-1 rounded-full bg-roxo px-2 py-0.5 text-xs font-semibold text-white"><Check size={12} aria-hidden /> Em uso</span>}
                {f === "contribution" && <span className="rounded-full bg-limao-100 px-2 py-0.5 text-xs font-semibold text-limao-700">Recomendada</span>}
              </span>
              <span className="mt-2 block font-display text-lg font-semibold text-tinta">{info.label}</span>
              <span className="mt-1 block text-xs text-suave">{info.formula}</span>
              <span className="mt-1 block text-xs text-suave">Usada em: {info.usedBy}</span>
              <span className="mt-3 block text-sm">
                <strong className={clsx("num", abaixo ? "text-piso" : "text-tinta")}>{abaixo} de {recs.length}</strong> itens abaixo da margem mínima
              </span>
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-suave">
                {acoes.map(({ a, q }) => <span key={a} className="num">{q} {a.toLowerCase()}</span>)}
              </span>
              <span className="mt-3 block text-xs text-texto">{info.why}</span>
            </button>
          );
        })}
      </div>

      {trocarPara && gestor && (
        <div className="mt-4 rounded-[12px] border border-revisar bg-revisar-bg/60 p-4">
          <p className="text-sm text-tinta">
            Trocar para <strong>{MARGIN_FORMULAS[trocarPara].label}</strong> muda a recomendação ou o preço sugerido de <strong className="num">{mudam}</strong> {mudam === 1 ? "item" : "itens"}. Decisões já tomadas continuam registradas.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-sm font-medium text-tinta">Motivo <span className="font-normal text-suave">(fica no histórico)</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Alinhado com o time em reunião"
                className="mt-1.5 h-11 w-full rounded-[10px] border border-linha-forte bg-superficie px-3 text-sm outline-none focus:border-roxo" />
            </label>
            <Botao variante="fantasma" onClick={() => setTrocarPara(null)}><X size={16} /> Cancelar</Botao>
            <Botao disabled={motivo.trim().length < 5} onClick={() => { p.setMarginFormula(trocarPara, motivo.trim()); setTrocarPara(null); }}><Check size={16} /> Trocar fórmula</Botao>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[440px] max-w-xl text-sm">
        <thead className="text-left text-xs text-suave"><tr><th className="py-1 font-medium">Margem média hoje</th>{CANAIS.map((c) => <th key={c} className="py-1 text-right font-medium">{c}</th>)}</tr></thead>
        <tbody className="num">
          {FORMULAS.map((f) => (
            <tr key={f} className={clsx(p.marginFormula === f && "font-semibold text-tinta")}>
              <td className="py-1">{f === "contribution" ? "Contribuição" : "Bruta sobre reposição"}</td>
              {CANAIS.map((c) => {
                const l = p.recs.filter((r) => r.canal === c);
                return <td key={c} className="py-1 text-right">{pct(l.reduce((s, r) => s + marginAt(r, r.preco_atual, f), 0) / (l.length || 1))}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-3 text-xs text-suave">
        O indicador da base “margem bruta média de 31,8%” fica perto da conta bruta e continua útil como indicador mensal. {!gestor && "Só o gestor troca a fórmula."}
      </p>
    </Card>
  );
}

function LinhaRegra({ g, gestor, onEditar }: { g: RegraPreco; gestor: boolean; onEditar: () => void }) {
  const p = usePricing();
  const [confirmar, setConfirmar] = useState(false);
  const noPrazo = vigente({ ...g, ativa: true }, p.base.data_referencia);
  const estado = !g.ativa ? "Pausada" : noPrazo ? "Ativa" : "Fora da vigência";
  const usando = p.recs.filter((r) => r.regra_aplicada === g.nome).length;
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-tinta">{g.nome}</span>
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold",
            estado === "Ativa" ? "bg-subir-bg text-subir" : estado === "Pausada" ? "bg-manter-bg text-manter" : "bg-revisar-bg text-revisar")}>{estado}</span>
        </p>
        <p className="mt-1 text-xs text-suave">{resumoRegra(g)}</p>
        <p className="mt-1 text-xs text-texto">
          Vale para <span className="num font-semibold">{usando}</span> {usando === 1 ? "item" : "itens"} hoje · {g.autor} · motivo: {g.justificativa}
        </p>
      </div>
      {gestor && (
        confirmar ? (
          <Confirmar texto="Remover a regra? Os itens voltam à regra da base." acao="Remover" onCancelar={() => setConfirmar(false)} onConfirmar={() => p.removerRegraPreco(g.id)} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="fantasma" onClick={onEditar}><Pencil size={16} /> Editar</Botao>
            <Botao variante="fantasma" onClick={() => p.alternarRegraPreco(g.id)}>
              {g.ativa ? <><Pause size={16} /> Pausar</> : <><Play size={16} /> Reativar</>}
            </Botao>
            <button onClick={() => setConfirmar(true)} className="grid size-11 place-items-center rounded-[10px] text-piso hover:bg-piso-bg" aria-label={`Remover a regra ${g.nome}`} title="Remover">
              <Trash2 size={16} />
            </button>
          </div>
        )
      )}
    </li>
  );
}

function LinhaRegraBase({ id, tema, regra, ocorrencias, gestor }: { id: string; tema: string; regra: string; ocorrencias: number; gestor: boolean }) {
  const p = usePricing();
  const st = STATUS[id];
  const ajuste = AJUSTAVEIS[id as keyof ParametrosBase];
  const [aberto, setAberto] = useState(false);
  const atual = ajuste ? p.parametros[id as keyof ParametrosBase] : null;
  const [valor, setValor] = useState<number>(atual ?? 0);
  const [skus, setSkus] = useState<string[]>(p.estrategicos);
  const [motivo, setMotivo] = useState("");
  const alterado = ajuste && atual !== PARAMETROS_PADRAO[id as keyof ParametrosBase];
  const ehR04 = id === "R04";
  const podeAjustar = gestor && (!!ajuste || ehR04);

  const opcoesSku = useMemo(
    () => [...new Map(p.base.recomendacoes.map((r) => [r.sku, `${r.sku} · ${r.produto}`])).entries()].map(([v, rotulo]) => ({ valor: v, rotulo })),
    [p.base.recomendacoes],
  );

  const salvar = () => {
    if (ajuste) p.definirParametro(id as keyof ParametrosBase, valor, motivo.trim());
    if (ehR04) p.definirEstrategicos(skus, motivo.trim());
    setAberto(false);
    setMotivo("");
  };
  const mudou = ajuste ? valor !== atual : JSON.stringify([...skus].sort()) !== JSON.stringify([...p.estrategicos].sort());

  return (
    <div className="py-3">
      <div className="grid gap-2 md:grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1.5fr)_auto] md:items-center">
        <span className="num text-sm font-semibold text-roxo">{id}</span>
        <div>
          <p className="text-sm font-medium text-tinta">{REGRAS[id]?.nome ?? tema}</p>
          <p className="text-xs text-suave">{REGRAS[id]?.frase ?? regra}</p>
        </div>
        <div className="text-xs text-texto">
          <p>{st?.nota}</p>
          {ajuste && <p className={clsx("mt-0.5", alterado ? "font-semibold text-roxo-800" : "text-suave")}>{ajuste.rotulo}: {fmtParam(atual!, ajuste.unidade)}{alterado && " (mais rígido que a base)"}</p>}
          {ehR04 && <p className={clsx("mt-0.5", p.estrategicos.length ? "font-semibold text-roxo-800" : "text-suave")}>{p.estrategicos.length ? `${p.estrategicos.length} ${p.estrategicos.length === 1 ? "produto marcado" : "produtos marcados"}` : "Nenhum produto marcado"}</p>}
        </div>
        <div className="flex items-center gap-3 md:justify-end">
          <span className="num text-xs text-suave">{ocorrencias} {ocorrencias === 1 ? "item" : "itens"}</span>
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold",
            st?.estado === "ativa" ? "bg-subir-bg text-subir" : st?.estado === "parcial" ? "bg-revisar-bg text-revisar" : "bg-manter-bg text-manter")}>
            {st?.estado}
          </span>
          {podeAjustar ? (
            <Botao variante="secundario" aria-expanded={aberto} onClick={() => { setAberto(!aberto); setValor(atual ?? 0); setSkus(p.estrategicos); }}>
              {ehR04 ? <Star size={16} /> : <SlidersHorizontal size={16} />} {ehR04 ? "Marcar" : "Ajustar"}
            </Botao>
          ) : (
            <span className="grid size-11 place-items-center text-suave" title={gestor ? "Regra fixa: não tem parâmetro ajustável no protótipo" : "Só o gestor ajusta regras"}>
              <Lock size={16} aria-hidden />
              <span className="sr-only">{gestor ? "Regra fixa" : "Só o gestor ajusta"}</span>
            </span>
          )}
        </div>
      </div>

      {aberto && (
        <div className="mt-3 rounded-[12px] bg-fundo p-4 md:ml-14">
          {ajuste && (
            <label className="block text-sm font-medium text-tinta">
              {ajuste.rotulo}: <span className="num text-roxo-800">{fmtParam(valor, ajuste.unidade)}</span>
              <input type="range" min={ajuste.min} max={ajuste.max} step={ajuste.passo} value={valor}
                onChange={(e) => setValor(Number(e.target.value))} className="mt-2 block w-full max-w-md accent-[var(--roxo)]" />
              <span className="mt-1 block text-xs font-normal text-suave">
                Na base: {fmtParam(PARAMETROS_PADRAO[id as keyof ParametrosBase], ajuste.unidade)}. Só é possível deixar mais rígido.
              </span>
            </label>
          )}
          {ehR04 && (
            <Select rotulo="Produtos estratégicos" multiplo valor={skus} opcoes={opcoesSku} onChange={(v) => setSkus(v as string[])} className="max-w-md" />
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-sm font-medium text-tinta">Motivo <span className="font-normal text-suave">(fica no histórico)</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Período de reajuste de fornecedor"
                className="mt-1.5 h-11 w-full rounded-[10px] border border-linha-forte bg-superficie px-3 text-sm outline-none focus:border-roxo" />
            </label>
            <Botao variante="fantasma" onClick={() => setAberto(false)}>Cancelar</Botao>
            <Botao disabled={!mudou || motivo.trim().length < 5} onClick={salvar}><Check size={16} /> Salvar</Botao>
          </div>
        </div>
      )}
    </div>
  );
}
