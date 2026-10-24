import { useCallback, useEffect, useRef, useState } from 'react'
import { speechChunks } from './text'
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }

export function useVoice(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('jarvis-voice') || '')
  const recognition = useRef<Recognition | null>(null)
  const speechId = useRef(0)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const callback = useRef(onText); callback.current = onText
  const constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
  const stop = useCallback(() => {
    speechId.current++; utteranceRef.current = null
    const current = recognition.current
    recognition.current = null
    current?.abort(); window.speechSynthesis?.cancel()
    setListening(false); setSpeaking(false); setInterim('')
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    const update = () => setVoices(synth.getVoices().filter(v => v.lang.startsWith('pt')))
    update(); synth.addEventListener('voiceschanged', update)
    return () => synth.removeEventListener('voiceschanged', update)
  }, [])
  useEffect(() => { localStorage.setItem('jarvis-voice', voiceName) }, [voiceName])
  useEffect(() => {
    const handler = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [stop])
  const start = useCallback(() => {
    if (!constructor) { setError('Reconhecimento de voz indisponível. Use Chrome/Edge ou digite sua mensagem.'); return }
    stop(); setError(''); setInterim('')
    const current = new constructor()
    recognition.current = current; current.lang = 'pt-BR'; current.continuous = false; current.interimResults = true
    current.onresult = event => {
      if (recognition.current !== current) return
      let final = '', partial = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript
        else partial += event.results[i][0].transcript
      }
      setInterim(partial)
      if (final.trim()) callback.current(final.trim())
    }
    current.onerror = event => {
      if (recognition.current !== current) return
      setError(event.error === 'not-allowed' ? 'Permissão de microfone negada.' : `Reconhecimento interrompido: ${event.error}.`)
      setListening(false)
    }
    current.onend = () => { if (recognition.current === current) { recognition.current = null; setListening(false); setInterim('') } }
    try { current.start(); setListening(true) } catch { setError('Não foi possível iniciar o microfone.'); recognition.current = null }
  }, [constructor, stop])
  const speak = useCallback((text: string) => {
    stop(); setError('')
    const synth = window.speechSynthesis
    if (!synth || !window.SpeechSynthesisUtterance) { setError('Leitura por voz indisponível neste navegador.'); return }
    const id = ++speechId.current, chunks = speechChunks(text)
    const available = synth.getVoices()
    const preferred = available.find(v => v.name === voiceName) || available.find(v => v.lang === 'pt-BR') || available.find(v => v.lang.startsWith('pt'))
    const next = (index: number) => {
      if (speechId.current !== id) return
      if (index >= chunks.length) { utteranceRef.current = null; setSpeaking(false); return }
      const utterance = new SpeechSynthesisUtterance(chunks[index]); utteranceRef.current = utterance
      utterance.lang = 'pt-BR'; utterance.rate = 1
      if (preferred) utterance.voice = preferred
      utterance.onstart = () => { if (speechId.current === id) setSpeaking(true) }
      utterance.onend = () => next(index + 1)
      utterance.onerror = event => {
        if (speechId.current !== id) return
        setSpeaking(false); utteranceRef.current = null
        if (event.error !== 'canceled' && event.error !== 'interrupted') setError('Não foi possível reproduzir a voz. Escolha uma voz em português nas configurações e tente novamente.')
      }
      try { synth.speak(utterance) } catch { setSpeaking(false); setError('Não foi possível iniciar a fala do assistente.') }
    }
    synth.resume(); next(0)
  }, [stop, voiceName])
  return { listening, speaking, interim, error, start, stop, speak, supported: !!constructor, synthesisSupported: !!window.speechSynthesis, voices, voiceName, setVoiceName }
}
