# Configuração de pagamentos ZYNOX

## Secrets obrigatórios no Cloudflare Worker

- `GATEWAY_ENCRYPTION_KEY`: chave aleatória com pelo menos 32 caracteres. Deve ser a mesma usada para criptografar e descriptografar tokens dos gateways.
- `STOCK_ENCRYPTION_KEY`: chave usada para criptografar keys do estoque.
- `DISCORD_BOT_TOKEN`: token do bot que envia a entrega por mensagem privada.
- `MP_WEBHOOK_SECRET`: segredo de assinatura de notificações do Mercado Pago.
- `ASAAS_WEBHOOK_TOKEN`: token secreto configurado no webhook do Asaas.

Nunca coloque esses valores no GitHub, no frontend ou em mensagens do Discord.

## URL pública de webhook

Configure no provedor:

`https://zynox.michael-mobiju.workers.dev/webhooks/payments`

Mercado Pago: habilite notificações de pagamentos e assinatura secreta. O Worker valida a assinatura `x-signature` e consulta a API do Mercado Pago antes de marcar o pedido como pago.

Asaas: configure o token de autenticação do webhook igual ao secret `ASAAS_WEBHOOK_TOKEN`. O Worker consulta a cobrança na API Asaas antes de confirmar o pagamento.

## Fluxo atual

1. O painel cria uma cobrança Pix para pedido pendente.
2. O provedor envia o webhook.
3. O Worker verifica a autenticidade e consulta o pagamento diretamente no provedor.
4. O valor e a referência externa precisam corresponder ao pedido.
5. O pedido é marcado como pago e a key reservada é enviada por DM no Discord.

## Limitações a validar antes de produção

- Executar testes ponta a ponta com credenciais sandbox.
- Confirmar o comportamento de reenvio e expiração das reservas.
- A entrega automática atual exige uma key física reservada; estoque infinito ainda não possui entrega automática.
- Se o Discord bloquear mensagens privadas, a entrega fica pendente para tratamento operacional.
- Não usar pagamentos reais antes dos testes de sandbox e da configuração dos secrets.
