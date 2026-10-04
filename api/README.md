# Pet Pricing — Copiloto Inteligente de Precificação

Protótipo funcional do **Grupo 12 do ITA Challenge Sprint**, **Desafio 04 — Popular Pet**. Analisa o catálogo por SKU/canal, propõe preços explicáveis e registra decisões humanas. A base fornecida contém **dados fictícios**. Nenhum preço é enviado para sistemas externos.

Manual para operadores: [consultar em PDF](output/pdf/Manual_do_Usuario_Pet_Pricing.pdf) ou [ler a versão em Markdown](docs/MANUAL_DO_USUARIO.md), com passos de análise, regras, exclusões, aprovação, agendamento e solução de problemas.

## Rodar localmente

Requer Python **3.11 ou superior**. Na raiz do projeto, em PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
streamlit run app.py
```

Se a política do PowerShell impedir a ativação, use os executáveis diretamente, sem mudar a política do computador:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

Abra `http://localhost:8501`. O primeiro acesso encontra o Excel na raiz, valida e importa todas as abas no SQLite. O arquivo original nunca é sobrescrito. A pasta `data` e o banco são criados automaticamente. O ambiente preparado nesta máquina reaproveita bibliotecas já instaladas via `--system-site-packages`; a instalação acima também funciona em um ambiente isolado novo.

Em macOS/Linux: `python3 -m venv .venv`, `source .venv/bin/activate`, `pip install -r requirements.txt`, `streamlit run app.py`.

## Configuração e IA opcional

O aplicativo funciona sem `.env` e sem internet após instalar as dependências. Para configurar, copie `.env.example` para `.env` e edite localmente:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
PET_PRICING_DB=data/pet_pricing.db
```

Nunca compartilhe a chave. `.env`, banco e caches são ignorados pelo Git. Não há chave embutida nem autenticação externa obrigatória. Só o botão de explicação no detalhe chama a API quando há chave. Sem chave, sem SDK ou em falha, a explicação determinística permanece disponível e identificada na interface.

A integração usa o SDK oficial, `client.responses.parse`, esquema Pydantic, `store=False`, timeout e nenhuma ferramenta de ação. Envia somente fatos já calculados em JSON. A saída é texto auxiliar para conferência, nunca alimenta preço, regra, decisão ou agendamento. Veja a [documentação oficial de saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs). Nenhuma chamada paga é necessária para testar o projeto.

## Fluxo humano–IA

```text
Excel da Popular Pet
        ↓
Validação e preparação
        ↓
Regras configuráveis
        ↓
Motor determinístico de preço
        ↓
IA explica sinais e riscos
        ↓
Humano aprova, edita, rejeita ou agenda
        ↓
Decisão e feedback ficam registrados
```

## Dados e referência temporal

- A descoberta procura um `.xlsx` na raiz, priorizando nome com `Popular`. Se houver ambiguidade, pede importação explícita na interface.
- Detecta cabeçalho nas primeiras 20 linhas; na base fornecida está na linha 3. Remove linhas completamente vazias e preserva identificadores como texto.
- Converte moeda brasileira, percentuais, quantidades e datas; normaliza canais conhecidos e curva ABC. Frações são a representação interna dos percentuais; textos `25%` e números inteiros `25` também são aceitos como 25% em colunas percentuais.
- Exige as 11 abas e seus campos estruturais. Chaves duplicadas/órfãs e SKUs ausentes impedem importação ambígua; dados essenciais faltantes geram revisão. Valores originais normalizados, nome, hash SHA-256, cabeçalhos e avisos ficam no banco.
- Processa o catálogo completo cruzado com todos os canais encontrados em preços/custos, sem lista fixa de SKUs. Combinações sem preço/custo aparecem para revisão.
- A referência inicial é a maior data em `Precos_Atuais`: **09/09/2026** na planilha fornecida. Dashboard → Configurações permite alterá-la, com auditoria. A atualização por upload valida toda a nova base antes de persistir.
- Coletas são avaliadas até 23:59:59 da referência, no fuso `America/Sao_Paulo`. A planilha não informa hora de referência; a escolha do fim do dia é explícita e conservadora para envelhecimento das coletas.
- Vendas mensais usam o fim do último mês fechado com quantidade positiva apenas como **estimativa**. Não se inventa a data exata. Sem data diária confiável ou ajuste manual auditado, a exceção de margem não é habilitada. Ajustes ficam no detalhe por SKU/canal.
- Concorrência sem canal é um sinal compartilhado entre canais. Apenas disponíveis, com correspondência válida (inclusive `EAN exato`), matching alto/médio e coleta recente entram na mediana. Há um voto por concorrente, pela última coleta válida; descartes permanecem visíveis.
- Frete concorrencial fica separado por padrão. Há configuração explícita para considerar o frete integral como custo de um item; use apenas quando esse rateio fizer sentido.

## Cálculo e regras

Toda a matemática usa `Decimal` a partir dos valores normalizados:

```text
margem = (preço × (1 - taxa_canal) - custo_total_referência) / preço
preço mínimo = custo_total_referência / (1 - taxa_canal - margem mínima)
preço alvo = custo_total_referência / (1 - taxa_canal - margem alvo)
candidato = peso_mercado × mediana + (1 - peso_mercado) × preço alvo
```

O custo total é conferido contra reposição + impostos monetários + frete rateado. A taxa de canal é percentual sobre o preço. Denominadores nulos/negativos e custos inconsistentes bloqueiam o caso.

O preço final é limitado ao intervalo factível entre o piso e os limites de variação. Piso e limite de redução arredondam para cima ao centavo; teto de aumento arredonda para baixo. O candidato usa arredondamento comercial (`ROUND_HALF_UP`). Se o piso superar o teto, não existe preço sugerido aplicável: **REVISAR** com bloqueio. Não se viola uma regra para satisfazer outra. A neutralidade padrão é 0,5%; `MANTER` preserva o preço atual quando ele respeita o piso.

Parâmetros ficam em `Settings`, são alteráveis no dashboard e ficam em cada execução. As proteções obrigatórias da base limitam configurações mais permissivas. Riscos são Alto/Médio/Baixo por bloqueios, alertas e necessidade de aprovação. A prioridade soma pesos configuráveis e é limitada a 100: por padrão, base 20, margem abaixo do piso +35, excesso com queda +25, curva A +15 e risco alto +10. É uma ordenação transparente para triagem, sem previsão de lucro ou elasticidade.

Precedência:

1. Exclusão vigente por SKU.
2. Bloqueios obrigatórios de segurança.
3. Regra de SKU.
4. Categoria, marca ou canal.
5. Curva ABC.
6. Global.
7. Base original.

Dentro do nível, **maior prioridade numérica** vence para alvo e exceção. Todos os pisos normais aplicáveis são combinados pelo máximo, e limites de variação pelo mínimo. Mesma precedência/prioridade com alvos ou política de exceção incompatíveis produz conflito bloqueante. Sobreposição resolvível é registrada; a regra prevalente e o critério ficam no snapshot.

A exceção menor só usa a regra prevalente, vigente e explicitamente habilitada, com dias sem venda comprovados, autorização de ficar abaixo da margem original quando necessário e aprovação humana obrigatória. Seu motivo e evidência ficam na auditoria. **Não há aplicação autônoma abaixo da margem original.**

### Regras iniciais executáveis

| ID | Verificação |
| --- | --- |
| R01 | Piso da margem mínima, salvo exceção explícita e aprovação |
| R02 | Máximo de 5% por decisão, ou limite menor configurado |
| R03 | Curva A acima de 3%, ou limite menor: aprovação |
| R04 | Estratégico: aprovação; status da base e lista configurada |
| R05 | Concorrente indisponível é descartado |
| R06 | Coleta acima de 48h, ou validade menor: descartar e revisar |
| R07 | Sugestão versus preço atual do outro canal acima de 5%: aprovação |
| R08 | Nenhum canal do SKU pode aplicar nova alteração em menos de 3 dias |
| R09 | Promoção ativa ou incompleta: revisar e exigir aprovação |
| R10 | Coletas comparáveis do mesmo concorrente com variação >20% em até 24h: revisar |
| R11 | Redução com cobertura <15 dias: maior risco e aprovação |
| R12 | Cobertura >90 dias e três quedas mensais consecutivas (quatro meses): priorizar |

R01–R12 são mapeamentos implementados, não execução livre do texto da planilha. IDs novos sem implementação geram bloqueio para revisão. A lista original é mostrada integralmente na tela de regras.

## Uso das telas

### Dashboard e recomendações

Dashboard mostra cobertura, ações, margens e riscos. A média projetada inclui apenas casos com preço matematicamente viável; seu denominador é informado. Recomendações permite filtrar por SKU/nome, categoria, marca, curva, canal, ação, risco, status e regra. O CSV exporta somente o filtro, em UTF-8 para Excel, com proteção contra fórmulas em campos de texto.

Selecione uma ou várias linhas para restringir o seletor de decisão. Cada decisão é individual e registra responsável, original, preço aprovado, justificativa e regras. Editar/rejeitar/revisar exige justificativa; aprovar casos com riscos também. A aprovação não remove bloqueios de segurança. Mudanças nos dados, regras, exclusões ou configurações exigem análise atualizada.

### Cadastrar regras

1. Abra **Regras** e escolha Criar, Editar ou Duplicar.
2. Escolha o escopo e um ou vários valores. Todos os valores vêm da base.
3. Configure nome, descrição, prioridade, margens, limites, vigência e aprovação.
4. Para o exemplo do desafio, selecione Curva ABC → A, mínima **25%**, alvo ≥25%, exceção habilitada, **60 dias**, margem excepcional **15%**, autorização abaixo da base e aprovação humana. Os números são campos editáveis; não são constantes do motor.
5. Informe justificativa e clique **Simular impacto antes de salvar**. Confira SKUs, canais, antes/depois, sobreposições, bloqueios e novos casos com aprovação. Regras futuras são simuladas a partir do início da vigência.
6. Salve os valores simulados. Alterações posteriores requerem nova simulação. Regras têm inativação, sem exclusão física.

### Excluir SKUs

Abra **Exclusões**, busque código/nome, selecione um ou vários SKUs, motivo e vigência. O fim pode ficar vazio. Todos os canais do SKU ficam `EXCLUÍDO`, sem sugestão. Agendamentos que caiam na exclusão são cancelados com auditoria. Encerre a exclusão para reativar. Use “Mostrar excluídos” nas recomendações para consultar esses registros.

### Agendar preços

1. Informe o responsável na barra lateral e aprove uma recomendação viável.
2. Abra **Agendamentos**, selecione a recomendação, preço, data/hora futura, validade e justificativa.
3. Se editar o preço, marque a aprovação explícita; a edição ganha sua própria decisão auditada.
4. Valide para visualizar margem e alertas. Ao salvar, o serviço confere aprovação, exclusão futura, regra vigente, margem, promoção, variação, frequência, validade e conflito SKU/canal. Não sobrescreve agendamentos.
5. Em Administração local, **Executar agendamentos vencidos no protótipo** revalida os dados e registra o preço local. Execuções repetidas não duplicam aplicações. Regras/dados alterados ou riscos diferentes (por exemplo, início de uma promoção entre a data programada e uma execução atrasada) fazem o agendamento falhar e exigir nova decisão. O intervalo entre aplicações locais usa horas exatas, com mínimo de 72 horas.

**Datas históricas:** a referência inicial é setembro de 2026, independentemente do relógio. Para demonstrar agendamento futuro no dia real da apresentação, ajuste a referência para esse dia, analise novamente e justifique concorrência antiga na aprovação. O agendamento deve terminar dentro da validade da recomendação e da regra. Não se adultera a data da coleta.

Função de execução pronta para cron/Agendador de Tarefas, sem daemon embutido:

```powershell
python -m src.scheduler_service
```

O relógio administrativo usa `America/Sao_Paulo`. Os testes usam relógio injetado; a interface usa hora real. `apply_price_locally` é a fronteira isolada para futura integração com ERP.

## Arquitetura

```text
Pet_Pricing/
├── app.py                       # entrada do dashboard
├── requirements.txt
├── .env.example
├── .streamlit/config.toml       # identidade escura com verde
├── data/pet_pricing.db          # criado localmente, ignorado pelo Git
├── pages/                      # seis páginas Streamlit
├── src/
│   ├── data_loader.py           # Excel, normalização e validações
│   ├── database.py              # SQLite, transações, parâmetros e schema
│   ├── models.py                # configurações e contratos
│   ├── signals.py               # concorrência, vendas, estoque, promoção
│   ├── rule_engine.py           # escopo, vigência, precedência, exceção
│   ├── pricing_engine.py        # matemática e risco determinísticos
│   ├── recommendation_service.py# importação, simulação, regras e decisões
│   ├── scheduler_service.py     # validação e execução local idempotente
│   ├── ai_explainer.py          # JSON estruturado e contingência
│   ├── audit_service.py         # consulta da linha do tempo
│   ├── ui.py                    # componentes e tratamento de erros
│   ├── ui_pages.py              # apresentação e formulários
│   └── utils.py                 # Decimal, datas e serialização
└── tests/                      # unidade, integração e páginas reais
```

SQLite persiste todas as tabelas solicitadas, mais importações versionadas, execuções, configurações, ajustes de última venda e histórico local. Decisões preservam o snapshot original. Transações `BEGIN IMMEDIATE`, chaves estrangeiras e índice único de agendamento pendente evitam sobrescrita concorrente. Valores de SQL são parametrizados; identificadores internos usam listas permitidas. Não há `DELETE` no fluxo da aplicação.

## Testes

```powershell
python -m pytest -q
```

A suíte usa cópias normalizadas da base e bancos temporários, nunca altera a planilha original nem o banco de demonstração. Cobre os 22 cenários pedidos, casos adicionais de expiração/revalidação/idempotência, tratamento de dados ausentes e inicialização das sete telas com `AppTest`. O cadastro real de regra com 25%/60 dias/15% é exercitado na interface. A API externa é substituída por fallback/mock; chamadas pagas não fazem parte da suíte.

Para iniciar o servidor sem abrir navegador:

```powershell
python -m streamlit run app.py --server.headless true
```

Validação realizada no ambiente de entrega (Python 3.13.5, Streamlit 1.45.1): **75 testes aprovados**, incluindo os sete pontos de entrada e os fluxos de regras, exclusão, aprovação e agendamento; servidor iniciado e `/_stcore/health` respondendo HTTP 200. A inspeção por navegador não estava disponível nesta sessão; a verificação das telas usa o framework oficial AppTest. Nenhuma chamada real à API de IA foi feita. O SHA-256 do Excel permaneceu `5a5819d4e25afe04c8cb952852f574001bd6fd713063a9b6f07ca3b2205f03d7`.

## Limitações e próximos passos

- Protótipo local, sem autenticação ou segregação real de papéis. O responsável é autodeclarado. Não exponha o servidor como sistema corporativo multiusuário sem controle de acesso.
- IA explica; o analista confere seu texto. Não há previsão validada de elasticidade, receita ou lucro incremental.
- A base é mensal. Exceções exigem evidência diária ou declaração manual auditada. Dados de estoque sem data própria usam a referência da importação, sem fingir atualização em tempo real.
- A base não tem flag estratégica dedicada nem série suficiente por concorrente para comprovar R10 em todos os SKUs. Essas limitações são visíveis; a lista estratégica é configurável e a ausência de histórico não é interpretada como prova de estabilidade.
- No resultado inicial da planilha fornecida, vários pisos não cabem em uma alteração de 5%. O bloqueio é deliberado, não uma falha de cálculo. Nem toda base precisa gerar as quatro ações ao mesmo tempo.
- Promoções e concorrência antiga pedem revisão e aprovação justificada. Conflitos matemáticos, exclusões e alterações recentes continuam bloqueados mesmo com aprovação.
- Aplicações futuras são simuladas apenas no SQLite. Cancelamento não reverte preço já aplicado; nova alteração precisa de nova recomendação, aprovação e intervalo permitido.
- Alterações diretas no arquivo SQLite ficam fora da trilha controlada. Para produção, usar banco central, autenticação, migrações versionadas, retenção, backups e auditoria externa imutável.
- Integrações futuras: APIs de ERP para custos/estoque e envio aprovado de preço, webhooks de vendas diárias, catálogo e matching concorrencial, conectores de e-commerce/marketplace, fila de execução com retentativas, reconciliação e monitoramento. Preservar a fronteira de aprovação e idempotência.
