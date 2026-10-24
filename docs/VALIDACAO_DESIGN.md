# Validação da interface e contexto — versão 0.3

Executada em 24/10/2026, Linux x86_64, Python 3.12, Node.js 24 e Chromium headless. As validações usam bancos temporários, sem dados ou credenciais do proprietário.

| Verificação | Resultado |
| --- | --- |
| Backend, incluindo autenticação, clima, cache, coordenadas, horário, privacidade e regressões | **34 passaram** |
| Gestos, navegação e preparação de texto para síntese | **29 passaram** |
| Bateria completa do navegador | **16 passaram** |
| Reexecução após os ajustes finais | Voz, GPS com saída da sessão, captura do início, hierarquia, desempenho e enquadramento móvel passaram |
| TypeScript e build Vite | Passaram |
| Instalação repetida, hashes Python, npm ci, modelo MediaPipe e WASM locais | Passou com os caches graváveis do ambiente |
| Produção compilada servida pelo FastAPI | Login, tema, câmera desligada, hora sem IA, memória vazia e política de geolocalização passaram, sem erros de console/JavaScript |

São **79 testes distintos**; reexecuções dos mesmos testes não foram somadas. O pytest mantém o aviso de depreciação do TestClient/HTTPX já documentado. O build mantém o aviso de tamanho do módulo 3D, que continua carregado sob demanda.

No benchmark identificado de **1.000 memórias sintéticas**, o Chromium/SwiftShader mediu 24, 27, 25 e 26 FPS, média **25,5 FPS**, em 1536×1000 no modo de desempenho. A câmera sintética foi ativada e desligada pelo controle real. Esses números descrevem este ambiente, não garantem desempenho no computador do proprietário. A imagem [neural-memory.png](assets/neural-memory.png) mostra esse teste e não representa memórias reais.

Capturas do início e do celular foram inspecionadas. O início não contém clima, cidade, tarefas ou contas fictícias. O cérebro omite agrupamentos vazios e enquadra os nós reais também no celular; a prévia ativa da câmera ocupa uma coluna própria, sem interceptar os botões do cenário.

## Alcance dos testes externos

- Open-Meteo e Nominatim foram testados com transportes HTTP simulados e rotas de navegador simuladas, identificados no código. Os testes verificam mapeamento do contrato, erros, cache e fluxo de seleção. O cliente mantém verificação TLS habilitada e usa hosts fixos. As consultas reais aos três hosts foram bloqueadas pelo proxy da nuvem (`ProxyError`). Seus domínios foram acrescentados ao rascunho de configuração, preservando os destinos anteriores. Salvar o rascunho não libera a rede em execução nem publica uma nova versão do ambiente; revisão/aplicação e nova consulta real continuam pendentes.
- A síntese de fala foi testada com um stub explícito da Web Speech API: ativação, apresentação, leitura de resposta local, sequência de trechos longos, cancelamento, callbacks antigos ignorados e leitura desativada. Nenhum teste alega reprodução física de som. Microfone, reconhecimento pt-BR e vozes do Windows precisam de validação no computador do proprietário.
- A geolocalização simulada verificou que nenhum pedido de posição acontece ao abrir a aplicação; apenas o clique solicita posição. Foram verificadas recusa de permissão, redução de precisão antes da requisição, ausência de coordenadas no armazenamento local e descarte ao sair/recarregar.
- OpenAI, Brave e Telegram continuam dependendo das respectivas credenciais e não foram usados para chamadas reais nesta entrega. A validação Docker anterior está em [VALIDACAO_NEURAL.md](VALIDACAO_NEURAL.md); as imagens Docker não foram reconstruídas nesta atualização.

As instruções e novos domínios foram salvos no rascunho do ambiente. Publicação e restauração em uma nova tarefa não foram validadas.
