# Recursos e referências

O código do Jarvis foi escrito para este projeto. O repositório [holo-gestures](https://github.com/zubair-trabzada/holo-gestures), de Zubair Trabzada (MIT), serviu como referência para a experiência de pinça, histerese e processamento local. Não foram incorporados seus modelos 3D, imagens, áudios ou interface.

O modelo `hand_landmarker.task` é um modelo MediaPipe (Google, Apache-2.0), obtido do snapshot `55626ff00f6b49c649a407ffdb3cad174479c637` desse repositório. Seu SHA-256 é `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`. O instalador verifica esse valor antes de disponibilizar os pesos. Origem oficial do modelo: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task .

MediaPipe Tasks Vision e WASM: Google, Apache-2.0. Consulte [a licença](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) e a distribuição npm `@mediapipe/tasks-vision`. React: MIT. Lucide: ISC. Tailwind CSS: MIT. Vite: MIT. As licenças das dependências são fornecidas por suas distribuições. Os pesos e o runtime são servidos localmente após a instalação.

Os marcos de regressão em `frontend/src/gestures/reference-landmarks.json` foram extraídos dos arquivos `thumb_up_landmarks.pbtxt` e `victory_landmarks.pbtxt` de [MediaPipe testdata](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/testdata/vision) (Google, Apache-2.0).

Memória neural 3D: Three.js (MIT), React Three Fiber e Drei (MIT). Leitor de PDF: Mozilla PDF.js (`pdfjs-dist`, Apache-2.0). Vetores locais: scikit-learn (BSD-3-Clause), NumPy e SciPy (BSD-3-Clause). Verificação de imagens: Pillow (HPND e licenças de componentes). Consulte as licenças nas distribuições correspondentes. Nenhuma imagem da referência do usuário foi incorporada ao produto.
