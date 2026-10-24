# Central Pedagógica Jarvis · versão 0.6

Abra **Professor** no painel ou use o microfone do Jarvis. Um pedido inicia um trabalho no servidor; não é necessário copiar respostas para um editor e produzir PDFs manualmente.

> Jarvis, prepare uma aula completa sobre o Império Romano para uma turma do 7º ano. Quero três aulas, explicações detalhadas, imagens, slides, dez atividades com gabarito separado e três vídeos educativos do YouTube. Organize tudo em PDF, salve no cérebro neural e prepare para compartilhar no meu grupo pessoal de ideias do WhatsApp.

Com as três APIs configuradas, esse pedido pesquisa fontes e vídeos, elabora o planejamento e passa por uma segunda revisão por IA. Depois, produz plano, sequência, resumo ilustrado, slides, atividades e gabarito separado. A interface mostra fila, pesquisa, planejamento, geração e verificação. A conclusão é anunciada por voz se as respostas por voz estiverem ativadas e o aplicativo estiver visível. A geração não exige uma segunda confirmação; o compartilhamento exige revisão e clique.

## Preparar os provedores

No `.env` da raiz, configure as variáveis e reinicie o Jarvis:

| Serviço | Variável | Operação |
| --- | --- | --- |
| OpenAI | `JARVIS_OPENAI_KEY` | Planejamento estruturado, comparação de fontes e revisão de coerência/ano |
| Brave Search | `JARVIS_SEARCH_KEY` | Fontes, trechos, títulos, URLs e consulta curricular |
| YouTube Data API v3 | `YOUTUBE_API_KEY` | Pesquisa de vídeos e consulta de metadados; alias `JARVIS_YOUTUBE_API_KEY` |

Ative a **YouTube Data API v3** no projeto Google Cloud da chave e restrinja seu uso a essa API. A chave é utilizada pelo backend; uma restrição exclusiva a referências HTTP de navegador não corresponde a esse fluxo de servidor. Não coloque chaves em variáveis `VITE_`, no chat, em capturas de tela ou no Git. As cotas/cobranças pertencem aos respectivos provedores. As preferências de escola e professor são aplicadas localmente aos PDFs; não são enviadas no planejamento da IA. Tema, ano, adaptações e trechos de fontes são enviados.

O estado **chave configurada** não significa que o acesso foi autenticado. Pesquisa web e YouTube mostram **consultado** depois de uma resposta real ou **indisponível** após falha. Sem chave, não são exibidos resultados de demonstração. Sem IA, a geração pedagógica falha de modo explícito; **PDF a partir de um texto próprio** continua funcionando.

Documentação dos contratos: [YouTube search.list](https://developers.google.com/youtube/v3/docs/search/list), [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [Brave Search](https://api-dashboard.search.brave.com/app/documentation/web-search).

## Pesquisa e materiais

Em **Pesquisar**, selecione fontes web, YouTube ou ambos. O serviço prioriza domínios institucionais conhecidos, identifica origem e horário da consulta e permite comparar os trechos com IA. A comparação distingue ressalvas e divergências; ela não representa leitura integral das páginas nem verificação humana dos fatos. Os resultados podem ser salvos no cérebro ou usados como pesquisa de um novo material.

YouTube usa somente `search.list` e `videos.list`, com busca por tema/ano, português e `safeSearch=strict`. A seleção exige metadados de idioma português, vídeo público e incorporável, filtra restrição etária para os anos atendidos e limita a duração. Títulos, canais, URLs, duração e miniaturas vêm dos IDs retornados. Conteúdo pedagógico e faixa etária ainda exigem conferência docente. Vídeos sem idioma declarado podem ser omitidos. Se houver menos vídeos que o pedido, isso aparece como ressalva; não são inventados resultados. O serviço não baixa vídeos nem obtém legendas/transcrições.

Em **Criar material**, informe tema, disciplina, ano, número de aulas/atividades/vídeos e escolha os arquivos. Há plano, sequência, resumo, slides, atividades, avaliação, gabarito, mapa mental, caça-palavras, material adaptado e desenho para colorir. As atividades podem ser objetivas, discursivas ou mistas. Em **Preferências**, salve escola, professor, bimestre, turma padrão, quantidades, estilo dos slides e adaptações recorrentes. O modelo recebe as adaptações solicitadas; o PDF adaptado acrescenta fonte ampliada e espaçamento. Esse recurso exige revisão de adequação individual pelo docente.

Quando BNCC é solicitada, há uma busca curricular adicional em fontes governamentais. Códigos só permanecem no material quando presentes em trechos de fonte institucional consultada. Sem evidência suficiente, o material identifica a necessidade de conferir a habilidade. Isso não certifica alinhamento curricular completo.

Os arquivos são PDFs reais com texto selecionável, fonte Vera incorporada, cabeçalho escolar, paginação e campos de identificação nas atividades. Planos e atividades usam A4; slides usam 16:9. Diagramas, mapa mental e ilustrações são vetores originais, não imagens históricas ou científicas de terceiros. O caça-palavras inclui solução no gabarito separado. Conteúdo de fontes e modelos é tratado como texto, com escape antes da composição; URLs não retornadas pela pesquisa e códigos curriculares sem evidência são removidos. Planos, resumos e slides incluem as referências e links reais disponíveis.

A verificação confere PDFs legíveis por pypdf, páginas não vazias, limites, quantidades, numeração, alternativas e gabaritos estruturados. Uma segunda consulta de IA revisa coerência de respostas e adequação ao ano; falhas graves apontadas interrompem a geração. Nenhuma dessas verificações substitui a revisão docente. Limites: 1–10 aulas, 1–40 atividades, 0–8 vídeos; até 10 MB e 200 páginas por arquivo; texto próprio até 40 mil caracteres. Há um trabalho em execução por processo e até dez trabalhos na fila. Use **Cancelar**, **Interromper tudo** para o trabalho acompanhado ou “cancele a preparação”.

## Cérebro, versões e dispositivos

O planejamento, a pesquisa utilizada, os PDFs em bytes, seus identificadores/hash e as revisões ficam no SQLite do backend. Ao salvar, a disciplina e o planejamento recebem nós persistidos e os PDFs recebem registros reais de documento, originais e trechos. Vídeos e páginas são referências vinculadas, sem fingir que houve download. A rede recebe a revisão do banco pelo mecanismo já existente. Os gestos de pinça, pinça dupla e abertura reversa continuam iguais. No leitor de um material, **Abrir na Central Pedagógica** recupera os arquivos associados.

Em **Histórico**, busque por tema, abra o material, baixe arquivos individuais ou o ZIP completo e consulte versões. **Editar planejamento** permite corrigir texto, questões, respostas e slides, gerando uma revisão nova; os PDFs anteriores permanecem disponíveis. A edição manual passa por validação estrutural e sanitização de links/códigos e requer revisão docente, sem uma nova chamada à IA. A revisão por IA descrita acima corresponde à geração inicial.

Para recuperar por voz: “Jarvis, recupere a aula salva sobre Império Romano”. A resposta local abre o material encontrado, sem enviar seu conteúdo para a IA. O mesmo backend atende todas as sessões: um celular conectado a ele consulta a mesma memória do computador. Instalar servidores independentes em duas máquinas cria núcleos distintos. Não há conectores Alexa ou Smart TV nesta entrega. Acesso remoto exige a configuração de senha, origem e HTTPS já descrita no README; voz e Web Share dependem do navegador/dispositivo.

O salvamento automático pode ser desligado nas preferências. O controle geral do cérebro é respeitado no padrão; um pedido explícito de salvamento ou o botão **Salvar no cérebro** permite salvar o material escolhido. Trabalhos e pesquisas sem vínculo ao cérebro seguem `JARVIS_HISTORY_DAYS`, com limpeza na inicialização; os materiais vinculados permanecem até exclusão explícita. Excluir um material remove seus PDFs gerados do servidor e os registros de documento correspondentes, preservando arquivos ainda usados por outro material. Downloads, cópias compartilhadas e backups de migração existentes permanecem fora dessa exclusão. **Apagar dados** remove também os registros do módulo, com bloqueio enquanto há trabalho ativo.

A primeira abertura de um banco da versão anterior cria `data/backups/before-education-v1.db` e acrescenta tabelas, sem recriar o banco. Trabalhos interrompidos pelo encerramento são marcados como falhos e podem ser retomados por uma ação explícita; não há reenvio automático de pedidos faturáveis.

## Compartilhar no WhatsApp pessoal

1. Conclua e salve o material no cérebro; selecione o PDF que deseja compartilhar.
2. Abra **Revisar e compartilhar**. Confira a prévia, ajuste a mensagem e marque a revisão. Gabaritos recebem aviso próprio.
3. Use **Preparar compartilhamento** para carregar os bytes do PDF e registrar a preparação.
4. Em dispositivo compatível, **Escolher aplicativo e grupo** chama `navigator.share` diretamente no clique. Escolha WhatsApp, selecione seu grupo e confirme no próprio aplicativo.
5. Quando não há suporte a arquivos na Web Share API, use **Baixar PDF para anexar** e compartilhe manualmente.

O reconhecimento de voz prepara o trabalho; ele não seleciona o grupo ou dispara a função nativa sem clique. No celular, normalmente é necessário HTTPS. Os estados registrados são preparação, abertura, retorno do sistema, cancelamento, falha ou download solicitado. O retorno de `navigator.share` **não é comprovante de entrega**; não existe estado “enviado” neste serviço. A memória e os originais permanecem disponíveis independentemente do resultado. Não há scraping, captura de sessão, bibliotecas não oficiais de WhatsApp ou dependência de WhatsApp Business.

## Arquitetura e validação

Os serviços ficam em `backend/app/education`: `YouTubeResearchService`, `WebResearchService`, `LessonPlanner`, `DocumentGenerationService`, `KnowledgeHub` e `WhatsAppShareService`. Os endpoints `/api/education/*` usam a sessão, validação de origem e limites existentes. As miniaturas são verificadas e servidas pelo backend; nenhuma chave é exposta ao cliente. A interface React é carregada sob demanda e reutiliza o leitor PDF.js.

Os testes de backend substituem somente serviços externos por respostas explicitamente de teste. O cenário completo acima passa pelo interpretador, contratos YouTube/OpenAI, pesquisa, revisão, geração real de PDFs, salvamento e recuperação. Há verificações de falhas, cancelamento, persistência, revisões, exclusão e estados de compartilhamento. No navegador, o PDF é realmente gerado e desenhado em canvas; o compartilhador nativo é substituído apenas para conferir o contrato de passagem de arquivo. Autenticação/cota real dos provedores, microfone/webcam físicos e entrega no WhatsApp não foram verificados neste ambiente sem credenciais.
