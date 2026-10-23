// Os pesos vêm do snapshot usado como referência e são verificados antes de servir.
import { createHash } from 'node:crypto'
import { setGlobalProxyFromEnv } from 'node:http'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Node 24: respeita o proxy autenticado fornecido pelo ambiente, sem ler credenciais.
setGlobalProxyFromEnv()
const frontend = path.join(root, 'frontend')
const modelPath = path.join(frontend, 'public/models/hand_landmarker.task')
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'
const source = 'https://raw.githubusercontent.com/zubair-trabzada/holo-gestures/55626ff00f6b49c649a407ffdb3cad174479c637/vendor/hand_landmarker.task'
const hash = data => createHash('sha256').update(data).digest('hex')
await mkdir(path.dirname(modelPath), { recursive: true })
let current
try { current = await readFile(modelPath) } catch { /* instalação inicial */ }
if (!current || hash(current) !== expected) {
  const response = await fetch(source, { signal: AbortSignal.timeout(90000) })
  if (!response.ok) throw new Error(`Falha ao baixar modelo: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (hash(bytes) !== expected) throw new Error('SHA-256 do modelo não confere. Instalação interrompida.')
  await writeFile(modelPath, bytes)
}
await cp(path.join(frontend, 'node_modules/@mediapipe/tasks-vision/wasm'), path.join(frontend, 'public/mediapipe'), { recursive: true })
console.log('Modelo verificado (SHA-256) e WASM local preparado.')
