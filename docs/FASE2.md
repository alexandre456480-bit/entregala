# EntregaLá · Fase 2 — mapas e roteirização

Implementação incremental de 11/11/2026. A Fase 1 e seus SQLs foram preservados. Consulte [o relatório anterior](ENTREGA.md) para o histórico.

> Evolução operacional posterior: [Fase 3](FASE3.md). As regras de jornada, quantidade efetiva e reordenação de paradas atendidas são descritas ali; o restante deste documento preserva o histórico da Fase 2.

## Entrega

- **Base da operação:** nome, endereço, observações e ponto confirmado. Administrador pesquisa o endereço, confere o mapa ou informa coordenadas. Nenhuma origem é inventada.
- **Localização da entrega:** busca Geoapify integrada ao cadastro, alternativas com confiança/precisão, aviso de aproximação, marcador arrastável, coordenadas manuais e confirmação explícita. A API indisponível não impede cadastrar o estabelecimento.
- **Validade geográfica:** alterar endereço/coordenadas exige revisão. Pontos anteriores não são considerados confirmados automaticamente. Coordenadas confirmadas são reutilizadas sem nova geocodificação.
- **Mapa administrativo por data:** motoristas identificados por nome, cor consistente e status; rotas adicionais podem ser ocultadas; seleção sincronizada com lista e detalhes dos produtos.
- **Trajetos:** Routing API segue a sequência salva, da base à última entrega. Distância, tempo de deslocamento e trechos vêm do provedor; não há trânsito ao vivo nem tempo fictício de descarga.
- **Otimização:** Route Planner recebe um agente, sem destino final fixado, e tarefas identificadas pelos IDs reais dos pedidos. Nenhuma entrega é distribuída para outro motorista. Resultados incompletos/duplicados são recusados.
- **Prévia:** sequência atual/proposta, mudanças destacadas, estimativas e comparação quando há cálculo anterior confiável. Aplicar ou manter a rota é uma decisão explícita; gerar uma proposta não modifica a sequência.
- **Motorista:** mapa/lista, consulta de produtos, seleção de paradas, reordenação da própria rota liberada e navegação externa pelo Google Maps. Produtos/preços, atribuições e coordenadas permanentes continuam protegidos.
- **Visual:** identidade, marca e SVGs da Fase 1; novos marcadores numerados, destaque de origem e seleção, painéis responsivos, foco visível e movimento reduzido.

## Configurar e executar

Status remoto atualizado: migration da Fase 2 detectada; operation_base e metadados presentes; acesso anônimo negado nas nove tabelas verificadas. Ambas as chaves configuradas. Estilo Geoapify e uma consulta de geocodificação responderam HTTP 200. Cálculo, otimização e aplicação com contas e rotas reais ainda exigem homologação.

1. Execute **somente** [a migration incremental da Fase 2](../supabase/migrations/20261111143409_phase2_maps.sql), inteira, no SQL Editor do mesmo projeto. O proprietário realiza essa execução, conforme combinado. Não reaplique a Fase 1 nem use reset. A migration foi testada em PostgreSQL isolado; sua execução remota deve ser conferida separadamente.
2. No Geoapify, crie **duas chaves distintas** e configure no `.env`:

   ```dotenv
   GEOAPIFY_MAPS_KEY=chave_publica_para_estilos_e_tiles
   GEOAPIFY_SERVER_KEY=chave_privada_para_geocoding_routing_e_routeplanner
   ```

   Restrinja a chave pública aos domínios/origens autorizados e às APIs de mapas disponíveis nas configurações do provedor. Na privada, limite os serviços a geocodificação/roteirização e use as restrições aplicáveis à hospedagem serverless. Não dependa de IP de saída estático da Vercel sem contratar/configurar essa infraestrutura. Confirme os mecanismos disponíveis no painel Geoapify.
3. `npm ci` e `npm run dev`; abra **http://localhost:4200**. Após mudar `.env`, reinicie o desenvolvimento para regenerar a configuração pública.
4. Entre como administrador, abra **Base da operação** e confirme a saída. Revise as localizações em **Estabelecimentos**. Acesse **Mapa das rotas** ou o botão no planejamento.
5. Use **Calcular trajeto** para a sequência salva ou **Otimizar rota** para uma proposta. O cálculo admite de **1 a 30 entregas por rota**. Rotas maiores continuam disponíveis no planejamento/consulta manual.
6. Use `npm run verify:remote` para conferir tabelas, metadados geográficos e bloqueio anônimo. Essa verificação não escreve dados nem valida toda a configuração de Auth.

Sem chave de mapas, a interface informa a configuração pendente e mantém a lista. Sem chave privada, chamadas externas são recusadas antes da reserva de créditos. Sem origem ou com pontos não confirmados, o cálculo é bloqueado.

## Arquitetura e arquivos

| Área | Arquivos/responsabilidade |
| --- | --- |
| Contratos | `shared/maps.ts`: coordenadas, tipos, conversão GeoJSON, cores e Maps URLs; sem dependência de validação do servidor |
| Validação | `server/validation/maps.ts`: payloads Zod estritos |
| Provedor | `server/services/geoapify/provider.ts`: URLs fixas, normalização, limites de resposta e timeout |
| Controle | `server/services/geoapify/controller.ts`: autorização, cache, reservas e propostas |
| Entradas | `api/maps/[operation].ts`, integrado ao handler existente |
| Frontend | `core/maps/maps-data.ts`; componente `shared/maps/route-map.ts`; telas em `features/maps/`; editor em `features/establishments/location-editor/` |
| Integração existente | Cadastro de estabelecimentos, planejamento, motorista, navegação e modelos receberam somente as extensões necessárias |
| Banco | Migration Fase 2: origem única, metadados geográficos, RPCs de sequência, cache privado e controle de consumo |
| Deploy | `angular.json`: MapLibre carregado sob demanda e worker local; `vercel.json`: CSP Geoapify/worker e função de mapas com até 60 s |

O mapa não contém regras comerciais ou chaves privadas. Instâncias, marcadores e ResizeObserver são destruídos ao sair. GeoJSON usa `[longitude, latitude]`; Routing usa `latitude,longitude`. A seleção e as alterações visuais não disparam cálculos pagos.

O Route Planner pode fornecer somente a solução matricial. Uma geometria de planejamento sem passos detalhados não é apresentada como trajeto pelas ruas. Quando há geometria detalhada suficiente, ela é reaproveitada. Caso contrário, o usuário calcula o trajeto explicitamente após aplicar a proposta. Nunca é desenhada uma linha reta como se fosse navegação.

## Segurança e persistência

- Auth continua verificando token e perfil ativo. Administrador configura base e confirma coordenadas; motorista consulta e reordena exclusivamente sua rota liberada.
- A nova tabela pública `operation_base` possui RLS e somente leitura para usuários autorizados. Cache, solicitações e orçamento ficam em `private`, sem acesso direto do navegador.
- A exceção para rotas liberadas é uma RPC específica de sequência. Não libera a edição genérica da rota, do motorista ou dos pedidos.
- A reordenação exige exatamente o conjunto original de pedidos, sem duplicação/remoção. Atualiza posições em transação sob o lock operacional e exige `updated_at` atual.
- Aplicar proposta confere rota, fingerprint, validade e versão; bloqueia base/pontos durante a conferência. A auditoria distingue reordenação manual, otimização aplicada, confirmação/revisão de ponto e alteração da base.
- Somente a chave de serviço no servidor pode guardar respostas externas normalizadas. O navegador envia o ID da proposta, nunca geometria ou métricas a serem confiadas pelo banco.
- Endpoints externos são fixos, sem URLs enviadas pelo cliente; sem redirecionamentos, com timeout de 35 s, resposta máxima de 2 MB e sem repetição automática de chamadas.
- A configuração pública exporta somente a chave de mapas designada. Recusa publicar uma chave que coincida com chaves privadas conhecidas. A privada não é enviada ao Angular nem a mensagens de erro.

## Consumo e reaproveitamento

Política inicial conservadora: **1.800 créditos estimados/dia para backend**, deixando margem na franquia publicada de 3.000 para mapas. Isso **não garante** que o plano gratuito será suficiente: tiles são pedidos diretamente pelo navegador e não entram no contador PostgreSQL. Acompanhe o consumo real em **myprojects.geoapify.com**, configure alertas/restrições e ajuste a operação antes de aumentar limites.

O contador é persistente e global por dia UTC; limita também usuário e rota por hora. Até 30 buscas, 12 cálculos e 4 otimizações por usuário/hora; cálculos e otimizações também têm teto por rota. Uma lease de 100 s impede chamadas simultâneas duplicadas do mesmo tipo/contexto. O orçamento é reservado antes da chamada, inclusive em falhas; não há tentativas de contornar a franquia.

| Serviço | Referência publicada e controle interno |
| --- | --- |
| Geocoding | 1 crédito/busca; acionamento explícito e coordenadas confirmadas persistidas |
| Routing | 1 crédito por trecho, mais adicionais por distância; reserva interna `paradas + 10` |
| Route Planner | Matriz `n × min(n,10)` para locais únicos, mais adicionais; reserva interna `(paradas+1) × min(paradas+1,10) + paradas + 10` |
| Tiles | Referência publicada de 0,25 crédito/tile; volume varia por zoom, área e uso |

Exemplo de **estimativa de reserva interna**, não medição: otimizar uma rota de 18 paradas reserva 218 créditos. Quatro rotas com 18, 16, 20 e 16 paradas reservam 850 créditos. Cálculos adicionais, buscas e tiles são separados. Percursos excepcionalmente longos podem exceder a margem por distância: o painel oficial é a autoridade de cobrança.

Resultados de rota/proposta são guardados por **6 horas**, compartilhados somente entre usuários autorizados daquela rota. Fingerprint inclui sequência, origem, pontos, contexto de motorista/status e modo `drive`. Mudanças invalidam o reaproveitamento. Resultados expirados são removidos nas gravações seguintes; a consulta já os ignora imediatamente. Não há download ou armazenamento permanente de tiles. Atribuições Geoapify e OpenStreetMap permanecem visíveis. Reavalie retenção/termos antes de ampliar o cache ou usar outra licença/provedor.

## Validação e limites de evidência

Executar:

```powershell
npm run build
npm run typecheck
npm test
npm run test:e2e
npm audit
```

- **40 testes técnicos aprovados**, incluindo a Fase 1, PostgreSQL isolado/RLS, orçamento diário, lease, versões, confirmação/revisão geográfica, propostas e preservação de IDs/motorista. Contratos testam 1, 2, 10, 20 e 30 entregas, coordenadas repetidas, origem ausente, resposta incompleta, ambiguidade e falha do provedor.
- **28 cenários de navegador aprovados**: desktop 1440×1000, tablet 1024×768, celular 390×844 e paisagem 844×390. Incluem regressões da Fase 1, sincronização marcador/lista, prévia/cancelamento/aplicação, ordenação, revisão de endereço e motorista sem edição de produtos.
- Testes de navegador usam build **e2e separado na porta 4201**, com configuração pública fictícia e tráfego interceptado. O MapLibre executa de verdade, mas o estilo de teste é um fundo controlado: capturas de teste não representam ruas reais ou integração Geoapify homologada.
- Relatórios atuais em `artifacts/playwright-report/`, traces em `artifacts/test-results/` e capturas em `artifacts/screenshots/`. Relatórios antigos da Fase 1 foram movidos para `artifacts/legacy/`, mantendo a raiz organizada sem apagar histórico. A revisão automática bloqueou a exclusão recursiva; foi utilizada essa organização reversível.
- Build e typecheck foram executados; auditoria de dependências sem vulnerabilidades reportadas na implementação. Nenhuma atualização indiscriminada de dependências: MapLibre foi adicionado com versão fixa e lockfile.
- A homologação real depende da migration, das duas chaves e das restrições do Geoapify. Sem esses acessos, **não se declara teste real de mapas, geocodificação ou otimização**. Safari/iPhone e Android físicos permanecem para homologação.

## Deploy e próximas fases

Nenhum deploy foi realizado. Mantenha build/saída e Node.js 24 da Fase 1; configure as duas chaves Geoapify, Supabase e `APP_ORIGIN` por ambiente. Autorize os domínios na chave pública; teste o worker local/CSP e a restrição de origem antes de produção. SQLs continuam sob execução controlada pelo proprietário.

Não foram implementados GPS contínuo, início de jornada, redistribuição de pedidos, checklists, confirmação de entrega, pendências, PWA/offline ou funcionalidades da Fase 3. Os dados calculados, componentes visuais e RPC de sequência ficam separados; novos estados operacionais poderão restringir a reordenação e estender marcadores com migrations futuras.

## Fontes oficiais verificadas

[Mapas](https://apidocs.geoapify.com/docs/maps), [geocodificação](https://apidocs.geoapify.com/docs/geocoding/), [Routing](https://apidocs.geoapify.com/docs/routing/), [Route Planner](https://apidocs.geoapify.com/docs/route-planner/), [MapLibre](https://maplibre.org/maplibre-gl-js/docs/), [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [termos Geoapify](https://www.geoapify.com/terms-and-conditions/).
