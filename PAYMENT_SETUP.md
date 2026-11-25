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

## Carteira digital

Após um webhook validado e confirmado, o sistema registra uma entrada do tipo `sale` na carteira da loja. A referência `payment:<payment-id>` impede crédito duplicado quando o provedor reenvia o mesmo evento. O saldo considera somente movimentações `completed`.

## Migração obrigatória

Antes de publicar esta versão, aplique `migrations/0002_wallet_idempotency.sql` ao banco D1 de produção e confira se a tabela `wallet_transactions` não contém referências duplicadas. O índice também está incluído em `schema.sql` para novas instalações.

## Checklist de sandbox antes de produção

1. Configure todos os secrets no ambiente de preview/teste, sem reutilizar tokens reais.
2. Conecte primeiro uma conta de teste do Mercado Pago ou o ambiente sandbox do Asaas.
3. Gere um pedido de teste e uma cobrança Pix de baixo valor ou simulada pelo provedor.
4. Envie um webhook inválido e confirme que recebe 401 e não altera pedido nem carteira.
5. Confirme um pagamento de teste e verifique um único crédito na carteira.
6. Reenvie o mesmo webhook e confirme que o saldo não duplica.
7. Confira se a key é enviada por DM e se o pedido passa para entregue.
8. Teste usuário com DMs bloqueadas; a entrega precisa ser tratada manualmente antes de produção.
9. Não habilite produção até concluir todos os passos e revisar os logs.
