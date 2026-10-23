# Guia de gestos

A câmera é ativada somente pelo botão direto da interface e pela permissão do navegador. O vídeo não é enviado ao backend. MediaPipe Hand Landmarker estima até duas mãos, cada uma com 21 pontos, desenhados sobre o vídeo espelhado.

Use boa iluminação, mantenha toda a mão no enquadramento e separe os dedos. O cursor usa o indicador da primeira mão detectada; a troca de mão dominante ainda não é estabilizada por identidade. Comece com uma mão apenas.

| Gesto | Ação |
| --- | --- |
| Mão aberta, estável | Ativar navegação |
| Indicador estendido | Mover cursor suavizado |
| Pinça curta, estável, seguida de soltura | Selecionar o elemento permitido sob o cursor |
| Pinça mantida por pelo menos 450 ms + deslocamento | Arrastar o cartão de calibração na área Visão e gestos |
| Mão fechada | Pausar navegação e interromper voz/resposta |
| Dois dedos (indicador e médio) | Abrir painel escolhido na calibração |
| Positivo | Selecionar uma ação permitida sob o cursor |
| Movimento lateral da mão aberta | Alternar painel |
| Movimento vertical da mão aberta | Rolar a área principal |
| Duas mãos abertas | Voltar ao centro de comando |

O arraste desta versão é limitado ao cartão explicitamente marcado para calibração. Não é um gerenciador arbitrário de janelas ou do sistema operacional.

## Prevenção de ações acidentais

- Gesto estável por 180 ms e cooldown de 1 segundo para ações repetidas.
- Pinça proporcional à largura da palma, com histerese entre entrada e soltura.
- Seleção acontece ao soltar uma pinça curta; pinça longa ou perda da mão não vira clique.
- Navegação desativa após 600 ms sem detecção. Mostre a mão aberta novamente.
- Filtro de suavização do cursor e confiança mínima de 0,65 para o detector.
- Somente alvos com `data-gesture-safe="true"` podem receber cliques.
- Qualquer ancestral `data-sensitive="true"` bloqueia seleção. Todos os diálogos bloqueiam gestos.
- Ativar câmera/microfone, enviar, aprovar, excluir e alterar permissões não estão na allowlist.

Em **Visão e gestos**, ajuste a sensibilidade da pinça, a suavização e o painel de dois dedos. As preferências ficam no navegador. Se houver tremor, reduza o valor de suavização; se a pinça exigir contato excessivo, aumente gradualmente o limiar. O botão Restaurar calibração retorna aos padrões.

CPU é o padrão para compatibilidade. Há opção experimental de GPU; desligue e reative a câmera após mudar. O loop limita inferências a 15 FPS para reservar tempo de interação e não redimensiona o canvas a cada frame. O FPS exibido mede as inferências efetivas, não a taxa nominal da câmera.

Os limiares são heurísticas iniciais. Os testes incluem quadros sintéticos e marcos de referência do MediaPipe para positivo e dois dedos. Uma câmera sintética valida inicialização e inferência sem mãos; a ergonomia com diferentes mãos e webcams exige teste físico.
