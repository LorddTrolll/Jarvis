import { describe, expect, it, vi } from 'vitest'
import { classify, GestureEngine } from './engine'
import type { Point } from './engine'
import { clickFromGesture, gestureTarget } from './dispatch'
import referenceLandmarks from './reference-landmarks.json'

function hand(type: string, shiftX = 0, shiftY = 0): Point[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }))
  points[0] = { x: 0.5, y: 0.9 }
  points[1] = { x: 0.36, y: 0.8 }; points[2] = { x: 0.3, y: 0.75 }
  points[3] = { x: 0.28, y: 0.7 }; points[4] = { x: 0.24, y: 0.64 }
  for (const [i, base] of [5, 9, 13, 17].entries()) {
    const x = 0.38 + i * 0.11
    points[base] = { x, y: 0.63 }
    points[base + 1] = { x, y: 0.5 }
    points[base + 2] = { x, y: 0.4 }
    const extended = type === 'open' || type === 'point' && i === 0 || type === 'peace' && i < 2 || type === 'pinch' && i > 0
    points[base + 3] = { x, y: extended ? 0.25 : 0.73 }
  }
  if (type === 'pinch') { points[8] = { x: 0.31, y: 0.52 }; points[4] = { x: 0.29, y: 0.52 } }
  if (type === 'thumbs_up') points[4] = { x: 0.28, y: 0.26 }
  return points.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }))
}

describe('classificação geométrica', () => {
  it('reconhece marcos de referência reais publicados pelo MediaPipe', () => {
    expect(classify(referenceLandmarks.thumb)).toBe('thumbs_up')
    expect(classify(referenceLandmarks.victory)).toBe('peace')
  })
  for (const gesture of ['open', 'fist', 'point', 'pinch', 'peace', 'thumbs_up'] as const) {
    it(`reconhece ${gesture}`, () => expect(classify(hand(gesture))).toBe(gesture))
  }
  it('rejeita frames incompletos e coordenadas inválidas', () => {
    expect(classify([])).toBe('unknown')
    const invalid = hand('open'); invalid[0].x = NaN
    expect(classify(invalid)).toBe('unknown')
  })
})

describe('máquina de estados', () => {
  it('exige abertura estável antes de qualquer seleção', () => {
    const engine = new GestureEngine()
    engine.update([hand('pinch')], 0)
    expect(engine.update([hand('pinch')], 220).actions).toEqual([])
    engine.update([hand('open')], 240)
    expect(engine.update([hand('open')], 300).active).toBe(false)
    expect(engine.update([hand('open')], 440).active).toBe(true)
    engine.update([hand('pinch')], 500)
    expect(engine.update([hand('pinch')], 700).actions).not.toContain('click')
    expect(engine.update([hand('point')], 820).actions).toContain('click')
  })
  it('não clica ao perder a mão, nem depois do timeout', () => {
    const engine = new GestureEngine()
    engine.update([hand('open')], 0); engine.update([hand('open')], 200)
    engine.update([hand('pinch')], 250); engine.update([hand('pinch')], 450)
    expect(engine.update([], 500).actions).not.toContain('click')
    expect(engine.update([], 1200).active).toBe(false)
  })
  it('mão fechada pausa e exige reativação', () => {
    const engine = new GestureEngine()
    engine.update([hand('open')], 0); engine.update([hand('open')], 200)
    engine.update([hand('fist')], 250)
    const frame = engine.update([hand('fist')], 500)
    expect(frame.actions).toContain('pause'); expect(frame.active).toBe(false)
  })
  it('aplica cooldown ao atalho de dois dedos', () => {
    const engine = new GestureEngine()
    engine.update([hand('open')], 0); engine.update([hand('open')], 200)
    engine.update([hand('peace')], 250)
    expect(engine.update([hand('peace')], 500).actions).toContain('tools')
    expect(engine.update([hand('peace')], 700).actions).not.toContain('tools')
  })
  it('duas mãos abertas voltam ao início e movimento lateral alterna painéis', () => {
    const engine = new GestureEngine()
    engine.update([hand('open')], 0); engine.update([hand('open')], 200)
    expect(engine.update([hand('open', 0.3)], 400).actions).toContain('previous')
    expect(engine.update([hand('open'), hand('open', -0.3)], 1600).actions).toContain('home')
  })
  it('pinça mantida arrasta, soltura não gera clique', () => {
    const engine = new GestureEngine({ smoothing: 1 })
    engine.update([hand('open')], 0); engine.update([hand('open')], 200)
    engine.update([hand('pinch')], 250); engine.update([hand('pinch')], 450)
    expect(engine.update([hand('pinch', 0.12)], 1000).actions).toContain('drag_start')
    const end = engine.update([hand('point', 0.12)], 1100)
    expect(end.actions).toContain('drag_end'); expect(end.actions).not.toContain('click')
  })
})

describe('barreira de ações sensíveis', () => {
  function root(sensitive: boolean, disabled = false) {
    const target = { closest: vi.fn(() => sensitive ? {} : null), matches: () => disabled, getAttribute: () => null, click: vi.fn(), focus: vi.fn() }
    return { target, root: { elementFromPoint: () => ({ closest: () => target }) } }
  }
  it('nega alvo sensível e desativado mesmo dentro de uma allowlist', () => {
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 700 })
    const protectedElement = root(true)
    expect(gestureTarget({ x: .5, y: .5 }, protectedElement.root as unknown as Document)).toBeNull()
    const disabled = root(false, true)
    expect(gestureTarget({ x: .5, y: .5 }, disabled.root as unknown as Document)).toBeNull()
  })
  it('executa seleção somente no alvo permitido', () => {
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 700 })
    const safe = root(false)
    vi.stubGlobal('document', safe.root)
    expect(clickFromGesture({ x: .5, y: .5 })).toBe(true)
    expect(safe.target.click).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
