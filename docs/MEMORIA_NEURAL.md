# Cérebro neural — versão 0.2

O painel **CÉREBRO NEURAL** é a nova tela inicial. O cenário usa Three.js, React Three Fiber e Drei para desenhar esferas instanciadas em profundidade real, conexões, brilho e pulsos. Ele lê o banco local do Jarvis: não depende de um array de memórias fictícias no navegador.

As esferas grandes identificam categorias e exibem seus totais. As esferas menores representam registros reais. Conexões radiais de categoria significam somente que um registro é daquele tipo; as demais relações têm justificativa no inspetor. Não interprete uma relação calculada como comprovação de um fato.

## O que entra no cérebro

- Documentos adicionados em Arquivos ou no próprio cérebro: PDF com texto selecionável, DOCX, TXT UTF-8 e Markdown.
- Imagens PNG/JPEG/WebP verificadas e vídeos MP4/WebM com pré-visualização nativa e metadados disponíveis. Não há OCR, análise visual, transcrição ou compreensão automática de vídeos; a busca usa nome e metadados dessas mídias. Codecs de vídeo dependem do navegador.
- Perguntas, respostas e pesquisas, quando o registro automático está ativado.
- Conversas, notas e projetos criados pelo proprietário.
- Assuntos derivados de termos que aparecem em pelo menos duas memórias. Não é uma classificação automática de pessoas por um modelo de NER.

Uploads continuam limitados a 10 MB, 200 páginas em PDFs e 500 mil caracteres extraídos. Os originais novos são preservados e podem ser baixados. PDFs são desenhados por **PDF.js**, página por página; textos e Markdown são apresentados sem executar HTML ou scripts. O leitor permite buscar palavras, consultar fontes e abrir registros relacionados.

## Organização e busca local

O índice gera vetores **TF-IDF + LSA**, com até 64 dimensões latentes quando o corpus tem tamanho suficiente. São embeddings calculados sobre o próprio corpus, sem baixar modelos ou enviar dados a provedores. Com poucos registros usa a representação TF-IDF diretamente. A busca combina similaridade lexical, projeção latente e cobertura dos termos, com filtros de tipo e data.

Isso não equivale a embeddings de um modelo neural pré-treinado e não garante reconhecer sinônimos sem termos ou contextos compartilhados. As relações de similaridade exigem evidência lexical e exibem os termos compartilhados. O grafo também contém relações explícitas de pergunta/resposta, conversa, projeto e fonte consultada. Comandos de navegação continuam registrados, mas não são devolvidos como resposta à própria busca recém-solicitada.

Quando a OpenAI está configurada e o proprietário ativa **Permitir que a IA consulte minhas memórias**, trechos relevantes são recuperados antes da resposta e podem ser enviados ao provedor. O nó da resposta registra as fontes realmente consultadas. Sem essa autorização, o índice continua local e o modelo não recebe documentos automaticamente.

## Como navegar

| Entrada | Ação |
| --- | --- |
| Mão aberta | Ativar navegação por gestos |
| Apontar para uma esfera | Posicionar cursor e destacar a memória |
| Uma pinça curta e soltura | Expandir o agrupamento após a janela de 450 ms |
| Duas pinças no mesmo alvo nessa janela | Abrir a memória, sem mover a câmera antes de reconhecer a segunda |
| Pinça mantida por 600 ms e movimento | Orbitar o cenário |
| Abertura intencional de polegar/indicador | Voltar um nível |
| Clique / clique duplo | Expandir / abrir |
| Arrastar mouse / roda / botão direito | Orbitar / zoom / deslocar |
| `O` | Abrir a seleção |
| `Esc` ou `Backspace` | Voltar um nível; `Esc` também interrompe voz/resposta |
| `0` ou botão de enquadramento | Voltar ao cérebro completo |

### Pinça reversa sem saída acidental

A soltura comum de uma pinça não aciona retorno. Depois da soltura, o reconhecedor bloqueia o reverso por 800 ms. Para voltar intencionalmente, mantenha polegar e indicador **meio separados** por aproximadamente 200 ms e faça uma abertura maior, contínua. A amplitude padrão é 0,75 larguras da palma e a trajetória precisa durar pelo menos 220 ms. Há cooldown de 900 ms após um retorno; manter os dedos parados não repete a ação.

O tamanho da palma normaliza as distâncias para reduzir diferenças de distância à câmera. Contato da pinça, janela dupla e amplitude reversa são ajustáveis em Configurações neurais. A câmera estima coordenadas relativas; não mede profundidade física em centímetros.

O primeiro retorno de um arquivo restaura seu agrupamento. O segundo retorna à visão global. As posições de câmera global e de agrupamento são preservadas, inclusive no estado salvo. Abrir uma memória relacionada mantém o agrupamento de origem.

## Voz

O botão de microfone do cérebro usa o mesmo consentimento e hook de voz do Jarvis. Exemplos de comandos locais, que funcionam sem chave de IA depois da transcrição:

- “Jarvis, abra seu cérebro.”
- “Jarvis, mostre suas memórias.”
- “Jarvis, encontre minha pesquisa sobre Roma.”
- “Jarvis, expanda esse neurônio.”
- “Jarvis, volte para o cérebro completo.”

O reconhecimento de fala continua sendo do navegador. Os testes verificam o caminho do texto transcrito; não comprovam captação e transcrição por microfone físico.

## Persistência, temporários e exclusão

O SQLite recebe tabelas adicionais, mantendo as tabelas anteriores. Na primeira migração, um backup local é criado em `data/backups/before-neural-v1.db`. A migração registra documentos e histórico existentes uma vez; repetir a inicialização não duplica registros nem reativa o salvamento de conversas que foi desligado.

Originais e chunks são ligados aos documentos. Arquivos novos iguais são deduplicados pelo SHA-256. Os nós têm IDs estáveis; arestas guardam tipo, intensidade e justificativa. As revisões notificam a interface por SSE, sem recarregar a página. A entrada no cenário é animada a partir da posição anterior.

Os modelos estão em `backend/app/memory/models.py`. Perguntas e respostas reutilizam `messages` e os tipos de `MemoryNode`; fontes estão nos metadados estruturados e nas arestas de origem. Conversas, chunks, preferências de gesto e estado de câmera têm armazenamento persistente. Projetos são nós ligados explicitamente pelo usuário a outras memórias. Nenhuma tabela anterior é apagada ou recriada.

**Desligar registro automático** impede novas perguntas/respostas/pesquisas no grafo, sem apagar os registros existentes. O histórico normal do chat permanece. **Conversa temporária** não grava mensagens, neurônios, pesquisa automática ou auditoria de ferramentas daquela conversa. Tarefas e rascunhos solicitados explicitamente ainda são operações reais. A sessão temporária fica só na memória do navegador.

Excluir um neurônio pede confirmação direta, fora da allowlist de gestos. Se for um arquivo, também remove o original e os chunks locais; se for pergunta/resposta/pesquisa, remove seu registro de origem. Outras memórias são mantidas. Arestas desaparecem junto com o nó. Assuntos excluídos são suprimidos para não reaparecer automaticamente. Backups anteriores não são apagados por essa operação.

Os documentos antigos da versão 0.1 tinham somente texto extraído, pois aquela versão não guardava os bytes originais. Eles aparecem no cérebro com o texto preservado. Reimporte-os para habilitar download e PDF original; não há como reconstruir o original a partir do texto.

Perguntas, respostas e pesquisas acompanham a retenção `JARVIS_HISTORY_DAYS` do Jarvis, aplicada na inicialização; documentos, notas e projetos permanecem até exclusão. Excluir um arquivo não apaga respostas ou notas já produzidas a partir dele. Esses registros podem ser excluídos separadamente.

## Desempenho e limites

O cenário usa InstancedMesh e BufferGeometry. O modo de desempenho reduz resolução, geometria, brilho e conexões; matrizes estáticas deixam de ser recalculadas depois que a transição termina. O módulo 3D carrega sob demanda, é desmontado ao mudar de painel e pausa o loop ao ocultar a aba. Câmera e voz também param ao ocultar a aba.

A visualização traz inicialmente até 1.000 memórias, com carregamento progressivo até 5.000 no recorte. Resultados de busca fora do recorte são incorporados sob demanda. O inspetor mostra relações adicionais. Não são criadas geometrias para o conteúdo inteiro dos documentos.

Existe um teste visual isolado de 1.000 nós, com aviso **TESTE SINTÉTICO · NÃO SALVO**. Ele não cria conteúdo no banco. A distribuição geométrica é determinística; ligações de similaridade em dados reais vêm do índice, nunca de sorteio de arestas. A malha de categorias do teste representa apenas o tipo atribuído a cada nó sintético.

Se WebGL falhar, a lista, busca e leitor permanecem disponíveis em modo simplificado. Reindexar um corpus grande pode levar alguns segundos; a leitura após o aquecimento é rápida. Métricas reais e limites de validação estão em [VALIDACAO_NEURAL.md](VALIDACAO_NEURAL.md).

## Atualizar no Windows sem perder dados

1. Encerre o Jarvis antigo com `Ctrl+C` na janela preta.
2. Faça uma cópia de segurança da pasta **data** e do arquivo **.env** da instalação antiga. Não compartilhe esses arquivos nem os envie ao GitHub.
3. Baixe e extraia a nova versão do repositório. Copie **data** e **.env** para a nova pasta, junto de `scripts`, `backend` e `frontend`.
4. Abra o Prompt de Comando na nova pasta e execute `py -3 scripts/setup.py`.
5. Execute `py -3 scripts/dev.py` e abra o endereço exibido na porta 5173. A migração e o backup são automáticos ao iniciar o backend.

Não copie a `.venv` ou `node_modules` da versão antiga. O instalador prepara as versões do novo lockfile. A chave OpenAI é necessária apenas para conversa livre; o cérebro, os arquivos e a busca local funcionam sem ela.
