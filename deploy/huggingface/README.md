---
title: Pet Pricing API
emoji: 🐾
colorFrom: purple
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: API do protótipo Pet Pricing (ITA Challenge)
---

# Pet Pricing · API

Protótipo acadêmico do ITA Challenge Sprint (Grupo 12, Desafio 04). Não é um sistema oficial da Popular Pet.

A API roda o motor de recomendação de preços sobre a base fictícia do desafio. Ela oferece:

- uma sessão isolada por visitante, apagada depois de 24 horas sem uso;
- envio de planilha pelo perfil gestor;
- histórico de eventos encadeado por hash.

A documentação interativa fica em `/api/docs`.

O histórico encadeado detecta alteração ou remoção de eventos no meio da cadeia. Ele não usa chave secreta, então não protege contra quem tem acesso direto ao banco.

O disco do plano gratuito não é persistente: quando o Space reinicia, as sessões são perdidas, e isso é esperado na demo.
