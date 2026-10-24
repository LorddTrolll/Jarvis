# Validação do painel imersivo — versão 0.4

Executada em 24/10/2026 no Linux, Python 3.12, Node.js 24 e Chromium headless. Foram usados bancos temporários e credenciais externas desativadas. Nenhuma conta ou mensagem real foi usada como teste.

| Verificação | Resultado |
| --- | --- |
| Backend: regressões, sessão local, restrição remota, métricas e resumo diário | **39 passaram** |
| Gestos, navegação e preparação de fala | **29 passaram** |
| Navegador: bateria completa com o painel imersivo | **18 passaram** |
| TypeScript e build de produção | Passaram |
| Reinstalação com lockfiles e hashes Python, npm ci, assets e build | Passou |
| Iniciador com backend real e cliente de janela substituto | Passou: saúde/identidade, sessão protegida, métricas, arquivos compilados e encerramento |
| Frontend compilado em Chromium, aberto pelo fluxo do iniciador | Passou: sessão direta, painel sem perfil, resumo real, módulo de memórias e retorno ao núcleo, sem erros de JavaScript/console |

São **86 testes distintos**, além das verificações funcionais. Reexecuções não são somadas. O aviso de depreciação TestClient/HTTPX permanece; o build continua informando o tamanho do módulo 3D, carregado sob demanda.

O teste de entrada direta usa uma capacidade exclusiva do backend de testes, inicia uma sessão real e verifica que a capacidade foi removida da URL. Não desativa a autenticação. A bateria do backend também verifica que uma capacidade inválida ou apresentada por conexão remota é recusada e que a senha normal continua válida.

O resumo “bom dia” foi verificado com uma tarefa prioritária real no banco temporário, sem LLM. O teste confirma a resposta no núcleo e a atualização das prioridades. Outros fluxos preservados incluem tarefas, documentos, seleção por gestos, confirmação de Telegram sem envio, câmera sintética, permissões negadas, clima, voz, conversa temporária e PDF.js com o original renderizado.

O teste inicial de 1.000 nós encontrou um custo excessivo no desfoque do módulo sobreposto. O desfoque foi retirado e o núcleo de fundo deixa de ser pintado durante os módulos. A bateria completa passou após o ajuste. No benchmark final, **1.000 nós sintéticos**, modo de desempenho e Chromium/SwiftShader em **1536×1000**, as amostras foram **21, 26, 26 e 25 FPS**, média **24,5 FPS**. A câmera sintética pôde ser ativada e desligada. Isso não é uma garantia de desempenho do Windows do proprietário.

A [captura do painel](assets/jarvis-hud.png), em **1366×768**, mostra relógio e telemetria reais da máquina de teste; não contém cidade/clima fictícios nem contas. A [captura do cérebro](assets/neural-memory-hud.png) usa o modo sintético identificado e não representa memórias reais do proprietário.

O iniciador foi exercitado com processo real, banco temporário e senha configurada: a capacidade da janela foi trocada por cookie HttpOnly sem senha digitada. A verificação esperou a disponibilidade real do backend, consultou métricas autenticadas e o frontend compilado, encerrou o processo e confirmou que sua porta deixou de aceitar conexões. A abertura da janela foi substituída por um cliente de teste; Edge e `.bat` físicos no Windows ainda precisam ser conferidos.

Os testes de fala usam um substituto explícito da Web Speech API e não validam alto-falantes ou microfone reais. Clima e localização usam respostas HTTP simuladas nos testes; não houve nova consulta real validada aos provedores nesta entrega. As limitações anteriores de rede estão documentadas em [VALIDACAO_DESIGN.md](VALIDACAO_DESIGN.md). E-mail, calendário externo, wake word e automação irrestrita do sistema não foram implementados nem apresentados como conectados. Imagens Docker não foram reconstruídas nesta atualização.
