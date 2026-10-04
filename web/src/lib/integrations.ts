import { ArrowUpFromLine, Boxes, FileSpreadsheet, Megaphone, PackageSearch, Radar, ReceiptText, ShoppingCart, type LucideIcon } from "lucide-react";

export interface Source {
  id: string;
  name: string;
  system: string;
  direction: "read" | "write";
  icon: LucideIcon;
  what: string;
  sheet: string;
  fields: string[];
  rules: string;
  frequency: string;
}

/** Fontes que o desafio diz que a Popular Pet já tem: módulo de coleta de concorrência e ERP. */
export const SOURCES: Source[] = [
  {
    id: "catalog", name: "Cadastro de produtos", system: "ERP", direction: "read", icon: PackageSearch,
    what: "Quem é cada produto e como ele é classificado.", sheet: "Produtos",
    fields: ["SKU", "Produto", "Categoria", "Marca", "Curva ABC", "Status"], rules: "Curva A (R03), estratégicos (R04)", frequency: "Diária",
  },
  {
    id: "prices", name: "Preços por canal", system: "ERP", direction: "read", icon: ReceiptText,
    what: "Preço vigente em cada canal e histórico de mudanças.", sheet: "Precos_Atuais, Historico_Precos",
    fields: ["SKU", "Canal", "Preço atual", "Data referência", "Data", "Preço", "Motivo", "Origem"], rules: "Variação máxima (R02), intervalo entre mudanças (R08), canais (R07)", frequency: "A cada execução",
  },
  {
    id: "costs", name: "Custos e margens", system: "ERP", direction: "read", icon: FileSpreadsheet,
    what: "Custo de reposição, impostos, frete, taxa do canal e margens mínima e alvo.", sheet: "Custos_Margens",
    fields: ["SKU", "Canal", "Custo reposição", "Impostos estimados", "Frete rateado", "Taxa canal", "Margem mínima", "Margem alvo"], rules: "Margem mínima (R01)", frequency: "Diária",
  },
  {
    id: "sales", name: "Vendas", system: "ERP", direction: "read", icon: ShoppingCart,
    what: "Unidades e receita por mês, produto e canal. Também mede o impacto depois de cada mudança.", sheet: "Vendas_12m",
    fields: ["Mês", "SKU", "Canal", "Quantidade", "Receita", "Preço médio", "Desconto médio"], rules: "Sensibilidade a preço, acompanhamento de impacto", frequency: "Diária",
  },
  {
    id: "stock", name: "Estoque", system: "ERP", direction: "read", icon: Boxes,
    what: "Estoque atual, cobertura em dias e pedidos de compra abertos.", sheet: "Estoque",
    fields: ["SKU", "Estoque atual", "Cobertura dias", "Pedido compra aberto", "Previsão recebimento", "Local"], rules: "Estoque baixo (R11), queda com estoque alto (R12)", frequency: "Diária",
  },
  {
    id: "competitors", name: "Preços da concorrência", system: "Módulo de coleta de concorrência", direction: "read", icon: Radar,
    what: "Preço, disponibilidade e frete dos concorrentes, com a correspondência de produto que o módulo já faz.", sheet: "Concorrencia",
    fields: ["SKU", "Concorrente", "Correspondência", "Preço", "Disponível", "Frete", "Data/hora coleta", "Confiabilidade matching"], rules: "Coleta vencida (R06), indisponível (R05), salto de preço (R10)", frequency: "A cada coleta",
  },
  {
    id: "promotions", name: "Promoções e campanhas", system: "ERP ou ferramenta de marketing", direction: "read", icon: Megaphone,
    what: "Campanhas ativas, período e desconto.", sheet: "Promocoes",
    fields: ["SKU", "Campanha", "Início", "Fim", "Desconto", "Regra"], rules: "Item em campanha vai para revisão (R09)", frequency: "Diária",
  },
  {
    id: "publish", name: "Preços aprovados", system: "ERP", direction: "write", icon: ArrowUpFromLine,
    what: "Devolve ao ERP só o que foi aprovado por uma pessoa ou pelo piloto automático dentro das proteções.", sheet: "Arquivo de saída",
    fields: ["SKU", "Canal", "Preço atual", "Preço novo", "Aplicar em", "Origem", "Aprovado por", "Motivo"], rules: "Nada sai sem aprovação ou janela de veto", frequency: "Depois de cada aprovação",
  },
];

