import type { MemoryEdge, MemoryGraph, MemoryNode } from './types'
import { CATEGORIES } from './types'
export interface SceneNode extends MemoryNode { hub?: boolean; count?: number; color: string; position: [number, number, number]; radius: number }
const CENTERS: [number, number, number][] = [[-3.6,1.6,1.2],[-1.5,3.2,-.8],[1.8,3.1,1.1],[3.9,1.2,-.5],[1.6,-.7,2.5],[-2.8,-1.6,.7],[.1,.2,-2.6],[3.1,-1.7,.8],[1.1,-2.9,-.2],[-1.2,-2.7,-1.3]]
export function seed(text: string) { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h,16777619) } h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h >>> 0) / 4294967296 }
export function layout(graph: MemoryGraph, spread = 1): SceneNode[] {
  const nodes: SceneNode[] = CATEGORIES.map((cat,i) => ({ id: `category:${cat.id}`, kind: cat.id, title: cat.label, excerpt: 'Agrupamento por tipo de memória', created_at: '', source_id: null, meta: {}, hub: true, count: graph.categories[cat.id] || 0, color: cat.color, position: CENTERS[i], radius: .19 + Math.min(.2, Math.sqrt(graph.categories[cat.id] || 0) * .015) }))
  for (const node of graph.nodes) {
    const index = Math.max(0, CATEGORIES.findIndex(c => c.id === node.kind)), center = CENTERS[index]
    const angle = seed(node.id + 'a') * Math.PI * 2, elevation = (seed(node.id + 'b') - .5) * Math.PI
    const radius = (.5 + seed(node.id + 'r') * 1.7) * spread
    nodes.push({ ...node, color: CATEGORIES[index].color, radius: node.kind === 'project' ? .18 : .07 + seed(node.id) * .045,
      position: [center[0] + Math.cos(angle) * Math.cos(elevation) * radius, center[1] + Math.sin(elevation) * radius, center[2] + Math.sin(angle) * Math.cos(elevation) * radius] })
  }
  return nodes
}
export function sceneEdges(nodes: SceneNode[], edges: MemoryEdge[]): MemoryEdge[] {
  return [...edges, ...nodes.filter(n => !n.hub).map(n => ({ source: `category:${n.kind}`, target: n.id, relation: 'category', weight: .2, reason: `Tipo de memória: ${CATEGORIES.find(c => c.id === n.kind)?.label}` }))]
}
export function benchmarkGraph(count = 1000): MemoryGraph {
  const kinds = CATEGORIES.slice(0,6)
  const nodes: MemoryNode[] = Array.from({length:count},(_,i) => ({id:`synthetic-${i}`,kind:kinds[i % kinds.length].id,title:`Nó de teste ${i+1}`,excerpt:'Dado sintético exclusivo do teste de desempenho; não é uma memória salva.',source_id:null,created_at:'',meta:{}}))
  return { nodes, edges: [], total: count, revision: -1, categories: Object.fromEntries(kinds.map(k => [k.id,nodes.filter(n => n.kind === k.id).length])), next_offset:null,embedding_method:'Dados sintéticos — não persistidos' }
}
