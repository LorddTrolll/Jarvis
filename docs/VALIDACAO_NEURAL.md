# Validação do cérebro neural — versão 0.2

Executada em 24/10/2026 no Linux x86_64, Python 3.12, Node.js 24 e Chromium headless. Esta entrega preserva o Jarvis 0.1 e acrescenta memória persistente, visualização 3D e uma máquina de gestos específica. As credenciais reais de serviços externos não foram usadas.

| Verificação | Resultado |
| --- | --- |
| Backend, incluindo regressões anteriores | **28 passaram**, sem pulos |
| Classificação, máquina temporal e navegação | **27 passaram**, sem pulos |
| Bateria completa de navegador, antiga e neural | **12 passaram**, sem pulos |
| Retorno ao agrupamento após recarregar arquivo aberto | Passou em reexecução específica após persistir as posições de câmera |
| 1.000 nós, câmera sintética e desligamento | Passou em reexecução específica do teste de desempenho |
| TypeScript e build Vite | Passaram; módulo 3D carrega sob demanda |
| Instalador repetido com os novos lockfiles | Passou |
| Auditoria npm | 0 vulnerabilidades reportadas no momento da execução |
| Docker: build de frontend/backend | Passou, com TLS, hashes e CA autorizada do ambiente |
| Docker/Nginx no Chromium | Login, grafo persistente e PDF.js original com pixels desenhados passaram, sem erros JavaScript/WebGL |

São **67 casos automatizados distintos**. As reexecuções específicas não são contadas novamente.

## Memória e segurança verificadas

- Importação de arquivo, original preservado, chunks, hash e deduplicação.
- Nós estáveis depois de reabrir o aplicativo e migração de banco da versão anterior com backup local.
- Reimportação de documento legado recupera original sem duplicar o nó e emite nova revisão.
- Pergunta ligada à resposta e à conversa; fontes ligadas à resposta quando realmente consultadas.
- Similaridade calculada entre documentos relacionados e ausência de vínculo calculado com documento sem termos relacionados no cenário testado.
- Busca local com justificativa e retorno de trecho; comando transcrito percorre o mesmo caminho usado pela voz.
- Consentimento de documentos: sem autorização, marcador privado do documento não entra no contexto da IA; com autorização, o contexto e a fonte são registrados.
- Conversa temporária não grava perguntas/respostas/pesquisas; desligar salvamento automático não apaga dados anteriores.
- Falha simulada ao salvar preferências não apresenta o salvamento automático como desligado; o estado anterior é preservado e o erro aparece na interface.
- Exclusão do registro e arestas, sem apagar outras memórias; originais protegidos por autenticação.
- Visualizador PDF.js real, texto pesquisável, mouse/clique duplo, agrupamento, arquivo e retorno.
- Gestos sintéticos: janela dupla, alvo estável, clique simples adiado, pinça sustentada, reverso intencional e ausência de retorno na soltura comum.
- Layout em tela pequena e funcionamento com câmera negada.

## Desempenho medido

Cenário de **1.000 nós sintéticos + categorias**, resolução de janela **1536 × 1000**, Chromium headless com **SwiftShader**, modo de desempenho, execução com rastreamento do Playwright. A amostra é identificada na interface e não é gravada no banco.

- Amostras de FPS: **22, 23, 24, 23**.
- Média dessas amostras: **23 FPS**.
- O teste exige pelo menos 15 FPS e depois ativa/desativa uma câmera sintética enquanto o grafo permanece aberto.
- Isso não é uma garantia de FPS em qualquer computador. O modo visual completo custa mais; em GPU emulada ficou abaixo do modo de desempenho. Use o modo de desempenho em máquinas modestas.

O benchmark do índice usou **1.000 registros sintéticos em um banco SQLite temporário**, sem tocar nos dados do proprietário:

- Construção do índice e relações: **6.2083 segundos**.
- Busca com índice aquecido: **6.22 ms**, com 20 resultados.

Arquivos de resultados: [renderização](assets/neural-performance.json) e [índice](assets/neural-index-performance.json). Para reproduzir o índice: `.venv/bin/python scripts/benchmark_neural.py`. Os resultados dependem do corpus, hardware e carga concorrente. A reindexação ainda ocorre por revisão de corpus; não é prometida latência constante ao crescer indefinidamente.

## Problemas corrigidos durante os testes

- Uma atualização do grafo podia chegar antes de inicializar a posição de um novo nó. A inicialização agora é segura durante o frame.
- A busca estava favorecendo o próprio comando recém-registrado. Comandos de busca são identificados e a pontuação considera cobertura dos termos relevantes.
- O painel de câmera interceptava botões do inspetor em certas alturas; a disposição foi ajustada.
- Geometria e brilho custavam FPS na GPU emulada. O modo de desempenho usa geometria menor e evita recalcular matrizes estáticas.
- O Nginx entregava `.mjs` como `application/octet-stream`. Foi adicionado o tipo JavaScript para os assets de módulo, mantendo `nosniff` e a política de segurança. A renderização PDF foi revalidada no Docker.
- A posição anterior do agrupamento precisava sobreviver a recarregar a página. Câmeras de agrupamento/global passaram a integrar o estado persistido.

## Limites da validação

Webcam sintética, marcos de referência e sequências sintéticas não comprovam ergonomia com mãos físicas. Microfone e transcrição pt-BR reais continuam dependendo do navegador e do dispositivo. A versão 0.1 foi instalada pelo proprietário no Windows; a nova versão neural foi automatizada nesta sessão Linux e precisa do teste físico no Windows.

O índice local é TF-IDF/LSA, não um modelo neural pré-treinado. Não há NER de pessoas, OCR, análise visual ou transcrição de vídeos. As relações são evidências calculadas ou vínculos explícitos, não fatos inferidos garantidos. OpenAI, Brave e Telegram reais continuam dependendo de credenciais e testes autorizados.

Há um aviso de tamanho do chunk 3D no build e um aviso de depreciação TestClient/HTTPX do Starlette; nenhum impediu a execução. Os módulos 3D/PDF carregam sob demanda. Não foram desativadas verificações TLS, hashes, permissões ou asserções para obter aprovação.

Salvar instruções no rascunho da nuvem não publica o ambiente nem comprova restauração em uma nova tarefa. A publicação do ambiente é separada do envio do código ao GitHub.
