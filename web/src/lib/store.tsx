"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import oficial from "@/data/oficial.json";
import sintetico from "@/data/sintetico.json";
import type {
  Agendamento, BaseDados, Cenario, ConfigPiloto, Decisao, Evento, Modo, Outcome, ParametrosBase, Perfil, Recomendacao, RegraPiloto, RegraPreco, TipoDecisao,
} from "./types";
import { PARAMETROS_PADRAO } from "./types";
import { recalculateAll } from "./recalcular";
import { DEFAULT_MARGIN_FORMULA, MARGIN_FORMULAS, type MarginFormula } from "./margin";
import { buildLearnings, estimateElasticity, MEASUREMENT_DAYS, segmentKey, simulateOutcome, type SegmentLearning } from "./impact";

const BASES: Record<Cenario, BaseDados> = {
  oficial: oficial as unknown as BaseDados,
  sintetico: sintetico as unknown as BaseDados,
};

export const PERFIS: Record<Perfil, { nome: string; descricao: string }> = {
  analista: { nome: "Analista de pricing", descricao: "Decide as recomendações e veta o piloto automático." },
  gestor: { nome: "Gestor comercial", descricao: "Tudo do analista, mais regras, piloto automático e casos de risco alto." },
  visitante: { nome: "Visitante", descricao: "Conhece a ferramenta sem alterar nada." },
};

export type Permissao = "decidir" | "vetar" | "pilotar" | "regras" | "risco_alto";
const PERMISSOES: Record<Perfil, Permissao[]> = {
  analista: ["decidir", "vetar"],
  gestor: ["decidir", "vetar", "pilotar", "regras", "risco_alto"],
  visitante: [],
};

interface Estado {
  perfil: Perfil | null;
  nome: string;
  cenario: Cenario;
  decisoes: Decisao[];
  /** Exceções por item: valem acima das regras de grupo. */
  modos: Record<string, Modo>;
  regrasPiloto: RegraPiloto[];
  regrasPreco: RegraPreco[];
  parametros: ParametrosBase;
  estrategicos: string[];
  piloto: ConfigPiloto;
  agendamentos: Agendamento[];
  eventos: Evento[];
  abertoEm: Record<string, string>;
  aviso: { texto: string; recId: string } | null;
  marginFormula: MarginFormula;
  outcomes: Outcome[];
  /** Aprendizados que o gestor decidiu não aplicar ao piloto automático. */
  dismissedLearnings: string[];
}

const INICIAL: Estado = {
  perfil: null,
  nome: "",
  cenario: "oficial",
  decisoes: [],
  modos: {},
  regrasPiloto: [],
  regrasPreco: [],
  parametros: PARAMETROS_PADRAO,
  estrategicos: [],
  piloto: { ligado: false, teto: 0.03, janelaVetoHoras: 24 },
  agendamentos: [],
  eventos: [],
  abertoEm: {},
  aviso: null,
  marginFormula: DEFAULT_MARGIN_FORMULA,
  outcomes: [],
  dismissedLearnings: [],
};

const AVISO: Record<TipoDecisao, string> = { aprovar: "Aprovada", editar: "Ajustada", rejeitar: "Rejeitada", revisar: "Em revisão", etapa_rampa: "1ª etapa aprovada" };

const CHAVE = "pet-pricing-v2";
const uid = () => Math.random().toString(36).slice(2, 10);
const agora = () => new Date().toISOString();

export function cobre(g: Pick<RegraPiloto, "curva" | "canal" | "categoria">, r: Recomendacao) {
  return (!g.curva || r.curva === g.curva) && (!g.canal || r.canal === g.canal) && (!g.categoria || r.categoria === g.categoria);
}

export function descreverRegra(g: Pick<RegraPiloto, "curva" | "canal" | "categoria">) {
  const onde = !g.canal ? "em qualquer canal" : g.canal === "Loja física" ? "na loja física" : g.canal === "E-commerce" ? "no e-commerce" : "no marketplace";
  const quem = [g.categoria ?? "Todos os produtos", g.curva ? `da curva ${g.curva}` : null].filter(Boolean).join(" ");
  return `${quem} ${onde}`;
}

/** Uma recomendação pode ir para o piloto automático? Regras propostas na V2. */
export function elegivelPiloto(r: Recomendacao, teto: number, learning?: SegmentLearning) {
  const motivos: string[] = [];
  if (learning?.effect === "hold" && !learning.dismissed) motivos.push(`Aprendizado: ${learning.reason}`);
  if (r.acao !== "SUBIR" && r.acao !== "BAIXAR") motivos.push(`A recomendação é ${r.acao.toLowerCase()}`);
  if (r.alertas.some((a) => a.tipo === "bloqueio")) motivos.push("Há um bloqueio");
  if (r.alertas.some((a) => a.tipo === "aprovacao")) motivos.push("Uma regra pede aprovação humana");
  if (r.variacao != null && Math.abs(r.variacao) > teto + 1e-9) motivos.push(`Variação acima do teto de ${(teto * 100).toFixed(0)}%`);
  return { elegivel: motivos.length === 0, motivos };
}

interface Ctx extends Estado {
  base: BaseDados;
  recs: Recomendacao[];
  carregado: boolean;
  pode: (p: Permissao) => boolean;
  entrar: (perfil: Perfil, nome: string) => void;
  sair: () => void;
  trocarCenario: (c: Cenario) => void;
  recomecar: () => void;
  modoDe: (recId: string) => Modo;
  origemModo: (recId: string) => "exceção" | "regra" | "padrão";
  definirModo: (recIds: string[], modo: Modo, rotulo: string) => void;
  limparExcecao: (recIds: string[]) => void;
  adicionarRegraPiloto: (r: Omit<RegraPiloto, "id" | "criadaEm">) => void;
  removerRegraPiloto: (id: string) => void;
  salvarRegraPreco: (g: Omit<RegraPreco, "id" | "autor" | "atualizadaEm"> & { id?: string }) => void;
  alternarRegraPreco: (id: string) => void;
  removerRegraPreco: (id: string) => void;
  definirParametro: (cod: keyof ParametrosBase, valor: number, motivo: string) => void;
  definirEstrategicos: (skus: string[], motivo: string) => void;
  configurarPiloto: (c: Partial<ConfigPiloto>) => void;
  marcarAbertura: (recId: string) => void;
  decidir: (recId: string, tipo: TipoDecisao, opts: { preco?: number | null; justificativa?: string }) => void;
  decisaoDe: (recId: string) => Decisao | undefined;
  vetar: (agId: string) => void;
  previaPiloto: () => Recomendacao[];
  /** Elegibilidade ao piloto automático com teto e aprendizados. */
  eligibility: (r: Recomendacao) => { elegivel: boolean; motivos: string[] };
  learnings: SegmentLearning[];
  learningFor: (r: Recomendacao) => SegmentLearning | undefined;
  elasticity: Record<string, number>;
  setMarginFormula: (f: MarginFormula, reason: string) => void;
  /** Demo: aplica as mudanças agendadas e mede o resultado 30 dias depois. */
  simulateMeasurement: () => number;
  dismissLearning: (key: string, reason: string) => void;
  restoreLearning: (key: string) => void;
  rodarPiloto: () => number;
  desfazer: (recId: string) => void;
  fecharAviso: () => void;
}

const Contexto = createContext<Ctx | null>(null);

export function ProvedorPricing({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      // Lê o navegador só depois da hidratação, para o HTML do servidor e do cliente baterem.
      if (salvo) {
        const lido = JSON.parse(salvo);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEstado({ ...INICIAL, ...lido, parametros: { ...PARAMETROS_PADRAO, ...(lido.parametros ?? {}) }, aviso: null });
      }
    } catch {
      /* sem armazenamento: segue com o estado inicial */
    }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* ignora */
    }
  }, [estado, carregado]);

  const base = BASES[estado.cenario];
  const recs = useMemo(
    () => recalculateAll(base.recomendacoes, estado.regrasPreco, estado.parametros, estado.estrategicos, estado.marginFormula),
    [base, estado.regrasPreco, estado.parametros, estado.estrategicos, estado.marginFormula],
  );
  const elasticity = useMemo(() => estimateElasticity(base.recomendacoes), [base]);
  const learnings = useMemo(
    () => buildLearnings(recs, estado.outcomes, estado.decisoes, estado.dismissedLearnings),
    [recs, estado.outcomes, estado.decisoes, estado.dismissedLearnings],
  );
  const learningByKey = useMemo(() => new Map(learnings.map((l) => [l.key, l])), [learnings]);
  const learningFor = useCallback((r: Recomendacao) => learningByKey.get(segmentKey(r)), [learningByKey]);
  const eligibility = useCallback((r: Recomendacao) => elegivelPiloto(r, estado.piloto.teto, learningFor(r)), [estado.piloto.teto, learningFor]);
  const autor = estado.nome || (estado.perfil ? PERFIS[estado.perfil].nome : "—");

  const registrar = useCallback((e: Omit<Evento, "id" | "quando">) => {
    setEstado((s) => ({ ...s, eventos: [{ ...e, id: uid(), quando: agora() }, ...s.eventos].slice(0, 400) }));
  }, []);

  const pode = useCallback((p: Permissao) => (estado.perfil ? PERMISSOES[estado.perfil].includes(p) : false), [estado.perfil]);

  const porId = useMemo(() => new Map(recs.map((r) => [r.id, r])), [recs]);
  const regraCobre = useCallback(
    (recId: string) => {
      const r = porId.get(recId);
      return !!r && estado.regrasPiloto.some((g) => cobre(g, r));
    },
    [porId, estado.regrasPiloto],
  );
  const modoDe = useCallback(
    (recId: string): Modo => estado.modos[recId] ?? (regraCobre(recId) ? "autopiloto" : "copiloto"),
    [estado.modos, regraCobre],
  );

  const previaPiloto = useCallback(
    () =>
      recs.filter(
        (r) =>
          modoDe(r.id) === "autopiloto" &&
          eligibility(r).elegivel &&
          !estado.decisoes.some((d) => d.recId === r.id),
      ),
    [recs, modoDe, eligibility, estado.decisoes],
  );

  const valor: Ctx = useMemo(
    () => ({
      ...estado,
      base,
      recs,
      carregado,
      pode,
      modoDe,
      origemModo: (recId) => (estado.modos[recId] ? "exceção" : regraCobre(recId) ? "regra" : "padrão"),
      previaPiloto,
      eligibility,
      learnings,
      learningFor,
      elasticity,
      setMarginFormula: (f, reason) => {
        setEstado((s) => ({ ...s, marginFormula: f }));
        registrar({ autor, tipo: "configuração", texto: `trocou a fórmula de margem para “${MARGIN_FORMULAS[f].label}”. Motivo: ${reason}` });
      },
      simulateMeasurement: () => {
        const pendentes = estado.agendamentos.filter((a) => a.status === "agendado" || a.status === "aguardando veto");
        if (!pendentes.length) return 0;
        const appliedAt = agora();
        const novos = pendentes
          .map((a) => {
            const r = porId.get(a.recId);
            return r ? simulateOutcome(r, a, elasticity, estado.marginFormula, appliedAt) : null;
          })
          .filter((o): o is Outcome => o !== null);
        const ids = new Set(pendentes.map((a) => a.id));
        setEstado((s) => ({
          ...s,
          agendamentos: s.agendamentos.map((a) => (ids.has(a.id) ? { ...a, status: "aplicado" } : a)),
          outcomes: [...novos, ...s.outcomes.filter((o) => !ids.has(o.scheduleId))],
        }));
        const piores = novos.filter((o) => o.verdict === "worsened").length;
        registrar({
          autor: "Simulação", tipo: "impacto",
          texto: `aplicou ${novos.length} ${novos.length === 1 ? "mudança" : "mudanças"} e mediu ${MEASUREMENT_DAYS} dias depois: ${novos.length - piores} sem piora, ${piores} com piora na contribuição.`,
        });
        return novos.length;
      },
      dismissLearning: (key, reason) => {
        setEstado((s) => ({ ...s, dismissedLearnings: [...new Set([...s.dismissedLearnings, key])] }));
        registrar({ autor, tipo: "configuração", texto: `manteve o piloto automático em ${key.replace("|", " · ")} apesar do aprendizado. Motivo: ${reason}` });
      },
      restoreLearning: (key) => {
        setEstado((s) => ({ ...s, dismissedLearnings: s.dismissedLearnings.filter((k) => k !== key) }));
        registrar({ autor, tipo: "configuração", texto: `voltou a aplicar o aprendizado de ${key.replace("|", " · ")} ao piloto automático.` });
      },
      entrar: (perfil, nome) => {
        setEstado((s) => ({ ...s, perfil, nome }));
        registrar({ autor: nome || PERFIS[perfil].nome, tipo: "configuração", texto: `Entrou como ${PERFIS[perfil].nome}.` });
      },
      sair: () => setEstado((s) => ({ ...s, perfil: null, nome: "" })),
      trocarCenario: (c) => {
        setEstado((s) => ({ ...s, cenario: c, decisoes: [], agendamentos: [], modos: {}, regrasPiloto: [], regrasPreco: [], parametros: PARAMETROS_PADRAO, estrategicos: [], abertoEm: {}, outcomes: [], dismissedLearnings: [] }));
        registrar({ autor, tipo: "base", texto: c === "oficial" ? "Trocou para a base oficial do desafio." : "Trocou para os cenários sintéticos." });
      },
      recomecar: () =>
        setEstado((s) => ({ ...INICIAL, perfil: s.perfil, nome: s.nome, cenario: s.cenario, marginFormula: s.marginFormula })),
      definirModo: (recIds, modo, rotulo) => {
        setEstado((s) => {
          const modos = { ...s.modos };
          recIds.forEach((id) => (modos[id] = modo));
          return { ...s, modos };
        });
        registrar({ autor, tipo: "modo", texto: `${rotulo}: ${recIds.length} itens em ${modo === "autopiloto" ? "piloto automático" : "copiloto"}.` });
      },
      limparExcecao: (recIds) => {
        setEstado((s) => {
          const modos = { ...s.modos };
          recIds.forEach((id) => delete modos[id]);
          return { ...s, modos };
        });
        registrar({ autor, tipo: "modo", texto: `devolveu ${recIds.length} ${recIds.length === 1 ? "item" : "itens"} às regras de grupo.` });
      },
      adicionarRegraPiloto: (g) => {
        setEstado((s) => ({ ...s, regrasPiloto: [...s.regrasPiloto, { ...g, id: uid(), criadaEm: agora() }] }));
        registrar({ autor, tipo: "modo", texto: `criou a regra de piloto automático “${descreverRegra(g)}”.` });
      },
      removerRegraPiloto: (id) => {
        const g = estado.regrasPiloto.find((x) => x.id === id);
        setEstado((s) => ({ ...s, regrasPiloto: s.regrasPiloto.filter((x) => x.id !== id) }));
        if (g) registrar({ autor, tipo: "modo", texto: `removeu a regra “${descreverRegra(g)}”.` });
      },
      salvarRegraPreco: (g) => {
        const nova = !g.id;
        const regra: RegraPreco = { ...g, id: g.id ?? uid(), autor, atualizadaEm: agora() };
        setEstado((s) => ({ ...s, regrasPreco: nova ? [...s.regrasPreco, regra] : s.regrasPreco.map((x) => (x.id === regra.id ? regra : x)) }));
        registrar({ autor, tipo: "configuração", texto: `${nova ? "criou" : "editou"} a regra de preço “${g.nome}”. Motivo: ${g.justificativa}` });
      },
      alternarRegraPreco: (id) => {
        const g = estado.regrasPreco.find((x) => x.id === id);
        setEstado((s) => ({ ...s, regrasPreco: s.regrasPreco.map((x) => (x.id === id ? { ...x, ativa: !x.ativa, atualizadaEm: agora() } : x)) }));
        if (g) registrar({ autor, tipo: "configuração", texto: `${g.ativa ? "pausou" : "reativou"} a regra de preço “${g.nome}”.` });
      },
      removerRegraPreco: (id) => {
        const g = estado.regrasPreco.find((x) => x.id === id);
        setEstado((s) => ({ ...s, regrasPreco: s.regrasPreco.filter((x) => x.id !== id) }));
        if (g) registrar({ autor, tipo: "configuração", texto: `removeu a regra de preço “${g.nome}”.` });
      },
      definirParametro: (cod, valor, motivo) => {
        setEstado((s) => ({ ...s, parametros: { ...s.parametros, [cod]: valor } }));
        registrar({ autor, tipo: "configuração", texto: `alterou o parâmetro da ${cod} para ${valor}. Motivo: ${motivo}` });
      },
      definirEstrategicos: (skus, motivo) => {
        setEstado((s) => ({ ...s, estrategicos: skus }));
        registrar({ autor, tipo: "configuração", texto: `definiu ${skus.length} produtos estratégicos (R04). Motivo: ${motivo}` });
      },
      configurarPiloto: (c) => {
        setEstado((s) => ({ ...s, piloto: { ...s.piloto, ...c } }));
        const partes = [];
        if (c.ligado !== undefined) partes.push(c.ligado ? "ligou o piloto automático" : "desligou o piloto automático");
        if (c.teto !== undefined) partes.push(`teto de ${(c.teto * 100).toFixed(0)}%`);
        if (c.janelaVetoHoras !== undefined) partes.push(`janela de veto de ${c.janelaVetoHoras} h`);
        registrar({ autor, tipo: "configuração", texto: partes.join(", ") });
      },
      marcarAbertura: (recId) =>
        setEstado((s) => (s.abertoEm[recId] ? s : { ...s, abertoEm: { ...s.abertoEm, [recId]: agora() } })),
      decidir: (recId, tipo, { preco = null, justificativa = "" }) => {
        const r = recs.find((x) => x.id === recId);
        if (!r) return;
        const aberto = estado.abertoEm[recId];
        const seg = aberto ? Math.max(1, Math.round((Date.now() - new Date(aberto).getTime()) / 1000)) : null;
        const aplica = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const vaiAgendar = (tipo === "aprovar" || tipo === "editar" || tipo === "etapa_rampa") && preco != null;
        const d: Decisao = {
          id: uid(), recId, tipo, preco, justificativa, autor, perfil: estado.perfil ?? "visitante",
          quando: agora(), segundosAteDecidir: seg, agendadoPara: vaiAgendar ? aplica : null,
        };
        setEstado((s) => ({
          ...s,
          decisoes: [d, ...s.decisoes.filter((x) => x.recId !== recId)],
          agendamentos: vaiAgendar
            ? [{ id: uid(), recId, preco: preco!, origem: "humano", criadoEm: agora(), aplicaEm: aplica, status: "agendado" }, ...s.agendamentos.filter((a) => a.recId !== recId)]
            : s.agendamentos.filter((a) => a.recId !== recId),
          aviso: { recId, texto: `${AVISO[tipo]}: ${r.produto} · ${r.canal}${preco != null ? ` a R$ ${preco.toFixed(2).replace(".", ",")}` : ""}` },
        }));
        const nomes: Record<TipoDecisao, string> = {
          aprovar: "aprovou", editar: "editou e aprovou", rejeitar: "rejeitou", revisar: "enviou para revisão", etapa_rampa: "aprovou a 1ª etapa da rampa de",
        };
        registrar({ autor, tipo: "decisão", recId, texto: `${nomes[tipo]} ${r.sku} · ${r.canal}${preco != null ? ` a ${preco.toFixed(2)}` : ""}.` });
      },
      decisaoDe: (recId) => estado.decisoes.find((d) => d.recId === recId),
      vetar: (agId) => {
        const ag = estado.agendamentos.find((a) => a.id === agId);
        setEstado((s) => ({
          ...s,
          agendamentos: s.agendamentos.map((a) => (a.id === agId ? { ...a, status: "vetado" } : a)),
          decisoes: ag ? s.decisoes.filter((d) => !(d.recId === ag.recId && d.perfil === "sistema")) : s.decisoes,
        }));
        if (ag) registrar({ autor, tipo: "veto", recId: ag.recId, texto: `vetou a mudança automática de ${ag.recId.replace("|", " · ")}.` });
      },
      desfazer: (recId) => {
        setEstado((s) => ({
          ...s,
          decisoes: s.decisoes.filter((d) => d.recId !== recId),
          agendamentos: s.agendamentos.filter((a) => a.recId !== recId),
          aviso: null,
        }));
        registrar({ autor, tipo: "decisão", recId, texto: `desfez a decisão de ${recId.replace("|", " · ")}.` });
      },
      fecharAviso: () => setEstado((s) => ({ ...s, aviso: null })),
      rodarPiloto: () => {
        if (!estado.piloto.ligado) return 0;
        const alvo = previaPiloto();
        if (!alvo.length) return 0;
        const aplica = new Date(Date.now() + estado.piloto.janelaVetoHoras * 3600 * 1000).toISOString();
        setEstado((s) => ({
          ...s,
          decisoes: [
            ...alvo.map<Decisao>((r) => ({
              id: uid(), recId: r.id, tipo: "aprovar", preco: r.preco_sugerido, justificativa: "Dentro das travas do piloto automático.",
              autor: "Piloto automático", perfil: "sistema", quando: agora(), segundosAteDecidir: 0, agendadoPara: aplica,
            })),
            ...s.decisoes,
          ],
          agendamentos: [
            ...alvo.map<Agendamento>((r) => ({
              id: uid(), recId: r.id, preco: r.preco_sugerido!, origem: "piloto automático", criadoEm: agora(), aplicaEm: aplica, status: "aguardando veto",
            })),
            ...s.agendamentos,
          ],
        }));
        registrar({ autor: "Piloto automático", tipo: "piloto automático", texto: `agendou ${alvo.length} mudanças, com ${estado.piloto.janelaVetoHoras} h para veto.` });
        return alvo.length;
      },
    }),
    [estado, base, recs, carregado, pode, modoDe, previaPiloto, registrar, autor, regraCobre, eligibility, learnings, learningFor, elasticity, porId],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePricing() {
  const c = useContext(Contexto);
  if (!c) throw new Error("usePricing fora do ProvedorPricing");
  return c;
}
