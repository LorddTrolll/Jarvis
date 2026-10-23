# Validação desta versão

Executada em 23/10/2026, Linux x86_64, Python 3.12, Node.js 24 e Chromium headless. Nenhuma credencial real de IA, busca ou Telegram estava disponível. Os resultados abaixo distinguem testes locais, contratos simulados e dependências externas.

| Verificação | Resultado |
| --- | --- |
| Instalador `python scripts/setup.py`, incluindo repetição com dependências já presentes | Passou; instalação com hashes, `npm ci`, pesos verificados e build |
| Backend `pytest backend/tests -q` | **16 passaram**, sem falhas ou pulos |
| Gestos `npm test` (Vitest) | **16 passaram**, sem falhas ou pulos |
| Navegador `npm run test:e2e` (Playwright/Chromium) | **6 passaram**, sem falhas ou pulos |
| TypeScript e build Vite | Passaram |
| `npm audit` após atualização do Vitest | **0 vulnerabilidades reportadas** pelo registro no momento da execução |
| Inicialização conjunta `scripts/dev.py` e `scripts/check.py` | Frontend, API, sessão, leitura SQLite e checksum passaram; encerramento por SIGTERM liberou as portas |
| Docker Compose: build de ambas as imagens | Passou, preservando TLS e hashes; usou proxy/DNS/CA autorizados da infraestrutura |
| Docker/Nginx: healthcheck, login, criar/consultar/remover tarefa e modelo local | Passaram em requisições reais ao serviço local |
| Docker no Chromium: dashboard e MediaPipe CPU com webcam sintética | Passaram, sem erros JavaScript |

## O que os testes exercitaram

Backend: autenticação, cookie de sessão, logout, origem não permitida, limite de login, validação e persistência de tarefas, normalização de fuso para UTC, comandos de chat sem LLM, histórico, importação/extração real de TXT/DOCX/PDF com texto, documentos inválidos, upload excedido, busca e referências locais, exclusão, retenção e recusa de serviços não configurados.

Provedores: SDK OpenAI com streaming e chamada estruturada de ferramenta em um substituto de teste; formato HTTP de Brave e Telegram em transporte controlado; revisão sem envio; aprovação ligada à sessão, de uso único e não reutilizável; duas aprovações não duplicam envio; erro de entrega nunca é declarado como sucesso. Isso **não** comprova autenticação, cota ou entrega por uma conta real.

Gestos: classificação de seis gestos, pontos inválidos, tempo mínimo, abertura antes de navegação, cooldown, perda da mão, pausa por punho, duas mãos, troca de painéis, arraste sem clique na soltura e bloqueio de alvos sensíveis/desativados. Inclui marcos de referência reais publicados pelo MediaPipe para positivo e dois dedos, além de quadros sintéticos.

Navegador: tarefa pela interface, tarefa pelo chat, importar e pesquisar documento, rascunho e revisão, recusa do envio sem credencial, seleção de navegação usando o despachante real de gestos, bloqueio do despachante em ação sensível, menu em tela pequena, aviso de consentimento de voz e erro claro ao negar câmera. A inferência real do MediaPipe carrega pesos/WASM locais, processa a câmera sintética e encerra o vídeo ao desligar. Os testes verificam que essa execução não envia quadros a destinos externos.

Uma captura do dashboard real está em [assets/dashboard.png](assets/dashboard.png). Não contém contas, resultados ou tarefas fictícias.

## Correções encontradas durante a validação

- O limite inicial de requisições era baixo para a sequência de operações da interface; foi ajustado para 300/minuto, mantendo limite separado de login e configuração por ambiente.
- GPU emulada do Chromium causou lentidão durante inferência e desligamento. CPU passou a ser o padrão, a inferência foi limitada a 15 FPS e o canvas deixou de ser redimensionado a cada frame. O teste de ativação e desligamento passou após o ajuste. GPU continua experimental e selecionável.
- Os horários do SQLite passaram a ser normalizados em UTC com offset na resposta.
- A auditoria npm encontrou problemas na versão inicial do runner de testes. O Vitest foi atualizado, os testes passaram novamente e a auditoria não reportou vulnerabilidades.

O pytest emite um aviso de depreciação do TestClient/HTTPX na combinação atual do Starlette; os testes executam e passam. A troca do transporte de teste pode ser feita em atualização posterior, sem suprimir verificações.

## Ainda depende de validação externa

- Webcam e mãos físicas: iluminação, anatomia, precisão, confiança e ergonomia. Os testes sintéticos não substituem essa etapa.
- Microfone real, transcrição pt-BR e síntese com vozes instaladas. O suporte varia por navegador; o reconhecimento pode depender de serviço externo do navegador.
- Chave/modelo/cota OpenAI, chave Brave e autenticação/entrega Telegram com bot e destinatário autorizados.
- Execução real no Windows/macOS. Os instaladores e runners foram escritos com caminhos e subprocessos compatíveis; a execução desta sessão ocorreu no Linux.
- Revisão/publicação da configuração do ambiente e restauração em uma nova tarefa. Salvar um rascunho não comprova publicação ou restauração.

OAuth, outros conectores, wake word, pesquisa semântica, OCR e agenda conectada estão **não implementados**, e não são registrados como testes pulados ou funcionalidades concluídas. Veja o [roteiro](ROADMAP.md).
