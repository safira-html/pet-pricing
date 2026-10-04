# Revisão crítica — Pet Pricing V1 → V2

Data: 04/10/2026
Redação: IA, para a Safira revisar junto com o front.
Base: auditoria de 04/10 (`[04] outputs/2026-10-04_auditoria-prototipo-v1.md`), decks das Semanas 1 e 2, código do Allan e enunciado do Desafio 04.

Cada item segue o mesmo formato: o que foi feito, a avaliação, a evidência e o que a V2 faz.

## 1. Fórmula de margem — errado entre as entregas

- **Feito:** o deck da Semana 2 calcula margem sobre a reposição; o código usa margem de contribuição.
- **Avaliação:** as duas entregas se contradizem, e a banca pode notar.
- **Evidência:** as 4 margens do slide 6 só se reproduzem com `1 − reposição/preço`. Com contribuição, os 120 preços estão abaixo da mínima.
- **V2:** a tela Regras e margem mostra as duas fórmulas lado a lado e marca a escolha como pendente com o mentor. O motor segue em contribuição.

## 2. Preço mínimo × limite de 5% — fraco

- **Feito:** 80 itens ficam em REVISAR sem preço sugerido.
- **Avaliação:** a demo parece não responder ao desafio.
- **Evidência:** `src/pricing_engine.py:33-34`. E-commerce precisa de +6% a +7%; marketplace, de +15% a +16%.
- **V2:** proposta de rampa de reajuste em etapas de até 5%, com aprovação. Grupo próprio na fila.

## 3. Métricas da Semana 2 — incompleto

- **Feito:** metas de 18 h → 6 h, 67% → 80% e outras, todas sobre linha de base fictícia, nenhuma medida pelo app.
- **V2:** a visão geral mede de verdade, na sessão: faixa competitiva antes e depois, margem média, itens abaixo do preço mínimo, aceitação e tempo por decisão.

## 4. Papel da IA — fraco

- **Feito:** a IA é opcional, vem desligada e só reescreve a justificativa.
- **V2:** três camadas com papéis testáveis. Regras decidem o preço; um modelo local de classificação (Laya) agrupa motivos e faz a dupla checagem do piloto automático; um LLM local redige a explicação. Tudo gratuito e local. Entra no backend.

## 5. Retroalimentação — inexistente na prática

- **Feito:** decisões só ficam guardadas.
- **V2:** tela Aprendizado com aceitação por regra, motivos mais usados e linha do tempo. Regras muito rejeitadas aparecem primeiro.

## 6. Recorte — ok, mas sem trilha de demo

- **Feito:** 120 itens, sem um caminho guiado.
- **V2:** roteiro de 6 passos para a banca e cenários sintéticos que mostram as quatro recomendações. Os 9 produtos alterados ficam marcados.

## 7. Evidência real — ausente

- **Feito:** nenhuma entrevista, nenhum processo real; tudo vem da base fictícia.
- **V2:** declarado como limitação. Recomendação: uma conversa curta com alguém de pricing antes do Demo Day.

## 8. Canais — parcial

- **Feito:** o mesmo preço de mercado nos três canais; a R07 ignora o marketplace.
- **V2:** declarado na tela de regras. A correção depende do Allan.

## 9. Regras inativas ou parciais

| Regra | Situação |
|---|---|
| R03 | Pede aprovação, mas não manda para revisão |
| R04 | Nenhum produto marcado como estratégico |
| R10 | Uma coleta por concorrente; o alerta aparecia em 120 de 120 |

- **V2:** a R10 virou alerta informativo (cinza), sem pedir aprovação. As outras aparecem com status honesto na tela de regras.

## 10. Aprovação em 120 de 120 — esvazia o sinal

- **V2:** o alerta informativo é separado do que pede aprovação. Com isso, aparecem 19 itens de aprovação rápida nos cenários sintéticos. Na base oficial são 0, porque toda a loja física tem a R07.

## 11. Segurança — sem autenticação

- **V2:** perfis de analista, gestor e visitante, com permissões diferentes, e cada visitante numa cópia isolada. Login corporativo fica como caminho de produção.

## 12. Colunas obrigatórias

- **Feito:** `Estoque` e `Justificativa` não apareciam na tabela.
- **V2:** cada linha da fila mostra margem frente à mínima, posição no mercado, dias de estoque, recomendação, preço sugerido, justificativa e risco.

## Interface (antes × depois)

| V1 (Streamlit) | V2 |
|---|---|
| Aprovar exigia 3 telas | Decisão em um clique, ou com motivo em um toque; vai sozinho ao próximo item |
| Códigos R06, R10 na tela | Frases em português e nomes das regras |
| Tabela de 12 colunas iguais | Lista agrupada por tipo de trabalho, com hierarquia visual |
| Sem explicação visual | Mapa de preço com uma linha por referência e uma frase que responde o que fazer |
| Sem desfazer | Aviso com Desfazer depois de cada decisão |
| Sem identidade | Design system da Popular Pet, versão institucional |

## O que ainda falta (Etapa 3, depois da sua aprovação)

- API FastAPI com o motor do Allan e sessões isoladas.
- Rampa, piloto automático e separação de alertas no backend, como propostas configuráveis para o Allan.
- Camada de IA local: Laya e LLM.
- Testes automatizados.
- Publicação gratuita: Vercel + Hugging Face, com aviso de protótipo acadêmico.
