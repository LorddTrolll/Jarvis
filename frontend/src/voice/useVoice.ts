import { useCallback, useEffect, useRef, useState } from 'react'
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
  const callback = useRef(onText); callback.current = onText
  const constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
  const stop = useCallback(() => {
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
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'pt-BR'; utterance.rate = 1.04
    const preferred = voices.find(v => v.name === voiceName) || voices.find(v => v.lang === 'pt-BR')
    if (preferred) utterance.voice = preferred
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [voices, voiceName])
  return { listening, speaking, interim, error, start, stop, speak, supported: !!constructor, voices, voiceName, setVoiceName }
}
