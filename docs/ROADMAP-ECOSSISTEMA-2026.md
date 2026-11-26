# ZYNOX — auditoria inicial e plano de execução

Data: 2026-11-26. Fonte: arquivos atuais da branch main. Este documento não certifica prontidão para produção.

## Arquitetura preservada
- Cloudflare Workers (src/index.js), assets estáticos em public/, D1, GitHub Actions e testes Node/Python.
- Autenticação Discord para assinantes, acesso administrativo por senha, sessões e licenças; privilégios do dono são separados.
- Integrações Discord HTTP, produtos, variações, estoque criptografado, carrinhos, pedidos, cupons, tickets, provedores de pagamento e relatórios parciais.
- Carteira digital permanece **EM BREVE**; não ativar saldo, saque ou intermediação financeira sem aprovação.
- Planos e preços existentes são provisórios: não inventar valores ou ativar cobrança comercial.

## Situação verificada no código
| Módulo | Situação | Lacunas antes de produção |
|---|---|---|
| Bot | Comandos HTTP, vinculação de servidores, publicação de produtos, apelido por servidor; protótipo de token próprio | Interactions endpoint atende apenas a aplicação ZYNOX; bots próprios ainda não podem receber vendas/interações por esse endpoint. Migração 0005 não aplicada/confirmada. |
| Vendas | Produtos, estoque, pedidos, checkout parcial e histórico | Cupons não aplicados integralmente no checkout, abandono, afiliados, combos, reembolsos, idempotência ponta a ponta, notificações e testes E2E |
| Pay | Integrações parciais, Pix Asaas Sandbox condicionado a flag e webhook | Exigir credenciais do vendedor, webhook e ambiente de teste; validar concorrência, reconciliação, reembolso e autorização antes de produção |
| Analytics | Consultas de pedidos, clientes, receita e relatórios básicos | Filtros, períodos, métricas confiáveis, custos, conversão e exportações |
| AI | Sem integração real confirmada | Escolher provedor, secret, consentimento de custos, rate limit, histórico e testes |
| Studio | Não implementado | Editor e publicação com checagem de canal/permissão |
| Flow | Automações informativas, sem engine completa | Gatilhos, fila, idempotência, execução, logs, limites |
| Shield | Sessões, login rate limit, audit_logs parcial | 2FA, revogação de sessão, controles por IP/usuário, auditoria completa |
| Marketplace | Não implementado | Catálogo, instalação, curadoria, permissões e armazenamento |
| UX | Dashboard e navegação responsiva parciais | Navegação inferior mobile, PWA, privacidade, busca, acessibilidade |
| DONO | Controle de usuários, licenças e administradores parcial | Feature flags, anúncios, limites, manutenção, backups testados |

## Bloqueadores e riscos prioritários
1. **Bot próprio**: a rota /discord/interactions verifica uma chave pública fixa e exige o client_id da ZYNOX. Não apontar outras aplicações para ela até implementar roteamento por application_id, verificação Ed25519 com chave por aplicação, isolamento por loja e testes contra impersonação.
2. **Migrações**: aplicar em D1 somente após backup e confirmação de versão; executar em ordem e testar rollback lógico. Não executar automaticamente a migração 0005 no banco de produção sem inspeção.
3. **Pagamentos**: nunca considerar pagamento aprovado a partir de payload não verificado; segredos só no Worker. Sem credenciais/sandbox do provedor não há teste de ponta a ponta.
4. **Operação**: um Worker HTTP não equivale a conexão Gateway permanente. Eventos de novo membro exigem arquitetura compatível com eventos do Discord; não prometer gatilho funcional sem infraestrutura.
5. **Privacidade**: tokens de bots são extremamente sensíveis; não exibir, logar nem enviar a terceiros. Revisar criptografia, revogação, limites e gestão de segredos antes de oferecer essa conexão a assinantes.
6. **Escopo**: não liberar módulos como operacionais apenas por terem interface.

## Etapas e critérios de aceite
1. Inventário e auditoria (este documento): identificar rotas, tabelas, migrações e cobertura de testes.
2. Segurança e D1: isolamento multi-tenant, migrations versionadas, sessão, token vault, idempotência, rate limits e backups.
3. Visual/responsividade: identidade ZYNOX NEON, Space Grotesk/Inter com fallback, contraste, navegação mobile.
4. Vendas: fluxo de pedido/estoque/cupom/afiliado, reembolso, notificações, testes de concorrência.
5. Bot: roteamento seguro de bot próprio, eventos, canais, cargos, entregas, logs.
6. Studio: editor, projetos, preview, validação Discord e envio autorizado.
7. Flow: engine idempotente, gatilhos suportados, ações, auditoria, retries.
8. Analytics: consultas reais, métricas definidas, gráficos e CSV/PDF.
9. Pay: sandbox, verificação de webhook, reconciliação, reembolsos, testes.
10. Shield: 2FA, sessões, auditoria, limites e detecção de abuso.
11. AI: provedor real, secret, limites configuráveis, histórico e opt-in.
12. Marketplace: modelos, avaliações, favoritos, moderação e instalação.
13. DONO: controles owner-only, flags, manutenção, anúncios e gestão de módulos.
14. Testes: unitários, integração D1/Discord sandbox, E2E mobile/desktop, segurança e acessibilidade.
15. Publicação: migrações e secrets por ambiente, staging, rollout progressivo e monitoramento.

**Regra de liberação:** cada etapa requer código, migração reversível quando aplicável, testes e verificação do serviço real. Sem dados fictícios apresentados como métricas reais. A plataforma não está pronta para comercialização apenas com esta auditoria.

## Dependências externas a configurar antes das respectivas etapas
- Discord Developer: bots de teste próprios, tokens em secrets e chave pública por aplicação.
- Pagamentos: conta elegível de cada lojista, credenciais sandbox, webhook validado; produção só após homologação.
- IA: provedor/API e autorização de custos; credencial como secret no Cloudflare.
- Notificações agendadas: Cron Triggers/Queues ou mecanismo equivalente, com limites e deduplicação.
- PDF/exportação e armazenamento: avaliar limites do Worker e serviços necessários.
