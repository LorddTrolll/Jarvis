import type { MemoryEdge, MemoryGraph, MemoryNode } from './types'
import { CATEGORIES } from './types'
export interface SceneNode extends MemoryNode { color: string; position: [number, number, number]; radius: number }

export function seed(text: string) {
  let h = 2166136261
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Dois hemisférios com sulcos corticais; não cria registros ou neurônios artificiais. */
export function brainPoint(side: number, longitude: number, latitude: number, depth = 1): [number, number, number] {
  const theta = longitude * Math.PI * 2, phi = latitude * Math.PI / 2
  const fold = 1 + .045 * Math.sin(theta * 7 + phi * 5) + .025 * Math.sin(phi * 12 - theta * 3)
  const width = 1.38 * Math.cos(phi) * Math.cos(theta) * depth * fold
  return [side * (1.56 + width), 2.65 * Math.sin(phi) * depth * fold,
    2.16 * Math.cos(phi) * Math.sin(theta) * depth * fold + .13 * Math.sin(phi * 3)]
}

export function layout(graph: MemoryGraph, spread = 1): SceneNode[] {
  return graph.nodes.map(node => {
    const side = seed(node.id + ':side') < .5 ? -1 : 1
    const position = brainPoint(side, seed(node.id + ':angle'), Math.asin(seed(node.id + ':height') * 2 - 1) / (Math.PI / 2), .72 + seed(node.id + ':depth') * .28)
    return { ...node, color: CATEGORIES.find(c => c.id === node.kind)?.color || '#c4a7eb',
      radius: (node.kind === 'project' ? .15 : node.kind === 'document' || node.kind === 'task' ? .115 : .075) + seed(node.id) * .04,
      position: position.map(v => v * spread) as [number, number, number] }
  })
}

export function sceneEdges(nodes: SceneNode[], edges: MemoryEdge[]): MemoryEdge[] {
  const ids = new Set(nodes.map(node => node.id))
  return edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))
}

export function brainContour(): Float32Array {
  const lines: number[] = []
  const segment = (a: number[], b: number[]) => lines.push(...a, ...b)
  for (const side of [-1, 1]) {
    for (let latitude = -4; latitude <= 4; latitude++) {
      for (let i = 0; i < 96; i++) segment(brainPoint(side, i / 96, latitude / 5), brainPoint(side, (i + 1) / 96, latitude / 5))
    }
    for (let longitude = 0; longitude < 12; longitude++) {
      for (let i = 0; i < 64; i++) segment(brainPoint(side, longitude / 12, i / 32 - 1), brainPoint(side, longitude / 12, (i + 1) / 32 - 1))
    }
  }
  return new Float32Array(lines)
}

export function benchmarkGraph(count = 1000): MemoryGraph {
  const kinds = CATEGORIES.slice(0, 6)
  const nodes: MemoryNode[] = Array.from({ length: count }, (_, i) => ({ id: `synthetic-${i}`, kind: kinds[i % kinds.length].id,
    title: `Nó de teste ${i + 1}`, excerpt: 'Dado sintético exclusivo do teste de desempenho; não é uma memória salva.', source_id: null, created_at: '', meta: {} }))
  const edges: MemoryEdge[] = nodes.slice(1).map((node, i) => ({source:nodes[i].id,target:node.id,relation:'synthetic',weight:.4,reason:'Conexão sintética exclusiva do benchmark.'}))
  return { nodes, edges, total: count, revision: -1, categories: Object.fromEntries(kinds.map(k => [k.id, nodes.filter(n => n.kind === k.id).length])),
    next_offset: null, embedding_method: 'Dados sintéticos — não persistidos' }
}
