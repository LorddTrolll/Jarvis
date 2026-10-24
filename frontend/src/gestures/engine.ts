export interface Point { x: number; y: number; z?: number }
export type Gesture = 'open' | 'fist' | 'point' | 'pinch' | 'peace' | 'thumbs_up' | 'unknown'
export type GestureAction = 'click' | 'drag_start' | 'drag' | 'drag_end' | 'pause' | 'tools' | 'confirm' | 'home' | 'next' | 'previous' | 'scroll_up' | 'scroll_down'
export interface GestureFrame { gesture: Gesture; active: boolean; cursor: Point | null; actions: GestureAction[]; hands: number; measurement?: { ratio: number; tip: Point; scale: number } }
export interface GestureConfig { pinchThreshold: number; holdMs: number; cooldownMs: number; smoothing: number; confidence: number; delegate: 'CPU' | 'GPU' }
export const DEFAULT_CONFIG: GestureConfig = { pinchThreshold: 0.28, holdMs: 180, cooldownMs: 1000, smoothing: 0.3, confidence: 0.65, delegate: 'CPU' }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function classify(points: Point[], threshold = DEFAULT_CONFIG.pinchThreshold): Gesture {
  if (points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return 'unknown'
  const size = distance(points[5], points[17])
  if (size < 0.025) return 'unknown'
  const extended = [8, 12, 16, 20].map((tip) => distance(points[tip], points[0]) > distance(points[tip - 2], points[0]) * 1.15)
  if (distance(points[4], points[8]) / size < threshold) return 'pinch'
  const count = extended.filter(Boolean).length
  if (count === 4) return 'open'
  if (count === 0 && points[4].y < points[3].y - size * 0.3 && points[4].y < points[5].y - size * 0.3) return 'thumbs_up'
  if (count === 0) return 'fist'
  if (extended[0] && count === 1) return 'point'
  if (extended[0] && extended[1] && count === 2) return 'peace'
  return 'unknown'
}

export class GestureEngine {
  config: GestureConfig
  active = false
  private candidate: Gesture = 'unknown'
  private candidateAt = 0
  private lastSeen = -Infinity
  private lastAction = -Infinity
  private cursor: Point | null = null
  private pinchAt: number | null = null
  private pinchOrigin: Point | null = null
  private dragging = false
  private motionOrigin: Point | null = null
  private motionAt = 0

  constructor(config: Partial<GestureConfig> = {}) { this.config = { ...DEFAULT_CONFIG, ...config } }

  reset() {
    this.active = false; this.candidate = 'unknown'; this.cursor = null
    this.pinchAt = null; this.pinchOrigin = null; this.dragging = false; this.motionOrigin = null
  }

  update(hands: Point[][], now: number): GestureFrame {
    const actions: GestureAction[] = []
    if (!hands.length) {
      if (this.dragging) actions.push('drag_end')
      this.pinchAt = null; this.dragging = false; this.cursor = null; this.motionOrigin = null
      this.candidate = 'unknown'
      if (now - this.lastSeen > 600) this.active = false
      return { gesture: 'unknown', active: this.active, cursor: null, actions, hands: 0 }
    }
    this.lastSeen = now
    const hand = hands[0]
    // Histerese para evitar alternância rápida perto do limiar da pinça.
    const gesture = classify(hand, this.config.pinchThreshold * (this.pinchAt !== null ? 1.4 : 1))
    if (gesture !== this.candidate) { this.candidate = gesture; this.candidateAt = now }
    const stable = now - this.candidateAt >= this.config.holdMs
    const canAct = now - this.lastAction >= this.config.cooldownMs
    const emit = (action: GestureAction) => { actions.push(action); this.lastAction = now }
    if (hands.length > 1 && gesture === 'open' && classify(hands[1]) === 'open' && stable && canAct) emit('home')
    if (gesture === 'open' && stable) this.active = true
    if (gesture === 'fist' && stable) {
      if (this.active) emit('pause')
      this.active = false
    }
    const raw = { x: 1 - hand[8].x, y: hand[8].y }
    if (this.active && ['point', 'pinch'].includes(gesture)) {
      const alpha = this.config.smoothing
      this.cursor = this.cursor ? { x: this.cursor.x + (raw.x - this.cursor.x) * alpha, y: this.cursor.y + (raw.y - this.cursor.y) * alpha } : raw
    }
    if (this.active && gesture === 'pinch' && stable) {
      if (this.pinchAt === null) { this.pinchAt = now; this.pinchOrigin = this.cursor ? { ...this.cursor } : raw }
      if (this.pinchOrigin && this.cursor && now - this.pinchAt > 450 && distance(this.pinchOrigin, this.cursor) > 0.025) {
        if (!this.dragging) { actions.push('drag_start'); this.dragging = true }
        actions.push('drag')
      }
    } else if (this.pinchAt !== null) {
      if (this.dragging) actions.push('drag_end')
      else if (this.active && now - this.pinchAt < 900 && canAct && ['point', 'open'].includes(gesture)) emit('click')
      this.pinchAt = null; this.dragging = false
    }
    if (this.active && stable && canAct) {
      if (gesture === 'peace') emit('tools')
      if (gesture === 'thumbs_up') emit('confirm')
    }
    if (this.active && gesture === 'open' && hands.length === 1) {
      const center = { x: 1 - hand[9].x, y: hand[9].y }
      if (!this.motionOrigin || now - this.motionAt > 900) { this.motionOrigin = center; this.motionAt = now }
      const dx = center.x - this.motionOrigin.x, dy = center.y - this.motionOrigin.y
      if (stable && canAct && Math.abs(dx) > 0.22 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        emit(dx > 0 ? 'next' : 'previous'); this.motionOrigin = null
      } else if (stable && canAct && Math.abs(dy) > 0.22 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        emit(dy > 0 ? 'scroll_down' : 'scroll_up'); this.motionOrigin = null
      }
    } else this.motionOrigin = null
    const scale = Math.max(.001, distance(hand[5], hand[17]))
    return { gesture, active: this.active, cursor: this.active ? this.cursor : null, actions, hands: hands.length,
      measurement: { ratio: distance(hand[4], hand[8]) / scale, tip: { ...raw, z: hand[8].z }, scale } }
  }
}
