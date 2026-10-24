# Evolução do Jarvis

O escopo desta entrega é um primeiro produto utilizável, sem depender de credenciais para desenvolver a interface, tarefas, documentos e gestos. O prompt original descreve um produto maior; esta lista mantém explícitas as partes ainda não realizadas.

1. **Validação com o proprietário:** webcam e microfone reais, ergonomia da pinça, mão dominante, aceleração em máquinas mais lentas; autenticação de OpenAI, Brave e Telegram com suas próprias credenciais.
2. **Voz local:** adaptadores de transcrição e síntese locais; detecção de silêncio configurável; palavra de ativação somente após implementação e testes. Hoje o ditado é do navegador e exige clique.
3. **Conhecimento:** a versão 0.2 já tem cérebro persistente e vetores locais TF-IDF/LSA. Próximos passos: embeddings pré-treinados opcionais, citação por página, OCR e análise visual/transcrição de mídias.
4. **Agenda:** eventos locais, lembretes em segundo plano e depois Calendar via OAuth. Hoje há tarefas com prazos e alertas no painel aberto.
5. **Conectores:** OAuth com armazenamento criptografado, escopos mínimos e revogação; uma integração oficial por vez. Primeiro Gmail/Calendar, depois provedores compatíveis. Instagram/Facebook exigem modalidade de conta e permissões aprovadas. WhatsApp pessoal não equivale a WhatsApp Business Platform.
6. **Comunicação:** caixa de entrada, mensagens recebidas, convites, posts e revisões específicas por ação. Hoje há rascunhos e envio Telegram Bot API, além do compartilhamento assistido de PDFs pela Web Share API na Central Pedagógica. O usuário escolhe o aplicativo/grupo; não há entrega WhatsApp verificável pelo Jarvis.
7. **Operação:** migrações de banco, PostgreSQL, autenticação apropriada para múltiplos usuários, armazenamento seguro compartilhado de sessões, auditoria ampliada e implantação HTTPS revisada.

Não há scraping privado, captura de cookies, senhas de redes sociais ou automação para contornar APIs. Novos conectores devem apresentar suas capacidades reais e falhar claramente quando faltarem permissões.

A versão 0.6 já implementa pesquisa YouTube Data API v3, comparação de trechos Brave com IA, planejamento pedagógico, PDFs ReportLab, histórico de revisões e armazenamento dos materiais no cérebro. Para validar contas reais, ainda são necessárias as chaves e cotas dos provedores; veja [CENTRAL_PEDAGOGICA.md](CENTRAL_PEDAGOGICA.md).
