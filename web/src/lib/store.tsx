"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, apiEnabled, ApiError } from "./api";
import oficial from "@/data/oficial.json";
import sintetico from "@/data/sintetico.json";
import type {
  Agendamento, BaseDados, Cenario, ConfigPiloto, Decisao, Evento, Modo, Outcome, ParametrosBase, Perfil, Recomendacao, RegraPiloto, RegraPreco, TipoDecisao,
} from "./types";
import { PARAMETROS_PADRAO } from "./types";
import { moeda } from "./format";
import { recalculateAll } from "./recalcular";
import { DEFAULT_MARGIN_FORMULA, MARGIN_FORMULAS, type MarginFormula } from "./margin";
import { buildLearnings, estimateElasticity, MEASUREMENT_DAYS, segmentKey, simulateOutcome, type SegmentLearning } from "./impact";

/** Bases embutidas: valem sem API e enquanto a API não responde. */
const BASES_LOCAIS: Partial<Record<Cenario, BaseDados>> = {
  oficial: oficial as unknown as BaseDados,
  sintetico: sintetico as unknown as BaseDados,
};
const CHAVE_SESSAO = "pet-pricing-session";

export type StatusApi = "local" | "conectando" | "online" | "offline";

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
  /** Aviso com Desfazer: guarda o estado anterior dos itens para restaurar. */
  aviso: { texto: string; recIds: string[]; antes: { decisoes: Decisao[]; agendamentos: Agendamento[] } } | null;
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
  /** "local" = sem API configurada; "online" = estado e histórico salvos no servidor. */
  statusApi: StatusApi;
  sessaoId: string | null;
  temBaseEnviada: boolean;
  enviarBase: (arquivo: File) => Promise<{ ok: true; itens: number; avisos: number } | { ok: false; mensagem: string }>;
  decidir: (recId: string, tipo: TipoDecisao, opts: { preco?: number | null; justificativa?: string }) => void;
  /** Aprovação em lote: um aviso só, e o Desfazer volta todos os itens. */
  decidirLote: (itens: { recId: string; preco: number | null }[], justificativa: string) => void;
  /** O preço deste item já foi aplicado neste ciclo? */
  aplicado: (recId: string) => boolean;
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
  desfazer: () => void;
  fecharAviso: () => void;
}

const Contexto = createContext<Ctx | null>(null);

export function ProvedorPricing({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const [carregado, setCarregado] = useState(false);
  const [basesRemotas, setBasesRemotas] = useState<Partial<Record<Cenario, BaseDados>>>({});
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [statusApi, setStatusApi] = useState<StatusApi>(apiEnabled ? "conectando" : "local");
  const versaoRef = useRef(0);
  const ctxRef = useRef({ sessaoId: null as string | null, perfil: null as Perfil | null, online: false });
  useEffect(() => {
    ctxRef.current = { sessaoId, perfil: estado.perfil, online: statusApi === "online" };
  }, [sessaoId, estado.perfil, statusApi]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      // Lê o navegador só depois da hidratação, para o HTML do servidor e do cliente baterem.
      if (salvo) {
        const lido = JSON.parse(salvo);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEstado({
          ...INICIAL, ...lido,
          parametros: { ...PARAMETROS_PADRAO, ...(lido.parametros ?? {}) },
          piloto: { ...INICIAL.piloto, ...(lido.piloto ?? {}) },
          aviso: null,
        });
      }
    } catch {
      /* sem armazenamento: segue com o estado inicial */
    }
    setCarregado(true);
  }, []);

  // Com API: recupera ou cria a sessão do visitante e usa o estado salvo no servidor.
  useEffect(() => {
    if (!apiEnabled || !carregado) return;
    let cancelado = false;
    (async () => {
      try {
        let id: string | null = null;
        try {
          id = localStorage.getItem(CHAVE_SESSAO);
        } catch {
          /* sem armazenamento */
        }
        let temEnviada = false;
        if (id) {
          try {
            temEnviada = (await api.session(id)).has_upload;
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) id = null;
            else throw e;
          }
        }
        if (!id) id = (await api.createSession()).session_id;
        try {
          localStorage.setItem(CHAVE_SESSAO, id);
        } catch {
          /* ignora */
        }
        const [remoto, baseOficial, baseSintetica, enviada] = await Promise.all([
          api.getState(id), api.base("oficial"), api.base("sintetico"), temEnviada ? api.upload(id) : Promise.resolve(null),
        ]);
        if (cancelado) return;
        versaoRef.current = remoto.version;
        setBasesRemotas({ oficial: baseOficial, sintetico: baseSintetica, ...(enviada ? { enviada } : {}) });
        if (remoto.state) {
          const lido = remoto.state as Partial<Estado>;
          setEstado((s) => ({
            ...INICIAL, ...lido,
            perfil: s.perfil, nome: s.nome,
            parametros: { ...PARAMETROS_PADRAO, ...(lido.parametros ?? {}) },
            piloto: { ...INICIAL.piloto, ...(lido.piloto ?? {}) },
            cenario: lido.cenario === "enviada" && !enviada ? "oficial" : (lido.cenario ?? s.cenario),
            aviso: null,
          }));
        }
        setSessaoId(id);
        setStatusApi("online");
      } catch {
        if (!cancelado) setStatusApi("offline");
      }
    })();
    return () => { cancelado = true; };
  }, [carregado]);

  // Salva o estado no servidor com atraso curto; em conflito, adota a versão atual e grava de novo.
  useEffect(() => {
    if (statusApi !== "online" || !sessaoId) return;
    const t = setTimeout(async () => {
      const corpo = { ...estado, aviso: null };
      try {
        versaoRef.current = (await api.putState(sessaoId, versaoRef.current, corpo)).version;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          try {
            versaoRef.current = (await api.getState(sessaoId)).version;
            versaoRef.current = (await api.putState(sessaoId, versaoRef.current, corpo)).version;
          } catch {
            setStatusApi("offline");
          }
        } else setStatusApi("offline");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [estado, statusApi, sessaoId]);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* ignora */
    }
  }, [estado, carregado]);

  const base = basesRemotas[estado.cenario] ?? BASES_LOCAIS[estado.cenario] ?? (BASES_LOCAIS.oficial as BaseDados);
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
    // Com API, o evento também vai para o histórico encadeado do servidor.
    const { sessaoId: id, perfil, online } = ctxRef.current;
    if (online && id) {
      const profile = e.autor === "Piloto automático" || e.autor === "Sistema" || e.autor === "Simulação" ? "sistema" : perfil ?? "visitante";
      api.postEvent(id, { author: e.autor.slice(0, 80), profile, kind: e.tipo, text: e.texto.slice(0, 1000), rec_id: e.recId ?? null }).catch(() => undefined);
    }
  }, []);

  // Estável entre renderizações, para o temporizador do aviso não reiniciar a cada mudança.
  const fecharAviso = useCallback(() => setEstado((s) => ({ ...s, aviso: null })), []);

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
          !estado.decisoes.some((d) => d.recId === r.id) &&
          // item vetado ou já agendado não volta para a prévia neste ciclo
          !estado.agendamentos.some((a) => a.recId === r.id),
      ),
    [recs, modoDe, eligibility, estado.decisoes, estado.agendamentos],
  );

  /**
   * Mudanças do piloto ainda em janela de veto foram calculadas com as regras antigas.
   * Quando fórmula, regras, parâmetros ou proteções mudam, elas são canceladas.
   */
  const pendentesPiloto = estado.agendamentos.filter((a) => a.status === "aguardando veto");
  const cancelarPiloto = (s: Estado): Estado => {
    const ids = new Set(s.agendamentos.filter((a) => a.status === "aguardando veto").map((a) => a.recId));
    if (!ids.size) return s;
    return {
      ...s,
      agendamentos: s.agendamentos.map((a) => (a.status === "aguardando veto" ? { ...a, status: "cancelado" } : a)),
      decisoes: s.decisoes.filter((d) => !(d.perfil === "sistema" && ids.has(d.recId))),
    };
  };
  const avisarCancelamento = () => {
    if (!pendentesPiloto.length) return;
    const n = pendentesPiloto.length;
    registrar({ autor: "Sistema", tipo: "piloto automático", texto: `cancelou ${n} ${n === 1 ? "mudança" : "mudanças"} do piloto em janela de veto, porque as regras mudaram. Agende de novo pela prévia.` });
  };
  const aplicadoSet = new Set(estado.agendamentos.filter((a) => a.status === "aplicado").map((a) => a.recId));
  const decidirItens = (itens: { recId: string; preco: number | null }[], tipo: TipoDecisao, justificativa: string) => {
    // Item com preço já aplicado só volta a ser decidido no próximo ciclo.
    const validos = itens.map((i) => ({ ...i, r: porId.get(i.recId) })).filter((i) => i.r && !aplicadoSet.has(i.recId));
    if (!validos.length) return;
    const ids = new Set(validos.map((i) => i.recId));
    const aplica = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const aceita = tipo === "aprovar" || tipo === "editar" || tipo === "etapa_rampa";
    const novas: Decisao[] = [];
    const agendas: Agendamento[] = [];
    for (const { recId, preco, r } of validos) {
      const aberto = estado.abertoEm[recId];
      const seg = aberto ? Math.max(1, Math.round((Date.now() - new Date(aberto).getTime()) / 1000)) : null;
      // Manter o mesmo preço é decisão registrada, mas não vira mudança agendada.
      const vaiAgendar = aceita && preco != null && Math.abs(preco - r!.preco_atual) > 0.004;
      novas.push({
        id: uid(), recId, tipo, preco, justificativa, autor, perfil: estado.perfil ?? "visitante",
        quando: agora(), segundosAteDecidir: seg, agendadoPara: vaiAgendar ? aplica : null,
      });
      if (vaiAgendar) agendas.push({ id: uid(), recId, preco: preco!, origem: "humano", criadoEm: agora(), aplicaEm: aplica, status: "agendado" });
    }
    const primeiro = validos[0];
    const texto = validos.length === 1
      ? `${AVISO[tipo]}: ${primeiro.r!.produto} · ${primeiro.r!.canal}${primeiro.preco != null ? ` a ${moeda(primeiro.preco)}` : ""}`
      : `${validos.length} itens ${tipo === "aprovar" ? "aprovados" : "decididos"}`;
    setEstado((s) => ({
      ...s,
      decisoes: [...novas, ...s.decisoes.filter((x) => !ids.has(x.recId))],
      agendamentos: [...agendas, ...s.agendamentos.filter((a) => !ids.has(a.recId))],
      aviso: {
        texto, recIds: [...ids],
        antes: { decisoes: s.decisoes.filter((x) => ids.has(x.recId)), agendamentos: s.agendamentos.filter((a) => ids.has(a.recId)) },
      },
    }));
    const nomes: Record<TipoDecisao, string> = {
      aprovar: "aprovou", editar: "editou e aprovou", rejeitar: "rejeitou", revisar: "enviou para revisão", etapa_rampa: "aprovou a 1ª etapa da rampa de",
    };
    if (validos.length === 1) {
      registrar({ autor, tipo: "decisão", recId: primeiro.recId, texto: `${nomes[tipo]} ${primeiro.r!.sku} · ${primeiro.r!.canal}${primeiro.preco != null ? ` a ${moeda(primeiro.preco)}` : ""}.` });
    } else {
      registrar({ autor, tipo: "decisão", texto: `${nomes[tipo]} ${validos.length} itens em lote. Motivo: ${justificativa}` });
    }
  };

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
        setEstado((s) => cancelarPiloto({ ...s, marginFormula: f }));
        registrar({ autor, tipo: "configuração", texto: `trocou a fórmula de margem para “${MARGIN_FORMULAS[f].label}”. Motivo: ${reason}` });
        avisarCancelamento();
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
        setEstado((s) => ({ ...s, cenario: c, decisoes: [], agendamentos: [], modos: {}, regrasPiloto: [], regrasPreco: [], parametros: PARAMETROS_PADRAO, estrategicos: [], abertoEm: {}, outcomes: [], dismissedLearnings: [], aviso: null }));
        registrar({ autor, tipo: "base", texto: c === "oficial" ? "Trocou para a base oficial do desafio." : c === "sintetico" ? "Trocou para os cenários sintéticos." : "Trocou para a base enviada." });
      },
      recomecar: () =>
        setEstado((s) => ({ ...INICIAL, perfil: s.perfil, nome: s.nome, cenario: s.cenario, marginFormula: s.marginFormula })),
      definirModo: (recIds, modo, rotulo) => {
        setEstado((s) => {
          const modos = { ...s.modos };
          recIds.forEach((id) => (modos[id] = modo));
          return { ...s, modos };
        });
        registrar({ autor, tipo: "modo", texto: `${rotulo}: ${recIds.length} ${recIds.length === 1 ? "item" : "itens"} em ${modo === "autopiloto" ? "piloto automático" : "copiloto"}.` });
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
        setEstado((s) => cancelarPiloto({ ...s, regrasPreco: nova ? [...s.regrasPreco, regra] : s.regrasPreco.map((x) => (x.id === regra.id ? regra : x)) }));
        registrar({ autor, tipo: "configuração", texto: `${nova ? "criou" : "editou"} a regra de preço “${g.nome}”. Motivo: ${g.justificativa}` });
        avisarCancelamento();
      },
      alternarRegraPreco: (id) => {
        const g = estado.regrasPreco.find((x) => x.id === id);
        setEstado((s) => cancelarPiloto({ ...s, regrasPreco: s.regrasPreco.map((x) => (x.id === id ? { ...x, ativa: !x.ativa, atualizadaEm: agora() } : x)) }));
        if (g) registrar({ autor, tipo: "configuração", texto: `${g.ativa ? "pausou" : "reativou"} a regra de preço “${g.nome}”.` });
        avisarCancelamento();
      },
      removerRegraPreco: (id) => {
        const g = estado.regrasPreco.find((x) => x.id === id);
        setEstado((s) => cancelarPiloto({ ...s, regrasPreco: s.regrasPreco.filter((x) => x.id !== id) }));
        if (g) registrar({ autor, tipo: "configuração", texto: `removeu a regra de preço “${g.nome}”.` });
        avisarCancelamento();
      },
      definirParametro: (cod, valor, motivo) => {
        setEstado((s) => cancelarPiloto({ ...s, parametros: { ...s.parametros, [cod]: valor } }));
        registrar({ autor, tipo: "configuração", texto: `alterou o parâmetro da ${cod} para ${valor}. Motivo: ${motivo}` });
        avisarCancelamento();
      },
      definirEstrategicos: (skus, motivo) => {
        setEstado((s) => cancelarPiloto({ ...s, estrategicos: skus }));
        registrar({ autor, tipo: "configuração", texto: `definiu ${skus.length} ${skus.length === 1 ? "produto estratégico" : "produtos estratégicos"} (R04). Motivo: ${motivo}` });
        avisarCancelamento();
      },
      configurarPiloto: (c) => {
        // Desligar o piloto ou apertar o teto invalida o que ainda está em janela de veto.
        const invalida = c.ligado === false || (c.teto !== undefined && c.teto < estado.piloto.teto);
        setEstado((s) => (invalida ? cancelarPiloto({ ...s, piloto: { ...s.piloto, ...c } }) : { ...s, piloto: { ...s.piloto, ...c } }));
        if (invalida) avisarCancelamento();
        const partes = [];
        if (c.ligado !== undefined) partes.push(c.ligado ? "ligou o piloto automático" : "desligou o piloto automático");
        if (c.teto !== undefined) partes.push(`teto de ${(c.teto * 100).toFixed(0)}%`);
        if (c.janelaVetoHoras !== undefined) partes.push(`janela de veto de ${c.janelaVetoHoras} h`);
        registrar({ autor, tipo: "configuração", texto: partes.join(", ") });
      },
      statusApi,
      sessaoId,
      temBaseEnviada: !!basesRemotas.enviada,
      enviarBase: async (arquivo) => {
        if (!sessaoId || statusApi !== "online") return { ok: false, mensagem: "O servidor não está conectado. Envio de base só funciona com a API." };
        try {
          const payload = await api.sendUpload(sessaoId, arquivo, estado.perfil ?? "visitante");
          setBasesRemotas((b) => ({ ...b, enviada: payload }));
          setEstado((s) => ({ ...s, cenario: "enviada", decisoes: [], agendamentos: [], modos: {}, regrasPiloto: [], regrasPreco: [], parametros: PARAMETROS_PADRAO, estrategicos: [], abertoEm: {}, outcomes: [], dismissedLearnings: [], aviso: null }));
          registrar({ autor, tipo: "base", texto: `Enviou a base “${arquivo.name}” (${payload.recomendacoes.length} itens).` });
          return { ok: true, itens: payload.recomendacoes.length, avisos: payload.avisos_importacao?.length ?? 0 };
        } catch (e) {
          return { ok: false, mensagem: e instanceof Error ? e.message : "Não foi possível enviar a base." };
        }
      },
      marcarAbertura: (recId) =>
        setEstado((s) => (s.abertoEm[recId] ? s : { ...s, abertoEm: { ...s.abertoEm, [recId]: agora() } })),
      decidir: (recId, tipo, { preco = null, justificativa = "" }) => decidirItens([{ recId, preco }], tipo, justificativa),
      decidirLote: (itens, justificativa) => decidirItens(itens, "aprovar", justificativa),
      aplicado: (recId) => aplicadoSet.has(recId),
      decisaoDe: (recId) => estado.decisoes.find((d) => d.recId === recId),
      vetar: (agId) => {
        const ag = estado.agendamentos.find((a) => a.id === agId);
        if (!ag || ag.status !== "aguardando veto") return;
        setEstado((s) => ({
          ...s,
          agendamentos: s.agendamentos.map((a) => (a.id === agId ? { ...a, status: "vetado" } : a)),
          decisoes: s.decisoes.filter((d) => !(d.recId === ag.recId && d.perfil === "sistema")),
        }));
        registrar({ autor, tipo: "veto", recId: ag.recId, texto: `vetou a mudança automática de ${ag.recId.replace("|", " · ")}.` });
      },
      desfazer: () => {
        const av = estado.aviso;
        if (!av) return;
        const ids = new Set(av.recIds);
        setEstado((s) => ({
          ...s,
          decisoes: [...av.antes.decisoes, ...s.decisoes.filter((d) => !ids.has(d.recId))],
          agendamentos: [...av.antes.agendamentos, ...s.agendamentos.filter((a) => !ids.has(a.recId))],
          aviso: null,
        }));
        registrar({ autor, tipo: "decisão", texto: av.recIds.length === 1 ? `desfez a decisão de ${av.recIds[0].replace("|", " · ")}.` : `desfez ${av.recIds.length} decisões.` });
      },
      fecharAviso,
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
        registrar({ autor: "Piloto automático", tipo: "piloto automático", texto: `agendou ${alvo.length} ${alvo.length === 1 ? "mudança" : "mudanças"}, com ${estado.piloto.janelaVetoHoras} h para veto.` });
        return alvo.length;
      },
    }),
    [estado, base, recs, carregado, pode, modoDe, previaPiloto, registrar, autor, regraCobre, eligibility, learnings, learningFor, elasticity, porId, fecharAviso, statusApi, sessaoId, basesRemotas],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePricing() {
  const c = useContext(Contexto);
  if (!c) throw new Error("usePricing fora do ProvedorPricing");
  return c;
}
