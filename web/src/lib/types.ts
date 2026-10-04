export type Acao = "SUBIR" | "BAIXAR" | "MANTER" | "REVISAR";
export type Risco = "Alto" | "Médio" | "Baixo";
export type Canal = "Loja física" | "E-commerce" | "Marketplace";
export type Cenario = "oficial" | "sintetico";
export type Perfil = "analista" | "gestor" | "visitante";
export type Modo = "copiloto" | "autopiloto";
export type TipoAlerta = "bloqueio" | "aprovacao" | "informativo";

export interface Alerta {
  codigo: string | null;
  texto: string;
  tipo: TipoAlerta;
}

export interface Concorrente {
  nome: string;
  preco: number | null;
  frete: number | null;
  disponivel: string;
  coleta: string;
  matching: string;
  correspondencia: string;
}

export interface Rampa {
  proposta: true;
  aumento_necessario: number;
  etapas: number;
  preco_etapa_1: number;
  intervalo_dias: number;
  texto: string;
}

export interface Recomendacao {
  id: string;
  sku: string;
  produto: string;
  categoria: string;
  marca: string;
  curva: "A" | "B" | "C";
  status_cadastro: string;
  canal: Canal;
  sintetico: boolean;
  acao: Acao;
  risco: Risco;
  prioridade: number;
  preco_atual: number;
  preco_sugerido: number | null;
  preco_mercado: number | null;
  preco_minimo: number;
  preco_alvo: number;
  limite_inferior: number;
  limite_superior: number;
  variacao: number | null;
  diferenca_mercado: number | null;
  custo: { reposicao: number; impostos: number; frete: number; total: number; taxa_canal: number };
  margem: { atual: number; projetada: number | null; minima: number; alvo: number; simples_reposicao: number | null };
  estoque: { atual: number; cobertura_dias: number; pedido_aberto: number; previsao: string | null; local: string };
  concorrentes: Concorrente[];
  concorrencia: { validos: number; desatualizado: boolean; anomalia: boolean };
  vendas: { mes: string; quantidade: number; preco_medio: number }[];
  historico_precos: { data: string; preco: number; motivo: string }[];
  promocoes: { campanha: string; inicio: string; fim: string; desconto: number }[];
  alertas: Alerta[];
  bloqueios: string[];
  exige_aprovacao_motor: boolean;
  justificativa_motor: string;
  regra_aplicada: string;
  proposta: { rampa: Rampa | null; elegivel_piloto_automatico: boolean; motivos_inelegivel: string[] };
  data_referencia: string;
}

export interface BaseDados {
  cenario: Cenario;
  fonte: string;
  data_referencia: string;
  teto_piloto_automatico: number;
  indicadores: { indicador: string; atual: string; meta: string; frequencia: string; responsavel: string }[];
  regras: { id: string; tema: string; regra: string; acao: string; criticidade: string }[];
  skus_sinteticos: string[];
  recomendacoes: Recomendacao[];
}

export type TipoDecisao = "aprovar" | "editar" | "rejeitar" | "revisar" | "etapa_rampa";

export interface Decisao {
  id: string;
  recId: string;
  tipo: TipoDecisao;
  preco: number | null;
  justificativa: string;
  autor: string;
  perfil: Perfil | "sistema";
  quando: string;
  segundosAteDecidir: number | null;
  agendadoPara: string | null;
}

export interface Agendamento {
  id: string;
  recId: string;
  preco: number;
  origem: "humano" | "piloto automático";
  criadoEm: string;
  aplicaEm: string;
  status: "aguardando veto" | "agendado" | "aplicado" | "vetado";
}

export interface Evento {
  id: string;
  quando: string;
  autor: string;
  tipo: "decisão" | "modo" | "configuração" | "piloto automático" | "veto" | "base";
  texto: string;
  recId?: string;
}

export interface ConfigPiloto {
  ligado: boolean;
  teto: number;
  janelaVetoHoras: number;
}

/** Regra de grupo da pilotagem: todos os critérios preenchidos precisam bater. */
export interface RegraPiloto {
  id: string;
  curva: "A" | "B" | "C" | null;
  canal: Canal | null;
  categoria: string | null;
  criadaEm: string;
}
