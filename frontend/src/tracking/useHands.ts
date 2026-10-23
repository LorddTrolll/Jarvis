import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { DEFAULT_CONFIG, GestureEngine } from '../gestures/engine'
import type { GestureConfig, GestureFrame, Point } from '../gestures/engine'

export const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]
export const LABELS = { open: 'Mão aberta', fist: 'Interação pausada', point: 'Apontando', pinch: 'Pinça', peace: 'Ferramentas', thumbs_up: 'Seleção', unknown: 'Aguardando mãos' }
export function useHands(onFrame: (frame: GestureFrame) => void, config: GestureConfig = DEFAULT_CONFIG) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const media = useRef<MediaStream | null>(null)
  const detector = useRef<HandLandmarker | null>(null)
  const engine = useRef(new GestureEngine(config))
  const animation = useRef(0)
  const generation = useRef(0)
  const callback = useRef(onFrame)
  callback.current = onFrame
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fps, setFps] = useState(0)
  const [frame, setFrame] = useState<GestureFrame>({ gesture: 'unknown', active: false, cursor: null, actions: [], hands: 0 })
  useEffect(() => { engine.current.config = config }, [config])

  const stop = useCallback(() => {
    generation.current++
    cancelAnimationFrame(animation.current)
    media.current?.getTracks().forEach(track => track.stop())
    media.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    detector.current?.close(); detector.current = null
    engine.current.reset(); setActive(false); setLoading(false); setFps(0)
    const empty: GestureFrame = { gesture: 'unknown', active: false, cursor: null, actions: [], hands: 0 }
    setFrame(empty); callback.current(empty)
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => {
    const visibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [stop])

  const start = useCallback(async () => {
    stop(); const run = generation.current
    setError(''); setLoading(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('A câmera exige HTTPS ou localhost e um navegador compatível.')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
      if (run !== generation.current) { stream.getTracks().forEach(t => t.stop()); return }
      media.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Não foi possível inicializar o visor da câmera.')
      video.srcObject = stream; await video.play()
      const files = await FilesetResolver.forVisionTasks('/mediapipe')
      if (run !== generation.current) return
      const options = (delegate: 'GPU' | 'CPU') => ({ baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate }, runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: config.confidence, minHandPresenceConfidence: config.confidence, minTrackingConfidence: config.confidence })
      let model: HandLandmarker
      try { model = await HandLandmarker.createFromOptions(files, options(config.delegate)) }
      catch { model = await HandLandmarker.createFromOptions(files, options(config.delegate === 'CPU' ? 'GPU' : 'CPU')) }
      if (run !== generation.current) { model.close(); return }
      detector.current = model; setActive(true); setLoading(false)
      let lastVideo = -1, lastUi = 0, lastInference = -Infinity, count = 0, second = performance.now()
      const tick = () => {
        if (run !== generation.current) return
        try {
          const timestamp = performance.now()
          // Inferência síncrona do Tasks Vision: reserva tempo para teclado, cliques e desligamento.
          if (video.readyState >= 2 && video.currentTime !== lastVideo && timestamp - lastInference >= 1000 / 15) {
            lastInference = timestamp
            lastVideo = video.currentTime
            const result = model.detectForVideo(video, timestamp)
            const hands = result.landmarks as Point[][]
            const next = engine.current.update(hands, timestamp)
            callback.current(next)
            const canvas = canvasRef.current
            if (canvas) {
              if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
              if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
              const ctx = canvas.getContext('2d')!
              ctx.clearRect(0,0,canvas.width,canvas.height)
              ctx.strokeStyle = '#46e4d0'; ctx.fillStyle = '#c8fff6'; ctx.lineWidth = 2
              for (const hand of hands) {
                for (const [a,b] of CONNECTIONS) { ctx.beginPath(); ctx.moveTo(hand[a].x * canvas.width, hand[a].y * canvas.height); ctx.lineTo(hand[b].x * canvas.width, hand[b].y * canvas.height); ctx.stroke() }
                for (const p of hand) { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2); ctx.fill() }
              }
            }
            count++
            if (timestamp - lastUi > 140) { setFrame(next); lastUi = timestamp }
            if (timestamp - second >= 1000) { setFps(Math.round(count * 1000 / (timestamp - second))); count = 0; second = timestamp }
          }
          animation.current = requestAnimationFrame(tick)
        } catch { stop(); setError('Falha no rastreamento. Tente reativar a câmera ou reduzir a qualidade do vídeo.') }
      }
      tick()
    } catch (e) {
      if (run !== generation.current) return
      stop()
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Permissão de câmera negada. Libere o acesso nas configurações do navegador.' : e instanceof Error ? e.message : 'Câmera indisponível.')
    }
  }, [stop, config.confidence, config.delegate])
  return { videoRef, canvasRef, start, stop, active, loading, error, fps, frame }
}
