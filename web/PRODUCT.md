# Product

## Register

product

## Users

O usuário principal é a pessoa de pricing da Popular Pet, varejo pet com loja física, e-commerce e marketplace:

- **Analista de pricing:** decide as recomendações.
- **Gestor comercial:** define regras, a fórmula de margem e o piloto automático.

Os dois usam a ferramenta durante o expediente, numa tela de desktop, decidindo dezenas de preços por sessão. A banca do Demo Day do ITA Challenge Sprint vê o produto funcionando, mas não é o público que guia o desenho.

O trabalho a ser feito é decidir, para cada produto em cada canal, se o preço deve subir, baixar, manter ou passar por revisão, entendendo o porquê. Depois, acompanhar se a decisão funcionou.

## Product Purpose

O Pet Pricing é um copiloto de precificação. O fluxo é:

1. Cruza concorrência, custo, margem, vendas e estoque.
2. Recomenda uma ação e um preço, com justificativa e as regras que protegem a operação.
3. Deixa uma pessoa aprovar em poucos cliques, ou o piloto automático agir dentro de proteções definidas pelo gestor.
4. Mede o impacto e aprende com o resultado.

Sucesso é o analista decidir mais rápido, com confiança no número e com rastreabilidade de cada decisão.

É um protótipo acadêmico, não um sistema oficial da Popular Pet.

## Brand Personality

Confiável, clara, ágil. Tom institucional e corporativo da Popular Pet, sem enfeite: o número e a decisão vêm primeiro. A identidade aparece no roxo e no verde-limão da marca, usados com parcimônia, nunca como decoração.

## Anti-references

- O protótipo V1 em Streamlit: tabelas cruas, tudo com o mesmo peso visual, rolagem horizontal, sem hierarquia.
- Dashboards SaaS genéricos: grade de cartões idênticos com número grande, degradês e ícones decorativos.
- Interfaces em que a cor é o único sinal de significado.

## Design Principles

- **A decisão em primeiro lugar.** Cada tela responde "o que faço agora?" antes de "o que aconteceu?".
- **Mostrar o porquê.** Todo preço sugerido vem com os fatos que o justificam, em linguagem de operação.
- **Velocidade com controle.** Aprovar em um clique quando nenhuma regra pede motivo; pedir motivo e confirmação quando há risco ou apagamento.
- **Rastreável por padrão.** Toda decisão, automática ou humana, tem autor, horário e motivo visíveis.
- **Honestidade sobre o que é simulado.** Dados sintéticos, simulações e integrações "a conectar" ficam sinalizados.

## Accessibility & Inclusion

- WCAG 2.2 AA: contraste de 4,5:1 em texto e 3:1 em bordas de controles, foco visível e áreas de toque de 44 px.
- Significado nunca só pela cor; movimento reduzido respeitado.
- O "Guia de boas práticas aplicáveis para a criação de interfaces" (Andrey Knabbenn, v2.0), que está no cofre da Safira, vale como referência complementar.
