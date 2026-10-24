import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import type { OrbitControls as Controls } from 'three-stdlib'
import * as THREE from 'three'
import type { Point } from '../gestures/engine'
import type { MemoryGraph, NeuralView } from './types'
import { layout, sceneEdges, seed } from './layout'

export interface SceneHandle { hitTest: (point: Point) => string | null; orbit: (dx: number,dy: number) => void; snapshot: () => { camera: [number,number,number]; target: [number,number,number] } }
interface Props { graph: MemoryGraph; view: NeuralView; matches: string[] | null; hovered: string | null; spread: number; effects: boolean; reduced: boolean; onHover: (id: string | null) => void; onSelect: (id: string, double?: boolean) => void; onStats: (fps: number) => void; onReady: () => void; onCamera: () => void; low: boolean }

const Objects = forwardRef<SceneHandle,Props>(function Objects(props,ref) {
  const { graph, view, matches, hovered, spread, effects, reduced, onHover, onSelect, onStats, onReady, onCamera, low } = props
  const { camera, gl, invalidate, size } = useThree()
  const nodes = useMemo(() => layout(graph, spread), [graph,spread])
  const edges = useMemo(() => sceneEdges(nodes,graph.edges).slice(0,low ? 1800 : 7000), [nodes,graph.edges,low])
  const indices = useMemo(() => new Map(nodes.map((n,i) => [n.id,i])), [nodes])
  const selected = useMemo(() => {
    const set = new Set<string>()
    if (view.selected) { set.add(view.selected); for (const edge of edges) { if (edge.source === view.selected) set.add(edge.target); if (edge.target === view.selected) set.add(edge.source) } }
    return set
  },[view.selected,edges])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const glow = useRef<THREE.Points>(null)
  const line = useRef<THREE.LineSegments>(null)
  const pulse = useRef<THREE.Points>(null)
  const controls = useRef<Controls>(null)
  const actual = useRef(new Map<string,THREE.Vector3>())
  const pointer = useRef(new THREE.Vector2()), ray = useRef(new THREE.Raycaster())
  const matrix = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const cameraGoal = useRef(new THREE.Vector3(0,.5,18))
  const targetGoal = useRef(new THREE.Vector3(0,0,0))
  const transitioning = useRef(true)
  const settled = useRef(false)
  const stats = useRef({ at: performance.now(), frames: 0 })
  const buffers = useMemo(() => ({
    points: new Float32Array(nodes.length * 3), colors: new Float32Array(nodes.length * 3), sizes: new Float32Array(nodes.length),
    lines: new Float32Array(edges.length * 6), lineColors: new Float32Array(edges.length * 6), pulses: new Float32Array(32 * 3),
  }),[nodes.length,edges.length])
  useEffect(() => {
    settled.current = false
    for (const node of nodes) if (!actual.current.has(node.id)) actual.current.set(node.id,new THREE.Vector3(...node.position).multiplyScalar(.8))
    for (const key of actual.current.keys()) if (!indices.has(key)) actual.current.delete(key)
    const color = new THREE.Color()
    nodes.forEach((node,i) => {
      const bright = matches ? matches.includes(node.id) || node.hub : view.level === 'global' || selected.has(node.id)
      color.set(node.color).multiplyScalar(bright ? 1.05 : .2)
      mesh.current?.setColorAt(i,color)
      color.toArray(buffers.colors,i*3)
      buffers.sizes[i] = node.hub ? 58 : bright ? 24 : 10
    })
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true
    if (glow.current) {
      glow.current.geometry.attributes.color.needsUpdate = true
      glow.current.geometry.attributes.size.needsUpdate = true
    }
    edges.forEach((edge,i) => {
      const dim = view.level !== 'global' && !selected.has(edge.source) && !selected.has(edge.target)
      color.set(edge.relation === 'similarity' ? '#8c65bd' : '#ba8dde').multiplyScalar(dim ? .09 : edge.relation === 'category' ? .23 : .52)
      color.toArray(buffers.lineColors,i*6); color.toArray(buffers.lineColors,i*6+3)
    })
    if (line.current) line.current.geometry.attributes.color.needsUpdate = true
    invalidate()
  },[nodes,indices,matches,view.level,selected,buffers,edges,invalidate,hovered])
  useEffect(() => {
    const node = nodes.find(n => n.id === view.selected)
    if (view.camera && view.target && size.width / size.height >= .75) { cameraGoal.current.set(...view.camera); targetGoal.current.set(...view.target) }
    else if (node && view.level !== 'global') {
      targetGoal.current.set(...node.position)
      cameraGoal.current.copy(targetGoal.current).add(new THREE.Vector3(.5,.5,view.level === 'file' ? 6.5 : 9))
    } else {
      const bounds = new THREE.Box3().setFromPoints(nodes.map(n => new THREE.Vector3(...n.position)))
      if (nodes.length) bounds.getCenter(targetGoal.current); else targetGoal.current.set(0,0,0)
      const extent = bounds.isEmpty() ? new THREE.Vector3(2,2,2) : bounds.getSize(new THREE.Vector3())
      const aspect = Math.max(.1, size.width / Math.max(1,size.height))
      const distance = Math.max(8, (extent.y / 2 + 1.5) / Math.tan(Math.PI / 8), (extent.x / 2 + 1.5) / (Math.tan(Math.PI / 8) * aspect))
      cameraGoal.current.copy(targetGoal.current).add(new THREE.Vector3(0,.5,distance + extent.z / 2))
    }
    transitioning.current = true; invalidate()
    // Reenquadra na mudança de visão/tamanho; a órbita manual não altera essas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[view,size.width,size.height,!!nodes.length])
  useEffect(() => { onReady() },[onReady])
  useImperativeHandle(ref,() => ({
    hitTest(point) {
      if (!mesh.current) return null
      const box = gl.domElement.getBoundingClientRect()
      const x = point.x * innerWidth, y = point.y * innerHeight
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null
      pointer.current.set((x-box.left)/box.width*2-1,-((y-box.top)/box.height)*2+1)
      ray.current.setFromCamera(pointer.current,camera)
      const hit = ray.current.intersectObject(mesh.current,false)[0]
      if(hit?.instanceId !== undefined)return nodes[hit.instanceId]?.id || null
      let nearest: string|null=null, distance=22
      for(const node of nodes){
        const position=actual.current.get(node.id)
        if(!position)continue
        scratch.copy(position).project(camera)
        if(scratch.z>1||scratch.z< -1)continue
        const dx=(scratch.x+1)*box.width/2+box.left-x,dy=(-scratch.y+1)*box.height/2+box.top-y
        const gap=Math.hypot(dx,dy)
        if(gap<distance){distance=gap;nearest=node.id}
      }
      return nearest
    },
    orbit(dx,dy) {
      if (!controls.current) return
      transitioning.current = false
      scratch.copy(camera.position).sub(controls.current.target)
      const spherical = new THREE.Spherical().setFromVector3(scratch)
      spherical.theta -= dx * 5; spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * 4,.15,Math.PI-.15)
      camera.position.copy(scratch.setFromSpherical(spherical).add(controls.current.target)); controls.current.update(); invalidate()
    },
    snapshot() { return { camera: camera.position.toArray() as [number,number,number], target: (controls.current?.target.toArray() || [0,0,0]) as [number,number,number] } },
  }),[camera,gl,nodes,invalidate,scratch])

  useFrame((state,delta) => {
    const time = state.clock.elapsedTime
    if(!settled.current || effects&&!low&&!reduced) {
    let distance = 0
    nodes.forEach((node,i) => {
      let position = actual.current.get(node.id)
      if(!position){position=new THREE.Vector3(...node.position);actual.current.set(node.id,position)}
      scratch.set(...node.position)
      if (view.level !== 'global' && selected.has(node.id) && node.id !== view.selected) {
        const center = nodes[indices.get(view.selected || '') || 0]
        if (center) scratch.sub(new THREE.Vector3(...center.position)).multiplyScalar(1.3).add(new THREE.Vector3(...center.position))
      }
      if (effects && !low && !reduced) scratch.y += Math.sin(time*.35 + seed(node.id)*6) * .025
      distance = Math.max(distance,position.distanceToSquared(scratch))
      position.lerp(scratch,reduced ? 1 : Math.min(1,delta*4))
      matrix.position.copy(position)
      matrix.scale.setScalar(node.radius * (node.id === hovered ? 1.5 : 1))
      matrix.updateMatrix(); mesh.current?.setMatrixAt(i,matrix.matrix)
      position.toArray(buffers.points,i*3)
    })
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true
    if (glow.current) glow.current.geometry.attributes.position.needsUpdate = true
    edges.forEach((edge,i) => {
      actual.current.get(edge.source)?.toArray(buffers.lines,i*6)
      actual.current.get(edge.target)?.toArray(buffers.lines,i*6+3)
    })
    if (line.current) line.current.geometry.attributes.position.needsUpdate = true
    settled.current = distance < .000001
    }
    if (pulse.current) {
      let count = 0
      for (const edge of edges) {
        if (count >= 32) break
        if (edge.source !== view.selected && edge.target !== view.selected) continue
        const a = actual.current.get(edge.source), b = actual.current.get(edge.target)
        if (a && b) scratch.copy(a).lerp(b,(time*.28 + count*.07)%1).toArray(buffers.pulses,count++*3)
      }
      pulse.current.geometry.setDrawRange(0,count); pulse.current.geometry.attributes.position.needsUpdate = true
    }
    if (transitioning.current && controls.current) {
      camera.position.lerp(cameraGoal.current,reduced ? 1 : Math.min(1,delta*3))
      controls.current.target.lerp(targetGoal.current,reduced ? 1 : Math.min(1,delta*3))
      controls.current.update()
      if (camera.position.distanceTo(cameraGoal.current) < .015) transitioning.current = false
    }
    stats.current.frames++
    const now = performance.now()
    if (now - stats.current.at >= 1000) { onStats(Math.round(stats.current.frames*1000/(now-stats.current.at))); stats.current = { at: now, frames: 0 } }
  })
  const labels = nodes.filter(n => n.hub || n.id === hovered || n.id === view.selected || matches?.slice(0,4).includes(n.id))
  return <>
    <OrbitControls ref={controls} enableDamping dampingFactor={.09} minDistance={2.5} maxDistance={95} onStart={() => { transitioning.current = false }} onEnd={onCamera} />
    <instancedMesh ref={mesh} args={[undefined,undefined,nodes.length]} frustumCulled={false} onPointerMove={e => { e.stopPropagation(); onHover(nodes[e.instanceId!]?.id || null) }} onPointerOut={() => onHover(null)} onClick={e => { e.stopPropagation(); if(e.instanceId !== undefined) onSelect(nodes[e.instanceId].id) }} onDoubleClick={e => { e.stopPropagation(); if(e.instanceId !== undefined) onSelect(nodes[e.instanceId].id,true) }}>
      {low?<icosahedronGeometry args={[1,0]}/>:<sphereGeometry args={[1,12,10]}/>}<meshBasicMaterial toneMapped={false} />
    </instancedMesh>
    <lineSegments ref={line} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[buffers.lines,3]} /><bufferAttribute attach="attributes-color" args={[buffers.lineColors,3]} /></bufferGeometry><lineBasicMaterial vertexColors transparent opacity={.85} depthWrite={false} blending={THREE.AdditiveBlending} /></lineSegments>
    {effects && !low && <points ref={glow} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[buffers.points,3]} /><bufferAttribute attach="attributes-color" args={[buffers.colors,3]} /><bufferAttribute attach="attributes-size" args={[buffers.sizes,1]} /></bufferGeometry><shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} vertexColors vertexShader={`attribute float size; varying vec3 vColor; void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(110.0,size*7.0/-mv.z); gl_Position=projectionMatrix*mv; }`} fragmentShader={`varying vec3 vColor; void main(){float d=length(gl_PointCoord-vec2(.5));float a=exp(-d*d*19.0)*.42;if(d>.5)discard;gl_FragColor=vec4(vColor,a);}`} /></points>}
    {effects && !low && view.selected && <points ref={pulse} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[buffers.pulses,3]} /></bufferGeometry><pointsMaterial color="#e5d4ff" size={.035} transparent opacity={.8} depthWrite={false} blending={THREE.AdditiveBlending} /></points>}
    {labels.map(node => <Html key={node.id} position={node.position} center distanceFactor={16} zIndexRange={[5,0]} style={{pointerEvents:'none'}}><span className={`neural-label ${node.hub ? 'hub-label' : ''}`} style={{color:node.color}}>{node.title.slice(0,44)}{node.hub && <small>{node.count} memórias</small>}</span></Html>)}
  </>
})

export const NeuralScene = forwardRef<SceneHandle,Props>(function NeuralScene(props,ref) {
  const [visible,setVisible] = useState(!document.hidden)
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener('visibilitychange',update); return () => document.removeEventListener('visibilitychange',update) },[])
  return <Canvas className="neural-canvas" camera={{position:[0,.5,18],fov:45,near:.1,far:200}} dpr={props.low ? 1 : [1,1.5]} gl={{antialias:!props.low,alpha:true,powerPreference:'high-performance'}} frameloop={visible ? 'always' : 'never'}><Objects {...props} ref={ref}/></Canvas>
})
