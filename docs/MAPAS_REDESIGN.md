# Mapas: aparência e desempenho

O mapa usa o estilo vetorial escuro do Geoapify com cores ajustadas para azul-marinho, quadras azuis, água azul-petróleo e ruas cinza-azuladas. A rota selecionada é laranja; as rotas adicionais conservam as cores dos motoristas. O SVG local identifica as paradas, com um indicador de cor da rota, distinção de origem e destino e símbolos de operação. As ruas, os dados geográficos e as atribuições continuam sendo do provedor.

O mesmo componente atende administrador, motorista e editor de localização. Continua carregado sob demanda, com uma instância por visualização ativa e limpeza ao sair. Marcadores HTML foram mantidos para preservar foco de teclado, seleção e arraste acessível no editor; eles são atualizados apenas quando seu conteúdo ou posição muda. A fonte da linha só recebe `setData` quando o trajeto muda. A seleção evita mover a câmera quando o ponto já está visível e não altera o zoom; o redimensionamento não reenquadra automaticamente um mapa já enquadrado. Nenhuma dessas ações dispara cálculos de rota.

Não foram alterados banco, autenticação, políticas, roteirização ou checklists. O limite de pixel ratio e a migração para pontos em WebGL não foram aplicados sem comparação suficiente de qualidade visual, acessibilidade e toque. O estilo vetorial possui um perfil de requisições diferente do estilo anterior; o consumo real de tiles e serviços deve ser acompanhado no Geoapify.

## Medição controlada

No mesmo cenário Playwright/Chromium de desktop, com 70 paradas fictícias, estilo de teste simplificado e cinco seleções, uma execução antes registrou 4.392 mutações no DOM do mapa e 33,1 MB de heap estimado pelo navegador; uma execução após registrou 45 mutações e 31,2 MB. Inicialização observada: 3,66 s e 3,09 s, respectivamente. As medições foram isoladas e executadas com cargas concorrentes diferentes, portanto não são uma comparação estatística. Os tempos e o heap variam conforme máquina e carga; os resultados não são FPS nem garantem desempenho em aparelhos físicos. O teste móvel com 70 pontos usou eventos de seleção programáticos devido à sobreposição das paradas na escala inicial; testes menores exercitam cliques reais. A lista permanece disponível para selecionar paradas sobrepostas.

O estilo real do Geoapify foi carregado em navegador local com uma posição de teste, sem erro HTTP observado. Os testes de fluxos usam dados e chamadas interceptadas; isso não substitui a homologação de rotas reais, dispositivos físicos e Safari. A imagem de referência fornecida orientou a paleta e a rota, sem substituir a geografia real por uma imagem.

Referência: [MapLibre — desempenho de dados geográficos](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).
