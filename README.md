# EntregaLá · Fase 3

Conferência de carregamento por estabelecimento/produto, divergências, jornada do motorista, quantidades efetivamente entregues, ocorrências e acompanhamento administrativo com recuperação de sincronização. Consulte [FASE3.md](docs/FASE3.md) para fluxos, segurança, SQL e validação.

**Estado atual:** as estruturas das três fases foram detectadas no Supabase e a leitura anônima foi bloqueada nas tabelas verificadas. As duas chaves Geoapify estão configuradas. Não reexecute migrations de criação já aplicadas. A homologação das novas jornadas e dos eventos Realtime hospedados ainda precisa ser feita com contas reais autorizadas. Nenhum dado de demonstração foi inserido remotamente pelo agente.

Execute `npm run dev` e abra **http://localhost:4200**. No motorista, use **Conferir carregamento**; no administrador, **Operação de entregas**. A migration nova é [phase3_operations](supabase/migrations/20261111160254_phase3_operations.sql); a conferência somente leitura está no [SQL 04](supabase/setup/04_conferir_fase3.sql).

## Histórico da Fase 2

Mapas por motorista, origem confirmada, geocodificação, trajetos pelas ruas e propostas de otimização com aplicação segura. Consulte [a documentação atual da Fase 2](docs/FASE2.md) para configuração, SQL incremental, testes e limites de consumo.

**Configuração da Fase 2 resolvida:** a migration e as duas chaves foram conferidas posteriormente; estilo de mapa e geocodificação responderam HTTP 200. Consulte a documentação específica para os limites da homologação.

Artefatos atuais de testes ficam em `artifacts/`; relatórios anteriores estão arquivados em `artifacts/legacy/`. A estrutura foi organizada por responsabilidade, preservando `.env`, `Info.txt`, funcionalidades e histórico SQL.

## Histórico e instruções da Fase 1

O conteúdo abaixo registra a entrega anterior. As novas permissões de sequência, mapas e consumo estão descritas na documentação da Fase 2.

Gestão de entregas para distribuidoras: estabelecimentos permanentes, cadastro rápido de pedidos, planejamento manual e consulta individual do motorista. Interface em português brasileiro, valores em BRL e datas operacionais em `America/Sao_Paulo`.

## Estado da entrega

O código da Fase 1 está implementado e é verificável localmente. Na conferência final de 11/11/2026, as oito tabelas já estavam presentes no Supabase e a leitura anônima foi negada. **Ainda falta provisionar o primeiro administrador para usar os fluxos reais.** Conforme solicitado, os SQLs são executados manualmente pelo proprietário: siga [supabase/setup/LEIA-ME.md](supabase/setup/LEIA-ME.md), a partir do passo 2 neste projeto. Não reexecute a criação das tabelas. Não existe modo de demonstração ou login fictício na aplicação. Os testes isolados não representam homologação completa no projeto remoto.

O `.env` original e o `Info.txt` foram preservados. A pasta original não era um repositório Git. Nenhum deploy, push, dado demonstrativo remoto ou alteração em outros projetos Supabase foi realizado.

## Tecnologias e decisões

- Angular 22.2, componentes standalone, carregamento de funcionalidades por rota, execução zoneless, TypeScript strict, formulários reativos e SCSS.
- Node.js 24, funções Vercel em `api/`, validação Zod e SDK Supabase.
- Supabase Auth, PostgreSQL, RLS por operação, migrations versionadas e auditoria mínima.
- Identidade própria em SVG, van e caixas com volume, superfícies neomórficas e navegação responsiva. Nenhuma biblioteca 3D pesada.
- Leituras e cadastros de clientes/produtos acessam o Supabase com RLS; operações transacionais de pedidos e rotas usam RPCs verificadas no banco, chamadas pela API. O provisionamento de usuários ocorre exclusivamente no servidor.
- Papel e status ficam em `profiles`, protegidos contra escrita do usuário. Metadados editáveis do Auth não concedem privilégios.
- O banco recalcula subtotal e total. Quantidade usa `numeric(9,3)`, preço `numeric(9,2)` e totais `numeric(16,2)`. Preço ausente é explicitamente considerado zero no total.
- Escritas operacionais usam transação e lock de planejamento compartilhado. A escala inicial é de dezenas de entregas/dia; esse lock simplifica a garantia de integridade. `updated_at` também evita sobrescrever pedidos/rotas abertos em telas antigas.
- Rota liberada e seus pedidos ficam somente para consulta nesta fase. Pedidos continuam independentes da rota. Remover uma parada de rascunho preserva o pedido.
- Não há exclusão comercial na UI: estabelecimentos, produtos e motoristas são desativados. Foreign keys usam `RESTRICT`; itens substituídos durante edição são auditados.

## Estrutura

```text
src/app/core/               Auth, guards, acesso aos dados e feedback
src/app/layout/             Sidebar e estrutura administrativa
src/app/shared/             Ícones, estados vazios, foco e teclado de modais
src/app/features/auth/      Login e recuperação de senha
src/app/features/dashboard/ Indicadores reais e ações rápidas
src/app/features/establishments/
src/app/features/products/
src/app/features/orders/    Listagem e editor rápido de itens
src/app/features/routes/    Distribuição, ordem manual e liberação
src/app/features/drivers/   Provisionamento e bloqueio de contas
src/app/features/driver/    Painel mobile e detalhes somente consulta
src/app/features/account/   Perfil de consulta e alteração de senha
shared/                    Interfaces e validação de contratos
api/                       Entradas serverless Vercel
server/                    Autorização, validação e controle das operações
supabase/migrations/       Schema, constraints, RLS, RPCs e auditoria
scripts/                   Configuração pública, migrations e primeiro admin
tests/                     PostgreSQL isolado, API HTTP e navegador
public/                    Marca e ilustração SVG próprias
```

## Instalação e execução local

Pré-requisitos: Node.js **24.15 ou superior na linha 24**, npm e um projeto Supabase. O `package-lock.json` mantém versões fixadas. Para testar o navegador, instale o Chromium do Playwright.

```powershell
npm ci
# Somente se ainda não existir .env:
Copy-Item .env.example .env
```

Configure o `.env` sem versioná-lo:

| Variável                                      | Uso                                                           |
| --------------------------------------------- | ------------------------------------------------------------- |
| `SUPABASE_URL`                                | URL HTTPS do projeto                                          |
| `SUPABASE_ID`                                 | Alternativa à URL: referência de 20 caracteres                |
| `SUPABASE_PUBLISHABLE_KEY`                    | Chave pública do frontend e autenticação da API               |
| `SUPABASE_PUBLISHABE_KEY`                     | Alias aceito por compatibilidade com o arquivo original       |
| `SUPABASE_SECRET_KEY`                         | Somente servidor, para criar contas                           |
| `SUPABASE_SERVICE_ROLE_KEY`                   | Alternativa legada à chave secreta                            |
| `APP_ORIGIN`                                  | Origem exata da aplicação, localmente `http://localhost:4200` |
| `DATABASE_URL`                                | Somente manutenção, conexão PostgreSQL do projeto             |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | Somente provisionamento inicial controlado                    |

`scripts/config.mjs` exporta exclusivamente URL e chave `sb_publishable_` para o Angular. A leitura compartilhada normaliza a URL do painel para o endpoint do projeto, verifica a referência e escolhe a primeira chave pública válida entre o nome padrão e o alias original; placeholders são ignorados e chaves privadas são recusadas. O arquivo gerado e os `.env` reais são ignorados pelo Git. Nenhuma credencial deve ser colocada em `public/`, em mensagens ou em commits.

```powershell
npm run dev
```

Abra **http://localhost:4200**. O Angular usa proxy `/api` para a API em `127.0.0.1:3001`. Para executar separadamente:

```powershell
# Terminal 1
npm start
# Terminal 2
npm run dev:api
```

## Banco de dados e migrations

**Procedimento escolhido para esta entrega:** execução manual no SQL Editor. Os três arquivos e a ordem de execução estão em [supabase/setup/LEIA-ME.md](supabase/setup/LEIA-ME.md). Não é necessário configurar `DATABASE_URL`. Os comandos de manutenção abaixo são alternativas futuras.

Antes de aplicar, confira que a conexão é do projeto correto e que não existe schema de outro sistema com os mesmos nomes. A migration não apaga ou reseta tabelas existentes; conflitos interrompem a operação.

1. No painel Supabase, abra **Connect** e copie a conexão **Session pooler** com a senha do banco para `DATABASE_URL`. Prefira esse pooler quando não houver conectividade IPv6. O script exige TLS com certificado válido e verifica a referência do projeto contra `SUPABASE_ID`.
2. Execute:

   ```powershell
   npm run db:migrate
   ```

   Cada migration e seu histórico são gravados na mesma transação. O script não exibe a conexão nem a senha. Pode ser executado novamente: versões já aplicadas são ignoradas.

3. Alternativamente, execute **todo** o conteúdo de `supabase/migrations/20261111133155_phase1_core.sql` pelo SQL Editor do projeto. Nesse caso, registre essa execução no histórico de migrations antes de usar a CLI/script posteriormente; não execute a criação das tabelas duas vezes.
4. Não exponha o schema `private` na Data API. `public` deve estar exposto. Os grants mínimos são definidos explicitamente pela migration.
5. Configure Auth: desative cadastro público e login anônimo; mantenha login por e-mail/senha. Não existe página de cadastro público. Mesmo que uma conta Auth externa seja criada, ela não obtém perfil ou privilégios automaticamente.
6. Configure Site URL e Redirect URLs: local `http://localhost:4200/recuperar` e o domínio real de produção com `/recuperar`. Habilite SMTP adequado para recuperação em produção e ajuste os limites nativos de Auth. Use um domínio HTTPS em produção.

Para criar migrations futuras, use `npm run db:new -- nome_da_mudanca`. A CLI está fixada em 3.1.0; consulte `npx supabase --help` e a ajuda do subcomando antes de executar comandos remotos. Não use `db reset` num projeto com dados reais.

### Primeiro administrador

Para o procedimento manual escolhido, crie e confirme o usuário em Authentication → Users e execute [02_primeiro_administrador.sql](supabase/setup/02_primeiro_administrador.sql) após substituir o e-mail e nome indicados. O procedimento CLI abaixo é uma alternativa.

Depois da migration, configure no ambiente local:

```dotenv
ADMIN_EMAIL=seu-email-administrativo
ADMIN_NAME=nome-do-administrador
ADMIN_PASSWORD=uma-senha-forte-com-pelo-menos-12-caracteres
```

Execute `npm run admin:provision`. A chave secreta é usada somente pelo script Node.js. O procedimento recusa provisionamento se já existir um administrador e não altera usuários existentes. Se o perfil não puder ser inserido, compensa removendo exclusivamente o novo usuário Auth recém-criado. Remova `ADMIN_PASSWORD` do ambiente após o sucesso. Nunca distribua esse script ou a chave secreta ao navegador.

### Motoristas

Entre como administrador → **Motoristas → Cadastrar motorista**. Informe nome, e-mail e senha inicial forte. A API valida token com `getUser()`, consulta perfil ativo, exige papel administrativo e aplica limite persistente de **12 tentativas por hora por administrador** no PostgreSQL. Somente então cria o usuário e o perfil fixo `driver`.

Entregue a senha ao motorista por canal seguro. Ele pode alterá-la em Minha conta ou por recuperação de senha. Desativar a conta bloqueia leituras/escritas no banco mesmo com JWT anterior ainda válido; não depende de atualização dos metadados do token.

## Fluxos implementados

1. Login e recuperação real pelo Supabase Auth, sessão gerenciada pelo SDK, logout e guard por perfil.
2. Estabelecimentos com pesquisa, filtro, paginação de 25 registros, detalhes, edição e desativação. Endereço formatado gerado no banco, coordenadas opcionais sem geocodificação.
3. Catálogo de produtos com unidade padrão, pesquisa, edição e desativação. Pedidos aceitam produto avulso e preservam nome/unidade históricos.
4. Pedidos por data, filtro de atribuição, editor com linhas dinâmicas, autocomplete, teclado, quantidades fracionárias, preço opcional e total. Salvar e cadastrar outro mantém data/contexto da rota.
5. Planejamento por dia: criar rascunho, distribuir pedidos livres, trocar motorista, remover atribuição, ordenar por arraste ou setas acessíveis, consultar resumo de produtos e liberar com confirmação.
6. Cadastro de pedido dentro de uma rota salva em rascunho: pedido, itens e atribuição são persistidos atomicamente.
7. Painel mobile do motorista com data, rotas liberadas, paradas ordenadas, endereços, recebimento, produtos e detalhes somente consulta. O motorista tem autorização para consultar preços dos seus pedidos nesta fase, conforme a política de leitura de pedido completo.
8. Conta com informações do perfil e alteração de senha; modais com contenção de foco, feedback, skeleton, foco visível e preferência de movimento reduzido.

## Segurança verificável

RLS em todas as tabelas públicas; `anon` sem acesso operacional; motoristas sem escrita; perfis sem alteração direta por `authenticated`. Funções privilegiadas ficam em `private`, com `search_path` vazio e verificação explícita de administrador. Wrappers públicos são `SECURITY INVOKER`, com execução anônima revogada. A escrita comercial direta é revogada; RPCs validam campos, relações, precisão, datas, status e concorrência.

Todas as operações administrativas da API verificam autorização. Payloads rejeitam campos extras e têm limite de 96 KiB. Erros não retornam detalhes do banco ou credenciais. Não existe CORS permissivo: a origem deve coincidir com `APP_ORIGIN`. A configuração Vercel adiciona CSP, proteção contra framing, `nosniff`, política de referrer e HSTS. Os endpoints não permitem cache.

`audit_events` registra ator, operação, entidade, horário e alterações selecionadas. Não armazena senha, e-mail, endereço ou observações livres. Acesso de leitura somente do administrador. Contas de serviço e operadores com acesso SQL devem ser protegidos fora da aplicação.

```powershell
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

- `npm test`: PostgreSQL real via PGlite isolado, com schema Auth mínimo e papéis Supabase reproduzidos; API HTTP com serviço Auth isolado. Confere isolamento A/B, negação anônima, elevação de papel, perfil inativo, IDs manipulados, writes administrativos, transações, rollback, valores, histórico, concorrência otimista, atribuição única, liberação, auditoria e rate limiting.
- Playwright: Chromium em desktop 1440×1000, celular 390×844 e paisagem 844×390. Tráfego Supabase/API é interceptado **somente nos testes**, com dados explicitamente fictícios. Confere fluxos de UI, validações, formulários, confirmação de liberação, guard por perfil, detalhes de consulta e ausência de overflow horizontal. Não prova execução remota nem compatibilidade real do Safari/iPhone.
- Screenshots e traces são gravados em `test-results/`; relatório HTML em `playwright-report/`. Esses diretórios são ignorados pelo Git.
- O resumo efetivamente executado e as pendências estão em [docs/ENTREGA.md](docs/ENTREGA.md).

## Deploy na Vercel

Nenhum deploy de produção foi autorizado ou realizado.

1. Conecte este projeto à Vercel. Build `npm run build`, saída `dist/entregala/browser`, Node.js 24.
2. Configure URL/ID, chave publishable, chave secreta **somente servidor** e `APP_ORIGIN` exata. A chave secreta não tem prefixo público e nunca entra na configuração Angular. Não configure `DATABASE_URL` nem variáveis `ADMIN_*` no runtime da aplicação se não forem necessárias.
3. Aplique a migration pelo procedimento controlado. Provisione o administrador localmente. Configure SMTP e redirect URLs no Supabase.
4. `vercel.json` mantém `/api/*` para funções Node.js e reescreve as demais URLs para o Angular Router. Não existe `app.listen()` na entrada de produção; `server/dev.ts` é apenas a execução local.
5. Use ambientes/projetos de teste separados para Preview; configure a origem de cada ambiente explicitamente. Homologue os fluxos e as políticas com duas contas de motorista antes de publicar produção.

## Limites e evolução

- Consultas operacionais por dia são limitadas a 1.000 pedidos e 200 rotas; clientes ativos/catálogo a 1.000 e motoristas a 500. A operação inicial fica dentro desses limites. Aumentar a escala requer busca remota/paginação dos seletores e do planejamento, sem mudar o modelo.
- Não é multiempresa. Não há offline completo, mapas, GPS, otimização, checklists, confirmação de entrega, rastreamento, notificações, WhatsApp, faturamento ou recursos de outras fases.
- O catálogo é reutilizável, porém cadastrar pedido avulso não adiciona o produto automaticamente ao catálogo. Use Produtos para torná-lo permanente.
- `latitude`, `longitude`, endereço individual e `route_stops.position` preparam a integração Geoapify/MapLibre. A Fase 2 pode adicionar um serviço de mapas, tempos/distâncias e novos estados com migrations incrementais; pedidos, itens, motoristas e política de isolamento permanecem reutilizáveis. Nenhuma chamada Geoapify é feita nesta fase.
- Provisionamento de Auth e perfil envolve dois sistemas e usa compensação. Pedidos, itens e rotas são transações PostgreSQL integrais.
- A homologação real depende da configuração externa e não deve ser substituída pelos testes com serviços isolados.

## Referências técnicas consultadas

- [Compatibilidade oficial do Angular](https://angular.dev/reference/versions)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Verificação de usuário no Supabase](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Criação administrativa de usuários](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Vercel Functions com Node.js](https://vercel.com/docs/functions/runtimes/node-js)
# Fase 4: PWA e uso em campo

O aplicativo pode ser instalado pelo menu do navegador no Android. No iPhone, abra no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**. Instalação e service worker requerem HTTPS (ou localhost); o modo de desenvolvimento não registra o service worker.

Ao abrir uma rota autenticado, o motorista guarda neste aparelho os dados necessários à consulta por até 24 horas, enquanto a sessão ainda for válida. A conferência individual de carga, ajuste de quantidade, conferência individual de entrega e ocorrência podem ser registradas sem conexão. O aparelho mantém **uma alteração pendente por rota**; sincronize antes de registrar a próxima. Início e fim de jornada, confirmação final de entrega, conferência em grupo, ajustes de identificação e otimização exigem conexão. O mapa não oferece tiles ou navegação offline completos.

Uma alteração pendente não é uma confirmação do servidor. Ao recuperar conexão, reabra a operação e use **Tentar sincronizar**; a sincronização também é tentada automaticamente enquanto a operação estiver aberta. O servidor verifica a versão original e o identificador da requisição; conflitos mantêm o registro no aparelho. Confira os dados atuais e, se necessário, descarte explicitamente o registro pendente antes de fazer uma nova conferência. Sair da conta limpa os dados locais após aviso se houver alteração pendente. O navegador pode remover armazenamento local; não há garantia de recuperação após limpeza de dados ou troca de aparelho.

O cache do service worker contém apenas arquivos públicos do aplicativo. Dados operacionais e fila ficam no IndexedDB por usuário; tokens e respostas autenticadas não são adicionados ao cache do service worker. Atualizações são oferecidas sem recarregar automaticamente e não devem ser aplicadas com alterações pendentes. Não houve deploy de produção; instalação e funcionamento devem ser homologados em Android e Safari/iPhone reais.

Verificações da Fase 4: build e typecheck; manifestação e registro do service worker no Chromium local; teste de navegador móvel com carregamento offline, sincronização, reenvio idempotente após resposta perdida e conflito de versão em banco isolado. A verificação não substitui homologação com contas reais e dispositivos físicos.

