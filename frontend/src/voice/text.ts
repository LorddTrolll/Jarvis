/** Frases curtas evitam o corte de falas longas em algumas vozes do navegador. */
export function speechChunks(text: string): string[] {
  const plain = text.replace(/```[\s\S]*?```/g, ' Trecho de código disponível na tela. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, ' link disponível na tela ')
    .replace(/[*_#`>|]/g, '').replace(/\s+/g, ' ').trim()
  const chunks: string[] = []
  let pending = plain
  while (pending.length > 220) {
    const head = pending.slice(0, 220)
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '), head.lastIndexOf('; '))
    const split = sentence >= 60 ? sentence + 1 : head.lastIndexOf(' ') > 0 ? head.lastIndexOf(' ') : 220
    chunks.push(pending.slice(0, split).trim()); pending = pending.slice(split).trim()
  }
  if (pending) chunks.push(pending)
  return chunks
}
