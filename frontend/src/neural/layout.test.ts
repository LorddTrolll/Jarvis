import { describe, expect, it } from 'vitest'
import { benchmarkGraph, brainContour, layout, sceneEdges } from './layout'

describe('cérebro formado exclusivamente por memórias',()=>{
  it('mantém correspondência exata com os registros, sem bolinhas de categorias',()=>{
    const graph=benchmarkGraph(120), nodes=layout(graph)
    expect(nodes.map(n=>n.id)).toEqual(graph.nodes.map(n=>n.id))
    expect(nodes.every(n=>!n.id.startsWith('category:'))).toBe(true)
    expect(nodes.some(n=>n.position[0]<0)&&nodes.some(n=>n.position[0]>0)).toBe(true)
    expect(nodes.every(n=>n.position.every(Number.isFinite))).toBe(true)
    expect(layout(graph)).toEqual(nodes)
    expect(sceneEdges(nodes,graph.edges)).toEqual(graph.edges)
  })
  it('não preenche um cérebro vazio com memórias fictícias',()=>{
    const empty=benchmarkGraph(0)
    expect(layout(empty)).toEqual([])
    expect(sceneEdges([],[])).toEqual([])
    const contour=brainContour()
    expect(contour.length).toBeGreaterThan(0)
    expect([...contour].every(Number.isFinite)).toBe(true)
  })
})
