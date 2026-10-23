# Evolução do Jarvis

O escopo desta entrega é um primeiro produto utilizável, sem depender de credenciais para desenvolver a interface, tarefas, documentos e gestos. O prompt original descreve um produto maior; esta lista mantém explícitas as partes ainda não realizadas.

1. **Validação com o proprietário:** webcam e microfone reais, ergonomia da pinça, mão dominante, aceleração em máquinas mais lentas; autenticação de OpenAI, Brave e Telegram com suas próprias credenciais.
2. **Voz local:** adaptadores de transcrição e síntese locais; detecção de silêncio configurável; palavra de ativação somente após implementação e testes. Hoje o ditado é do navegador e exige clique.
3. **Conhecimento:** embeddings locais, índice vetorial, citação por página, OCR opcional e melhor tratamento de tabelas/documentos grandes. Hoje a busca é por termos, com posição do trecho.
4. **Agenda:** eventos locais, lembretes em segundo plano e depois Calendar via OAuth. Hoje há tarefas com prazos e alertas no painel aberto.
5. **Conectores:** OAuth com armazenamento criptografado, escopos mínimos e revogação; uma integração oficial por vez. Primeiro Gmail/Calendar, depois provedores compatíveis. Instagram/Facebook exigem modalidade de conta e permissões aprovadas. WhatsApp pessoal não equivale a WhatsApp Business Platform.
6. **Comunicação:** caixa de entrada, mensagens recebidas, convites, posts e revisões específicas por ação. Hoje apenas rascunhos e envio Telegram Bot API estão implementados.
7. **Operação:** migrações de banco, PostgreSQL, autenticação apropriada para múltiplos usuários, armazenamento seguro compartilhado de sessões, auditoria ampliada e implantação HTTPS revisada.

Não há scraping privado, captura de cookies, senhas de redes sociais ou automação para contornar APIs. Novos conectores devem apresentar suas capacidades reais e falhar claramente quando faltarem permissões.
