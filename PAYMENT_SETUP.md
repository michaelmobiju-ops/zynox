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

## Saques Pix via Asaas

A carteira agora oferece solicitação de transferência Pix para chave CPF, CNPJ, e-mail, telefone ou EVP. O fluxo exige saldo suficiente tanto no livro-caixa da ZYNOX quanto no saldo disponível da conta Asaas conectada. A transferência é enviada por `POST /v3/transfers` e registrada inicialmente conforme o status retornado pelo Asaas.

Configure o webhook Asaas no mesmo endpoint `/webhooks/payments`, com o token `ASAAS_WEBHOOK_TOKEN`, habilitando eventos de transferência. Os eventos `TRANSFER_DONE`, `TRANSFER_FAILED` e `TRANSFER_CANCELLED` atualizam o lançamento da carteira. Uma transferência criada ou pendente não deve ser apresentada como concluída.

**Importante:** a transferência sai do saldo da conta Asaas vinculada à loja. Isso não é Open Finance nem conexão direta com contas de outros bancos. Mercado Pago ainda não oferece saque automático por este fluxo. Teste no Asaas Sandbox antes de usar produção.

### Proteção contra saque duplicado

Antes de chamar o Asaas, a API reserva o valor como retirada pendente no livro-caixa por uma inserção condicional. Se a chamada falhar de forma inequívoca, a reserva é marcada como falha; se houver timeout ou resposta ambígua, permanece reservada e o painel do Asaas deve ser conferido. O webhook também tenta reconciliar a transferência pela referência externa. Não repita manualmente um saque em análise sem confirmar primeiro o estado no Asaas.
