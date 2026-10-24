# Validação do cérebro principal — versão 0.5

Executada em 24/10/2026 no Linux, Python 3.12, Node.js 24 e Chromium headless. Todos os dados usados são de bancos temporários; nenhum arquivo do proprietário foi acessado.

| Verificação | Resultado |
| --- | --- |
| Backend, incluindo conclusão de tarefas, importação antiga, deduplicação e exclusão | **43 passaram** |
| Gestos, navegação, fala e correspondência do layout com os registros | **31 passaram** |
| Bateria completa do navegador | **20 passaram** |
| TypeScript e build de produção | Passaram |
| Entrada direta pelo iniciador e frontend compilado | Passaram: cérebro principal, tarefa legada, leitor e retorno, sem erros de JavaScript/console |

São **94 testes distintos**. Reexecuções não são contadas novamente. Os avisos já documentados de TestClient/HTTPX e tamanho do módulo 3D continuam presentes, sem testes desativados para ocultá-los.

O teste de tarefa conclui uma atividade pela interface, verifica a memória criada pelo backend, recebe sua atualização no cérebro principal, aproxima a câmera e abre o registro pelo rótulo do neurônio. Após recarregar, verifica que os identificadores desenhados correspondem exatamente aos identificadores do grafo salvo. A agenda e o leitor não usam uma cópia fictícia dos dados.

O teste de visualização cria **120 notas e cinco tarefas concluídas** pelas APIs. O índice deriva assuntos reais desses conteúdos, totalizando **149 registros** nessa captura. As conexões vêm do índice local e os títulos são marcados como TESTE. A tela principal e o explorador foram capturados e inspecionados em 1536×1000. Não são dados reais do proprietário, nem são inseridos na instalação normal.

A rede persistida passou pela verificação de pelo menos 15 FPS no cenário de teste. A suavização MSAA inicialmente reduzia a fluidez no renderizador de software; foi desativada, mantendo esferas, pulsação e texto legível. O teste separado de **1.000 nós sintéticos** no modo de desempenho também passou, com ativação e desligamento da câmera sintética. Isso descreve o ambiente de teste, não uma garantia de desempenho de hardware físico.

A migração de tarefas foi verificada em duas inicializações: não duplica registros nem inventa o horário de conclusão de uma tarefa antiga. Foram verificadas reabertura/reconclusão, remoção da agenda e supressão de uma memória removida. Posições antigas de câmera são marcadas com a versão do layout para preservar as novas posições após a atualização.

No fluxo compilado, um banco temporário recebeu uma tarefa já concluída antes de o iniciador subir. A versão 0.5 abriu o cérebro diretamente, mostrou o registro importado e seu texto de data antiga desconhecida. O processo foi encerrado pelo iniciador ao fim do teste.

Voz e câmera usam substitutos explícitos ou dispositivos sintéticos nos testes. Mãos físicas, alto-falantes, microfone e execução física do Edge no Windows continuam dependendo da conferência no computador do proprietário. Clima, contas externas e seus limites permanecem como documentados na versão anterior; não houve autenticação real desses serviços nesta atualização. Docker não foi reconstruído e nenhuma dependência nova foi adicionada.
