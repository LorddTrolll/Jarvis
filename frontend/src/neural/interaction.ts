import type { Point } from '../gestures/engine'
import type { NeuralGestureConfig, NeuralView } from './types'
import { DEFAULT_NEURAL_GESTURE } from './types'

export interface NeuralSample { visible: boolean; active: boolean; ratio: number; point: Point; target: string | null }
export interface NeuralAction { type: 'single' | 'double' | 'reverse' | 'drag_start' | 'drag' | 'drag_end'; target?: string | null; point?: Point; dx?: number; dy?: number }
export class NeuralGestureMachine {
  config: NeuralGestureConfig
  phase = 'neutro'
  private down: { at: number; point: Point; target: string | null } | null = null
  private pending: { at: number; point: Point; target: string } | null = null
  private dragging = false
  private lastPoint: Point | null = null
  private releaseAt = -Infinity
  private cooldown = -Infinity
  private neutral: { at: number; ratio: number } | null = null
  private reverse: { at: number; base: number; last: number } | null = null

  constructor(config: Partial<NeuralGestureConfig> = {}) { this.config = { ...DEFAULT_NEURAL_GESTURE, ...config } }
  reset() { this.down = this.pending = this.neutral = this.reverse = null; this.dragging = false; this.lastPoint = null; this.phase = 'neutro' }
  sample(sample: NeuralSample, now: number): NeuralAction[] {
    const actions: NeuralAction[] = []
    if (!sample.visible || !sample.active || !Number.isFinite(sample.ratio)) {
      if (this.dragging) actions.push({ type: 'drag_end' })
      this.reset(); return actions
    }
    const { point, ratio, target } = sample
    if (now < this.cooldown) { this.phase = 'aguarde'; return actions }
    if (this.pending && now - this.pending.at > this.config.double_ms) {
      actions.push({ type: 'single', target: this.pending.target, point: this.pending.point }); this.pending = null
      this.phase = 'memória expandida'
    }
    const pinching = ratio < this.config.pinch_threshold * (this.down ? 1.5 : 1)
    if (pinching) {
      this.neutral = this.reverse = null
      if (!this.down) { this.down = { at: now, point, target }; this.phase = 'pinça iniciada' }
      if (now - this.down.at >= this.config.hold_ms) {
        if (!this.dragging) { actions.push({ type: 'drag_start', point }); this.dragging = true }
        if (this.lastPoint) actions.push({ type: 'drag', point, dx: point.x - this.lastPoint.x, dy: point.y - this.lastPoint.y })
        this.phase = 'pinça sustentada'
      }
    } else if (this.down) {
      const duration = now - this.down.at
      if (this.dragging) actions.push({ type: 'drag_end' })
      else if (duration >= 90 && duration < this.config.hold_ms && this.down.target) {
        if (this.pending && this.pending.target === this.down.target && now - this.pending.at <= this.config.double_ms) {
          actions.push({ type: 'double', target: this.down.target, point }); this.pending = null; this.phase = 'pinça dupla'
        } else {
          if (this.pending) actions.push({ type: 'single', target: this.pending.target, point: this.pending.point })
          this.pending = { at: now, target: this.down.target, point: this.down.point }; this.phase = 'aguardando segunda pinça'
        }
      }
      this.down = null; this.dragging = false; this.releaseAt = now; this.neutral = this.reverse = null
    } else if (!this.pending && now - this.releaseAt > 800) {
      // A soltura normal nunca arma o reverso. Exige uma NOVA posição neutra intermediária.
      if (!this.reverse) {
        if (ratio >= .48 && ratio <= .98) {
          if (!this.neutral) this.neutral = { at: now, ratio }
          if (now - this.neutral.at >= 200 && ratio > this.neutral.ratio + .12) {
            this.reverse = { at: now, base: this.neutral.ratio, last: ratio }; this.phase = 'abertura intencional'
          }
        } else if (this.neutral && now - this.neutral.at >= 200 && ratio > this.neutral.ratio + .12 && ratio < 1.3) {
          this.reverse = { at: now, base: this.neutral.ratio, last: ratio }; this.phase = 'abertura intencional'
        } else this.neutral = null
      } else {
        if (ratio < this.reverse.last - .12 || now - this.reverse.at > 1200) { this.reverse = null; this.neutral = null }
        else {
          this.reverse.last = ratio
          if (ratio - this.reverse.base >= this.config.reverse_amplitude && ratio >= 1.3 && now - this.reverse.at >= this.config.reverse_ms) {
            actions.push({ type: 'reverse' }); this.cooldown = now + 900; this.neutral = this.reverse = null; this.phase = 'pinça reversa'
          }
        }
      }
    }
    this.lastPoint = point
    return actions
  }
}

export function navigate(view: NeuralView, action: 'expand' | 'open' | 'back' | 'global', target?: string): NeuralView {
  if (action === 'global') return { level: 'global', selected: null, parent: null }
  if (action === 'back') return view.level === 'file'
    ? { ...view, level: 'cluster', selected: view.parent || view.selected, parent: null }
    : { level: 'global', selected: null, parent: null }
  if (!target) return view
  if (action === 'expand') return { ...view, level: 'cluster', selected: target, parent: null }
  return { ...view, level: 'file', selected: target, parent: view.level === 'cluster' ? view.selected : view.level === 'file' ? view.parent || view.selected : target }
}
