"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import oficial from "@/data/oficial.json";
import sintetico from "@/data/sintetico.json";
import type {
  Agendamento, BaseDados, Cenario, ConfigPiloto, Decisao, Evento, Modo, Perfil, Recomendacao, RegraPiloto, TipoDecisao,
} from "./types";

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
  piloto: ConfigPiloto;
  agendamentos: Agendamento[];
  eventos: Evento[];
  abertoEm: Record<string, string>;
  aviso: { texto: string; recId: string } | null;
}

const INICIAL: Estado = {
  perfil: null,
  nome: "",
  cenario: "oficial",
  decisoes: [],
  modos: {},
  regrasPiloto: [],
  piloto: { ligado: false, teto: 0.03, janelaVetoHoras: 24 },
  agendamentos: [],
  eventos: [],
  abertoEm: {},
  aviso: null,
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
export function elegivelPiloto(r: Recomendacao, teto: number) {
  const motivos: string[] = [];
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
  configurarPiloto: (c: Partial<ConfigPiloto>) => void;
  marcarAbertura: (recId: string) => void;
  decidir: (recId: string, tipo: TipoDecisao, opts: { preco?: number | null; justificativa?: string }) => void;
  decisaoDe: (recId: string) => Decisao | undefined;
  vetar: (agId: string) => void;
  previaPiloto: () => Recomendacao[];
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (salvo) setEstado({ ...INICIAL, ...JSON.parse(salvo), aviso: null });
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
  const recs = base.recomendacoes;
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
          elegivelPiloto(r, estado.piloto.teto).elegivel &&
          !estado.decisoes.some((d) => d.recId === r.id),
      ),
    [recs, modoDe, estado.piloto.teto, estado.decisoes],
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
      entrar: (perfil, nome) => {
        setEstado((s) => ({ ...s, perfil, nome }));
        registrar({ autor: nome || PERFIS[perfil].nome, tipo: "configuração", texto: `Entrou como ${PERFIS[perfil].nome}.` });
      },
      sair: () => setEstado((s) => ({ ...s, perfil: null, nome: "" })),
      trocarCenario: (c) => {
        setEstado((s) => ({ ...s, cenario: c, decisoes: [], agendamentos: [], modos: {}, regrasPiloto: [], abertoEm: {} }));
        registrar({ autor, tipo: "base", texto: c === "oficial" ? "Trocou para a base oficial do desafio." : "Trocou para os cenários sintéticos." });
      },
      recomecar: () =>
        setEstado((s) => ({ ...INICIAL, perfil: s.perfil, nome: s.nome, cenario: s.cenario })),
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
    [estado, base, recs, carregado, pode, modoDe, previaPiloto, registrar, autor, regraCobre],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePricing() {
  const c = useContext(Contexto);
  if (!c) throw new Error("usePricing fora do ProvedorPricing");
  return c;
}
