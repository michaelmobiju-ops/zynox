# Release gate — expansão ZYNOX
Status: não publicar. CI não substitui homologação funcional.
- Shield integrado; validar gerenciamento de sessões e proteção do login. 2FA fora do escopo por decisão do responsável pelo projeto.
- Concluir interfaces e permissões de todos os módulos; validar checkout, entrega e concorrência.
- Homologar migrações D1 em ambiente separado, backup e restauração.
- Testar Discord real, Pix manual com confirmação efetiva, isolamento entre lojas, limites e LGPD.
- Validar PWA em Android e iOS; não armazenar respostas privadas em cache.
- Somente após todos os critérios: revisar PR, aplicar migrações autorizadas e verificar implantação Cloudflare.
