# ZYNOX — expansão profissional: fase 1
Baseline: 408599590d14029ba234da6b981a2f4da357de7c. Auditoria estática, não certificação de produção.

## Inventário
- Worker HTTP e assets: src/index.js, public/, wrangler.toml; D1 schema.sql e migrations.
- Identidade: auth.js, admin-auth.js, owner.js, control.js, licenses.js. OAuth Discord, PBKDF2, cookies seguros, controle administrativo e licenças de assinatura existentes.
- Comércio: commerce.js, cart.js, payment-webhook.js, picpay.js; produtos, variantes, estoque criptografado, reserva, pedidos, cupons, Pix manual e publicação Discord. Não assumir suporte a carrinho multi-item: orders.variant_id representa uma variante.
- Storefront: storefront.js e public/storefront.*; rota pública UUID, catálogo inicial; slug, checkout completo e domínio ainda exigem desenvolvimento.
- Tickets: ticket-panels.js e migrations/0009_ticket_panels.sql; painéis e interações iniciais.
- White Label: custom-bots.js e rota de interações por aplicação; integração completa ainda não homologada.
- CRM/Analytics: customers, orders, overview e relatórios básicos.
- Rewards, licenças de produto separadas, equipes, API pública, migração CSV, sorteios, backup, monitor completo: não confirmados como implementados.
- UI: NEON, navegação mobile, páginas de planos; PWA pendente.
- CI: testes Node e Python; cobertura existente não equivale a E2E. Nenhuma execução retornada para baseline no momento da consulta.

## Ordem e gates
1. Inventário (este documento).
2. Segurança, sessões, isolamento por loja, autorização, migrações.
3. Vendas multi-item e estoque atômico.
4. Storefront.
5. Tickets.
6. Licenças de produtos.
7. White Label.
8. Equipes.
9. CRM.
10. Marketing consentido.
11. Rewards não sacáveis.
12. Pay sem custódia.
13. API e webhooks.
14. Importação/exportação.
15. Sorteios/convites.
16. Backup/restauração.
17. Monitor.
18. Integração.
19. Painel DONO.
20. NEON, responsividade e PWA.
21. Testes completos.
22. Correções e publicação.

## Riscos e dependências
- Duas migrações com prefixo 0005: verificar histórico real D1 antes de novas migrações; não renomear as aplicadas.
- Preservar preços e planos; limites/exclusividades exigem definição pelo DONO e enforcement backend.
- Separar permissões globais de equipes e licenças de assinatura de licenças de produtos.
- Pagamentos: contas elegíveis dos vendedores, credenciais secretas, sandbox, confirmação real; não ativar carteira sacável.
- Discord: permissões oficiais, rate limits, eventos Gateway quando necessários, consentimento.
- IA: provedor e autorização de custos; domínios, armazenamento de arquivos, filas e cron dependem de infraestrutura.
- Antes de publicar: backup D1, teste de migrações, testes de isolamento, concorrência, idempotência e E2E; sem deploy automático de branches de trabalho.
- Nenhum dado de produção consultado ou modificado nesta fase.
