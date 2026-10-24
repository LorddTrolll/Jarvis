import { describe, expect, it } from 'vitest'
import { speechChunks } from './text'

describe('fala legível em respostas longas', () => {
  it('remove marcação e referências visuais sem ler código ou URLs', () => {
    expect(speechChunks('## Olá **Lucas**. [Fonte](https://example.com). ```js\nsecret()\n```')).toEqual(['Olá Lucas. Fonte. Trecho de código disponível na tela.'])
  })
  it('divide textos sem perder palavras e respeita o limite por fala', () => {
    const text = 'Uma frase em português que continua sem pontuação '.repeat(50).trim()
    const chunks = speechChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.length <= 220)).toBe(true)
    expect(chunks.join(' ')).toBe(text)
    expect(speechChunks('')).toEqual([])
  })
})
