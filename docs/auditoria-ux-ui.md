# Auditoria de UX, UI e textos — 04/10/2026

Referência: *Guia de boas práticas aplicáveis para a criação de interfaces* (Andrey Knabbenn, v2.0/2025), no cofre em `0 - Conhecimento/Guia de Boas Práticas para UI`. Os números (#) são as dicas do guia.

## Achados e correções

| # do guia | Problema encontrado | Correção |
|---|---|---|
| #1, #2 | Entrelinha não padronizada; palavras soltas no fim de parágrafos e títulos | Entrelinha de 1,5 em parágrafos e listas, 1,25 em títulos; quebra de linha equilibrada nos títulos e ajustada nos parágrafos |
| #14, #15 | Textos com 9, 10 e 11 px (rótulos de gráfico, etiquetas, legendas) | Mínimo de 12 px em todo o sistema |
| #18, #24 (60-30-10) | Roxo cheio no menu ativo, nas abas da fila, no selo de piloto automático, nos números do roteiro e no selo "Em uso", competindo com o botão principal | Roxo cheio reservado às ações principais. Seleções passam a usar fundo lilás claro com borda ou barra roxa |
| #19 | Seleção marcada só pela cor do texto | Item selecionado com preenchimento e borda |
| #20, #23 | "Trocar e apagar decisões" em roxo, mesmo apagando dados | Ação destrutiva em vermelho, com ícone de lixeira |
| #29 | Botões primários e secundários com o mesmo peso em algumas telas | Hierarquia fixa: primário cheio, secundário com contorno, terciário como texto |
| #31, #59 | Botões de ícone (fechar, próximo, abrir item, trocar perfil) com cerca de 36 px | Mínimo de 44 × 44 px; botões de texto com 44 px de altura |
| #33 | "Entrar como analista de pricing" (5 palavras), "Trocar e apagar decisões" (4) | "Entrar", "Trocar base", "Recomeçar", "Agendar mudanças": até 3 palavras |
| #34 | Arredondamento variando entre 10, 12 e 14 px nos botões | Botões sempre com 10 px; cards com 15 px (padrão da marca) |
| #35 | Botões sem ícone: usar base, recomeçar, vetar, criar regra, entrar | Ícone conhecido em todos os botões de ação |
| #74 | Estados vazios só diziam que não havia nada | Cada estado vazio sugere a próxima ação |

## Textos (UX writing)

| Antes | Depois | Por quê |
|---|---|---|
| Travas | Proteções | Palavra de operação, não de engenharia |
| Variação máxima sem pessoa | Variação máxima sem aprovação | Diz o que o usuário controla |
| Janela para veto antes de aplicar | Tempo para vetar antes de aplicar | Mais direto |
| Rodar agora | Agendar mudanças | Diz o que acontece de fato |
| Chave geral (ligada ou desligada, sem contexto) | Piloto automático ligado/desligado, mais o efeito em uma frase | O estado se explica sozinho |
| Pede motivo porque: … | Motivo obrigatório: … | Mais claro |
| Alertas da base | Regras acionadas | Fala da regra, não do dado |
| Atalhos (uma vez só) | Regras de grupo (permanentes), mais exceções por item | Ver abaixo |
| "1 passam", "1 prontos" | Concordância de número | Correção |

## Funcionalidade nova: regras de grupo na Pilotagem

Os atalhos antigos marcavam os itens uma única vez, não deixavam registro do critério e não diferenciavam regra de exceção.

Agora o gestor monta regras combinando curva, canal e categoria. Exemplos: "Todos os produtos da curva B em qualquer canal", "Acessórios no marketplace".

- **Antes de salvar:** a regra mostra quantos itens cobre e quantos passam pelas proteções.
- **Modo de cada item:** exceção manual, se houver; senão, a regra que o cobre; senão, copiloto. Isso aparece na tabela item por item como "pela regra" ou "exceção".
- **Exceções:** dá para devolver todas às regras com um clique.
- **Registro:** criar e remover regras fica registrado em Aprendizado.

## O que fica para depois

- **Dica #15 (testar em dispositivo real):** testar o front num celular depois da publicação.
- **Contraste:** medir todas as combinações com ferramenta de contraste (dica #17). As principais (texto suave `#6E6878` sobre branco e roxo-800 sobre lilás claro) ficam acima de 4,5:1 por cálculo, mas ainda falta uma checagem tela a tela.

## Rodada de 04/10 (noite)

- **Fórmula de margem selecionável:** contribuição é o padrão e margem bruta sobre reposição é a alternativa. A prévia do front confere com o motor do Allan nas duas fórmulas: 480/480 itens idênticos (`web/scripts/teste-recalculo.mts` contra `api/scripts/export_gross_reference.py`). A troca é só do gestor, pede motivo e fica no histórico.
- **Impacto e aprendizado:**
  - cada mudança aplicada é medida 30 dias depois (na demo, simulada a partir das vendas da base e da sensibilidade a preço estimada por categoria);
  - o resultado vira aprendizado por categoria e canal;
  - aprendizado negativo tira o grupo do piloto automático;
  - aprendizado positivo vira sugestão de regra para o gestor.
- **Integrações:** fontes do ERP e do módulo de coleta de concorrência, todas "a conectar", com campos esperados e regras que cada uma alimenta. O arquivo CSV de preços aprovados para o ERP já funciona.
- **Menu lateral:**
  - itens agrupados por etapa (Decidir, Automatizar, Acompanhar, Dados);
  - área de clique de 44 px e ícone em bloco;
  - seta ao passar o mouse e contadores (itens sem decisão, vetos, grupos fora do piloto, fontes a conectar).
- **Tela de entrada:**
  - moldura com painel em degradê da marca e prévia de um caso real da base;
  - ciclo do produto em 3 passos;
  - perfis como cartões com ícone e campo preenchido;
  - login corporativo indicado como caminho de produção.
