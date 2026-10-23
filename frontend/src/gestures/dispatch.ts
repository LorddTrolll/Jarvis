import type { Point } from './engine'

// Allowlist estrita. Elementos sensíveis jamais recebem eventos sintéticos de gestos.
export function gestureTarget(point: Point, root: Pick<Document, 'elementFromPoint'> = document): HTMLElement | null {
  const hit = root.elementFromPoint(point.x * window.innerWidth, point.y * window.innerHeight)
  const target = hit?.closest<HTMLElement>('[data-gesture-safe="true"]')
  if (!target || target.closest('[data-sensitive="true"]') || target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true') return null
  return target
}

export function clickFromGesture(point: Point) {
  const target = gestureTarget(point)
  if (target) { target.focus(); target.click(); return true }
  return false
}
