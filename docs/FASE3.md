# EntregaLá · Fase 3 — operação de entregas

Implementação incremental em 11/11/2026. Histórico: [Fase 1](ENTREGA.md), [Fase 2](FASE2.md). Não houve deploy nem aplicação remota desta migration pelo agente.

## Instalação

**Estado remoto conferido:** as estruturas das três fases já foram detectadas, incluindo `operation_items`, `operation_issues`, `route_signals` e metadados da jornada. Leitura anônima bloqueada nas 12 tabelas consultadas. Não reexecute a criação neste projeto. A conferência de presença/grants não substitui a homologação completa de RPCs e Realtime hospedados.

1. Para **instalação nova**, execute uma única vez e por inteiro [20261111160254_phase3_operations.sql](../supabase/migrations/20261111160254_phase3_operations.sql) depois das fases anteriores. Execução manual pelo proprietário, conforme combinado. No projeto atual a estrutura já foi detectada: não reaplique nem use reset.
2. Execute [04_conferir_fase3.sql](../supabase/setup/04_conferir_fase3.sql). Confira RLS, grants e inclusão de **somente `route_signals`** na publicação `supabase_realtime`. Se a publicação não existir, habilite a replicação dessa tabela no painel. Não é necessário expor o schema `private`.
3. `npm run verify:remote` deve detectar as três tabelas novas, metadados da jornada e bloqueio anônimo. Esse script somente consulta; não verifica a configuração completa do Realtime.
4. `npm run dev`, abra **http://localhost:4200**. Mesmas credenciais e chaves existentes; nenhuma variável nova.
5. Homologue com administrador e dois motoristas em ambiente autorizado antes de produção. Confirme a entrega de eventos reais entre dispositivos, inclusive após reconectar.

## Fluxo do motorista

- **Conferir carregamento:** abre a jornada atribuída. Iniciar a conferência cria os vínculos de todos os itens da rota, uma única vez. Reabrir consulta as marcações persistidas.
- **Por estabelecimento:** mostra todas as linhas de produtos, quantidades solicitadas/carregadas, unidade, endereço, observações e estado. Um toque explícito registra a carga integral da linha. Ajustar permite quantidade parcial ou zero com motivo.
- **Por produto:** consolida por ID do catálogo e unidade, mantendo os vínculos individuais. Produtos avulsos sem identidade comum permanecem separados. Confirmar um produto exige confirmação física e atualiza apenas suas linhas pendentes. Não existe botão global para conferir toda a carga.
- Busca por estabelecimento/produto e filtros de pendentes, conferidos e divergências. Indicador mostra linhas tratadas, restantes e com diferença; uma falta registrada conta como tratada, sem virar carga integral.
- **Iniciar entregas:** exige todas as linhas tratadas, versão atual e nenhuma outra rota em andamento do mesmo motorista. Divergências exigem reconhecimento explícito. Horários vêm do PostgreSQL.
- **Continuar entregas:** apresenta a próxima parada sem resultado final, checklist individual, navegação Google Maps, lista e mapa existente. A quantidade carregada é sugerida, mas não confirmada automaticamente como entregue.
- **Corrigir carga / produto:** permite corrigir quantidade carregada e identificação/unidade efetiva, com justificativa. Excesso exige confirmação explícita. Para entregar acima da carga registrada, corrija primeiro a carga. Item adicional operacional exige identificação, unidade, quantidade e motivo.
- **Finalizar entrega:** após conferir todos os itens, pede confirmação contextual. O banco deriva o resultado: integral quando corresponde ao pedido original; parcial quando há mercadoria entregue com diferença; não realizada quando nada foi entregue. Resultados não integrais exigem motivo.
- **Registrar problema:** categorias fechado, indisponível, faltante, quantidade, recusa, endereço, substituição e outro; vínculo com jornada/parada/item conforme o comando. Motivos explicativos são obrigatórios para divergências/substituições/outros. O registro não altera sozinho o resultado da entrega.
- **Finalizar jornada:** somente depois de todas as paradas terem resultado final. Parciais e não realizadas permitem encerramento, permanecendo discriminadas no histórico. Não há retorno obrigatório à base.

Rotas em andamento são priorizadas na lista, inclusive quando começaram em outra data. O motorista não altera uma jornada encerrada. Datas operacionais seguem São Paulo; timestamps são armazenados com fuso no banco.

## Administração

Seção operacional adicionada à visão geral e tela **Operação de entregas** (`/admin/operacao`). Filtro por data, totais reais e cards por motorista com progresso. Paradas tratadas e entregas integrais têm contagens distintas.

Consultar operação permite revisar carga, quantidades solicitadas/carregadas/entregues, ocorrências, resultados, horários e histórico básico. Ocorrências novas recebem destaque. Ajustes operacionais são auditados.

O administrador pode autorizar correção de uma entrega finalizada **enquanto a jornada ainda está em andamento**, com justificativa obrigatória. A entrega volta a atendimento e seus registros anteriores permanecem na auditoria. Não há reabertura de jornada encerrada nem reversão irrestrita pelo motorista. Reconciliação comercial/financeira permanece administrativa e fora dos comandos operacionais.

## Banco e segurança

| Área | Alteração |
| --- | --- |
| `routes` | Estados `draft → released → loading → in_progress → completed`, versão operacional e horários/atores de início e encerramento |
| `route_stops` | `pending`, `in_service`, `delivered`, `partial`, `not_delivered`; horários e responsável |
| `operation_items` | Vínculo com item comercial original, carga, entrega, identificação/unidade ajustadas e justificativas; itens adicionais separados |
| `operation_issues` | Ocorrência com categoria, fase, responsável, horário e vínculos |
| `route_signals` | Apenas ID da rota, versão e atualização; publicação Realtime mínima |
| `private.operation_commands` | Idempotência por ator/request ID, resultado, digest e limite persistente por minuto |
| RPCs novas | `operation_context` para consulta autorizada; `operation_command` para comandos específicos |

Funções privilegiadas ficam em `private`, com `search_path` vazio, objetos qualificados e autorização explícita. Wrappers públicos usam `SECURITY INVOKER`; `anon`/`PUBLIC` não executam as RPCs. Tabelas operacionais têm RLS de leitura, sem escrita genérica para `authenticated`.

O comando verifica usuário ativo, rota, parada, pedido, item, estado, precisão de três casas, faixa de quantidade, justificativa e versão. Locks transacionais reutilizam o mecanismo operacional existente. O índice parcial único impede duas jornadas em andamento do mesmo motorista. Comandos possuem limite persistente de 120/minuto por ator.

O mesmo request ID/payload devolve o resultado persistido, mesmo se o retorno anterior se perdeu. Reutilizar a chave com outro payload é recusado. Falhas desfazem a transação. Quantidades originais, preços, subtotais, total, cliente e atribuições comerciais não são editados por esses comandos.

As operações de planejamento e edição comercial passam a bloquear **todos os estados após rascunho**, preservando a regra anterior e impedindo que os novos estados abram brechas. Rotas antigas não recebem conclusões ou conferências fictícias.

## Mapas e sequência

MapLibre/Geoapify e o enquadramento local da rota foram preservados. Marcadores operacionais combinam número, símbolo e estilo. Nenhuma entrega desaparece do histórico ao concluir.

Somente paradas pendentes podem mudar de posição; atendidas/em atendimento mantêm a posição. O servidor compara o conjunto completo de IDs e a versão, inclusive em aplicações de propostas. Otimização é bloqueada quando há parada já em atendimento/tratada ou jornada encerrada. A reordenação manual das pendentes continua disponível durante a jornada.

O fingerprint geográfico ignora atualizações exclusivamente operacionais, mas inclui sequência, origem, motorista e dados geográficos. Concluir entrega não consome créditos Geoapify. Reordenar invalida o trajeto anterior e exige cálculo explícito para novas métricas; não há otimização automática.

## Sincronização e conexão

Postgres Changes somente sobre `route_signals`, com leitura protegida por RLS. Eventos disparam reconsulta autorizada, sem transmitir checklist ou descrições em payloads de eventos.

Consulta inicial, nova consulta ao assinar/reconectar/voltar à tela e recuperação periódica a cada 20 segundos. Assinaturas, timers e listeners são removidos ao sair. Respostas antigas são descartadas. A interface indica consulta desatualizada, conexão de eventos e horário da consulta.

Escritas não são confirmadas visualmente antes do servidor. Formulários permanecem durante falha; nova tentativa reutiliza a requisição pendente. Após conflito, **Atualizar dados** busca a versão vigente antes de uma nova tentativa revisada. Sem fila offline, armazenamento local de checklist ou promessa de operação desconectada.

## Arquivos

- Contratos e indicadores: `shared/operations.ts`; tipos de rota/parada ampliados em `shared/models.ts` e mapas.
- Backend: `server/validation/operations.ts`, extensão de `server/handler.ts`, `api/operations.ts`.
- Serviços: `src/app/core/operations/operations-data.ts`, consultas complementares em `core/data.ts`.
- Componentes: `features/operations/` (workspace, carga, entrega, ajustes, ocorrências, acompanhamento e SCSS), `shared/operations/` (progresso e horários).
- Integrações: motorista, dashboard, navegação administrativa, planejamento, editor de pedidos e mapas existentes.
- Banco: migration incremental e conferência SQL 04. Script remoto ampliado para verificar a Fase 3.
- Testes: `tests/operations*.ts`, `tests/e2e/operations.fixture.ts`, `tests/e2e/operations.spec.ts`, API e configuração Playwright ampliadas.

## Validação

```powershell
npm run build
npm run typecheck
npm test
npm run test:e2e
npm audit
```

Os testes técnicos incluem banco PostgreSQL isolado com as três migrations reais, papéis Auth, RLS, idempotência, versões, transições, rollback, substituições, extras, precisão, excesso, preservação comercial e isolamento entre motoristas. O cenário de 12 paradas percorre a operação até o encerramento.

Resultados executados: **53 testes técnicos aprovados**, **50 cenários de navegador aprovados**, build/typecheck aprovados e `npm audit` sem vulnerabilidades reportadas. A interface também passou por inspeção das capturas de teste. O pacote de produção foi conferido sem valores privados do `.env` ou fixtures.

Correção posterior: a consulta aninhada de rotas precisa especificar `profiles:profiles!routes_driver_id_fkey(*)`, pois a Fase 3 adiciona também vínculos de início/encerramento com perfis. Sem essa seleção, PostgREST retorna `PGRST201`. As consultas por data e jornadas ativas foram corrigidas e verificadas no Supabase hospedado, sem escrever dados. O script `verify:remote` agora confere também a consulta aninhada real, além da presença das tabelas; os testes com interceptação não detectavam essa ambiguidade.

Correção de busca de endereços: [20261111170825_fix_map_request_scope.sql](../supabase/migrations/20261111170825_fix_map_request_scope.sql) corrige referências de parâmetros da função de orçamento renomeada na Fase 3, que produziam `42P01` antes de consultar o Geoapify. O proprietário informou a execução desse SQL corretivo. Não reaplicar as migrations anteriores. O teste de regressão executa a chamada com todas as migrations no PostgreSQL isolado. O SQL 04 inclui a consulta `controle_mapas_corrigido`, esperada como `true` após a correção.

O editor compartilhado de endereços passou a aceitar graus decimais com ponto/vírgula, mostrar limites e erros específicos e oferecer **Aplicar coordenadas ao mapa**. Valores fora da faixa nunca são corrigidos por adivinhação. Editar um número invalida imediatamente a confirmação anterior; é preciso conferir o ponto novamente e salvar o cadastro/base. A base agora explica que localização confirmada é obrigatória, enquanto estabelecimento pode ser salvo sem ponto. Nessa correção foram aprovados 56 testes técnicos e os cenários afetados de endereço em desktop/celular.

Após os ajustes finais de sincronização/enquadramento e navegação, os cenários afetados de mapas e operação foram reexecutados em desktop e celular. A recuperação preserva seleção, prévia e ordenação não salva; o cenário de conexão também cobre resposta perdida depois do commit, reenvio sem duplicação e reconsulta administrativa após reconexão simulada. O ícone de carga é SVG personalizado leve, sem dependências adicionais.

Os novos testes Playwright também usam PostgreSQL isolado: tráfego da interface é encaminhado às RPCs/validações reais no ambiente de teste, com autenticação controlada. Conferências e resultados sobrevivem ao recarregamento da página. Dados fictícios existem somente nesse ambiente, sem inserções no Supabase hospedado.

Viewports: desktop, tablet, celular Android simulado, iPhone simulado em Chromium e paisagem. Isso não comprova compatibilidade física ou Safari/WebKit. Relatórios em `artifacts/`; resultados finais e limitações devem refletir a execução efetiva.

**Homologação remota pendente:** a estrutura já está presente; não se declara jornada real ou entrega de eventos Realtime hospedados testada apenas por conferir tabelas. Ainda é necessário homologar com contas reais autorizadas. Nenhum crédito Geoapify adicional é necessário para checklists/progresso.

## Limites e próxima fase

Sem GPS contínuo, PWA, offline completo, fotos/assinaturas, push, WhatsApp, pagamentos, estoque, multiempresa ou redistribuição de motoristas. Node.js 24/Vercel e os cabeçalhos de segurança permanecem. Nenhuma dependência nova foi instalada nesta fase.

Fase 4 poderá estender os contratos versionados/idempotentes para resiliência offline, sem transformar estados locais na fonte oficial. O PostgreSQL continua sendo a autoridade.

Referências oficiais consultadas: [Postgres Changes/RLS e publicação](https://supabase.com/docs/guides/realtime/postgres-changes), [changelog Supabase](https://supabase.com/changelog).
