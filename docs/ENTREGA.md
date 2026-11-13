# Relatório de entrega · EntregaLá Fase 1

> Histórico preservado. A implementação posterior está documentada em [FASE2.md](FASE2.md); a exceção de reordenação de rotas liberadas pertence exclusivamente à Fase 2.

Data: 11/11/2026. Escopo: administrativo completo da Fase 1 e consulta do motorista. A execução dos SQLs no Supabase será feita manualmente pelo proprietário, conforme solicitado.

## Implementação

Foi criada uma aplicação Angular standalone com frontend e API Node.js preparados para Vercel. O projeto inicial continha somente `.env` e `Info.txt`; ambos foram preservados. Não havia repositório Git. Não houve push ou publicação.

| Módulo           | Entrega                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Autenticação     | E-mail/senha Supabase, persistência pelo SDK, logout, recuperação, nova senha, guard e redirecionamento por perfil                   |
| Visão geral      | Indicadores consultados no banco, rotas do dia, ações rápidas, skeleton e erro recuperável                                           |
| Estabelecimentos | Cadastro, detalhes, edição, pesquisa, filtros, paginação e desativação; endereço e coordenadas opcionais                             |
| Produtos         | Catálogo reutilizável, unidade padrão, pesquisa, edição e desativação                                                                |
| Pedidos          | Vários itens, autocomplete, produto avulso, quantidades fracionárias, preços opcionais, subtotal/total, edição e salvar outro        |
| Planejamento     | Distribuição de pedidos, cadastro dentro da rota, motorista/data, resumo de produtos, arraste/setas, rascunho e liberação confirmada |
| Motoristas       | Provisionamento administrativo no servidor, consulta de cadastro/rotas e bloqueio de acesso                                          |
| Painel motorista | Experiência mobile própria, rotas liberadas, paradas ordenadas e detalhes de endereço/recebimento/produtos somente consulta          |
| Conta            | Consulta do perfil e atualização de senha                                                                                            |
| Identidade       | Marca própria, SVG logístico isométrico, verde-petróleo, sombras suaves e estados táteis                                             |

Os módulos estão em `src/app/features/`; o núcleo de autenticação e dados está em `src/app/core/`. A API está em `api/` e `server/`. Os contratos e cálculos compartilhados estão em `shared/`. Marca, ilustração e estilos estão em `public/` e `src/styles.scss`. Scripts, configurações Angular/TypeScript/Vercel, testes e documentação também foram criados. Consulte o README para a árvore completa.

## Decisões de arquitetura e segurança

- Single company, sem camadas de cobrança, mapas ou funcionalidades posteriores.
- Interface consulta o Supabase com chave pública e RLS. Somente criação de usuários usa chave secreta no servidor.
- Papel e status vêm da tabela protegida `profiles`; metadados do usuário não são autoridade.
- RLS em oito tabelas públicas e negação anônima. Motoristas leem somente dados vinculados a rotas liberadas de sua conta. Perfil inativo não obtém dados mesmo com token anterior.
- Pedidos/itens e rotas/paradas são persistidos em transações. Totais usam `numeric`, gerados/recalculados no banco. A prévia usa inteiros para corresponder ao arredondamento decimal.
- Atribuição única de pedido, ordem de parada única, relações com `RESTRICT`, locks e controle otimista por `updated_at`.
- Funções privilegiadas não expostas no schema `private`, com `search_path` fixo, autorizações explícitas e wrappers públicos sem execução anônima.
- API verifica token via Auth, perfil, payload estrito, origem, tamanho e limites persistentes de provisionamento. Não retorna mensagens internas do banco.
- Auditoria registra alterações críticas com ator/horário e valores selecionados. Sem senhas, e-mails, endereços ou notas livres.
- A recuperação do Auth não dispara chamadas SDK bloqueantes dentro do callback de sessão. Consultas simultâneas do perfil compartilham a mesma promessa para evitar falhas intermitentes após login.
- CSP e cabeçalhos de segurança em `vercel.json`; arquivos reais de ambiente excluídos do Git e do pacote Vercel.

## Validação executada

| Verificação             | Resultado                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| `npm run build`         | Aprovado; Angular compilado para produção, sem avisos Angular                 |
| `npm run typecheck`     | Aprovado; API, contratos, scripts e testes sem erros TypeScript               |
| `npm test`              | 26 verificações aprovadas                                                     |
| `npm run test:e2e`      | 12 cenários aprovados em Chromium: desktop, celular vertical e paisagem       |
| `npm audit`             | 0 vulnerabilidades reportadas                                                 |
| `npm run verify:remote` | Aprovado na conferência final: oito tabelas presentes; leitura anônima negada |

Os testes PostgreSQL usam PGlite isolado e reproduzem os papéis e o schema mínimo do Auth. Incluem execução dos SQLs manuais de administrador/conferência, isolamento entre motoristas A/B, anônimo bloqueado, proibição de alteração de perfil, conta inativa, IDs manipulados, escrita administrativa, valores negativos, arredondamento, histórico, edição obsoleta, rollback, atribuição duplicada, reordenação, liberação, auditoria e rate limit persistente.

Os testes HTTP executam a API real com um serviço de autenticação isolado: verificam 401/403, validação estrita, origem, tamanho, tipo de conteúdo e erros sanitizados. Os testes de navegador usam interceptação explícita das respostas Supabase/API, restrita aos arquivos de teste. Exercitam login, recuperação, formulários, cadastro rápido, planejamento, confirmação, detalhes de consulta e redirecionamentos. Conferem ausência de overflow horizontal e geram capturas.

**Limite de evidência:** os testes isolados não são uma homologação do ambiente Supabase remoto. Não foram criadas contas ou inseridos registros de demonstração no projeto real. Não foi testado o recebimento efetivo dos e-mails de recuperação. A compatibilidade real em Safari/iPhone e Android físico permanece para homologação em dispositivos.

As capturas ficam em `test-results/`, com relatório em `playwright-report/`. A interface foi inspecionada visualmente usando essas capturas; os nomes e valores nelas são fixtures de teste.

## SQLs a executar agora

1. [Estrutura completa, RLS e funções](../supabase/migrations/20261111133155_phase1_core.sql): arquivo da instalação inicial. Na conferência final, as tabelas já estavam presentes; não reexecute a criação neste projeto.
2. Crie e confirme o primeiro usuário em Authentication → Users. Depois ajuste e execute [Primeiro administrador](../supabase/setup/02_primeiro_administrador.sql).
3. Execute [Conferir instalação](../supabase/setup/03_conferir_instalacao.sql).

As instruções detalhadas estão em [supabase/setup/LEIA-ME.md](../supabase/setup/LEIA-ME.md). A migration foi validada no PostgreSQL isolado; sua execução remota foi reservada ao usuário. As tabelas e o bloqueio anônimo foram confirmados remotamente ao final. O perfil de administrador ativo ainda não estava provisionado.

## Configuração externa pendente

- Provisionar o administrador com o SQL 02 e conferir com o SQL 03. As tabelas já foram detectadas; não repetir o SQL 01.
- Desativar cadastro público/login anônimo, configurar URLs permitidas e SMTP do Supabase.
- Após a instalação, executar `npm run verify:remote` e homologar o fluxo com administrador e dois motoristas reais em ambiente de teste.
- Para publicação futura, configurar as variáveis na Vercel e ajustar `APP_ORIGIN`/redirects ao domínio. Produção não foi publicada.

## Executar localmente

```powershell
npm ci
npm run dev
```

Abra **http://localhost:4200**. A API é executada em `127.0.0.1:3001`, acessada pelo proxy Angular. O `.env` atual já contém ID do projeto, chave pública e chave secreta; nenhuma chave privada é enviada ao Angular.

## Limitações e Fase 2

Os seletores de clientes/produtos e o planejamento têm limites explícitos adequados à escala inicial, documentados no README. Rotas liberadas e seus pedidos ficam somente para consulta nesta fase. Não existe operação offline completa, mapa, GPS, checklist, confirmação de entrega, relatório avançado, WhatsApp ou faturamento.

Coordenadas do estabelecimento, pedidos separados de rotas e sequência em `route_stops.position` permitem adicionar Geoapify/MapLibre e métricas de distância/tempo por migrations e serviços novos, preservando o núcleo da Fase 1. A política de permissões poderá ser ampliada para ações específicas do motorista nas fases seguintes.
