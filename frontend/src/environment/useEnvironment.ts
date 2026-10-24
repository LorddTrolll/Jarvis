import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

export interface Place { name: string; latitude: number; longitude: number; timezone?: string }
export interface Weather { temperature: number; feels_like: number; humidity: number; code: number; is_day: boolean; high: number; low: number; description: string; timezone: string; observed_at: string; fetched_at: string; source: string }
export interface EnvironmentContext { timezone: string; place: Place | null }
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
function remembered(): Place | null {
  try {
    const value = JSON.parse(localStorage.getItem('jarvis-city') || 'null')
    if (value && typeof value.name === 'string' && value.name.length <= 160 && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180) return value
  } catch { /* A seleção pode ser refeita. */ }
  return null
}

export function useEnvironment(enabled: boolean) {
  const [place, setPlace] = useState<Place | null>(remembered)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [revision, setRevision] = useState(0)
  const [gps, setGps] = useState(false)
  const generation = useRef(0)
  const deviceLocation = useRef(false)
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    setWeather(null); setError(''); setLoading(false)
    if (!enabled || !place) return
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const result = await api<Weather>('/environment/weather', { method: 'POST', body: JSON.stringify({latitude:place.latitude,longitude:place.longitude}), signal: controller.signal })
        setWeather(result); setError('')
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Não foi possível consultar o clima.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 10 * 60 * 1000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [place, enabled, revision])
  useEffect(() => {
    if (!enabled) {
      generation.current++; setGps(false)
      if (deviceLocation.current) { deviceLocation.current = false; setPlace(null); setWeather(null) }
    }
  }, [enabled])
  const select = useCallback((value: Place | null, persist = true) => {
    generation.current++; setGps(false); setPlace(value); setWeather(null); setError('')
    deviceLocation.current = !!value && !persist
    // Só cidades escolhidas manualmente ficam salvas. A posição do dispositivo vive nesta sessão.
    if (persist && value) localStorage.setItem('jarvis-city', JSON.stringify(value))
    else localStorage.removeItem('jarvis-city')
  }, [])
  const locate = useCallback(() => {
    if (!navigator.geolocation) { setError('Localização indisponível. Busque sua cidade pelo nome.'); return }
    const id = ++generation.current
    setGps(true); setError('')
    navigator.geolocation.getCurrentPosition(position => {
      if (generation.current !== id) return
      const latitude = Number(position.coords.latitude.toFixed(2)), longitude = Number(position.coords.longitude.toFixed(2))
      void api<Place>('/environment/reverse', { method: 'POST', body: JSON.stringify({latitude,longitude}) }).then(value => {
        if (generation.current === id) select(value, false)
      }).catch(() => {
        if (generation.current === id) { select({ name: 'Localização atual', latitude, longitude }, false); setError('Nome da cidade indisponível. O clima usará a posição aproximada.') }
      }).finally(() => { if (generation.current === id) setGps(false) })
    }, failure => {
      if (generation.current !== id) return
      setGps(false); setError(failure.code === 1 ? 'Permissão de localização negada. Você pode buscar sua cidade.' : 'Não foi possível obter sua posição. Busque sua cidade pelo nome.')
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 900000 })
  }, [select])
  const timezone = weather?.timezone || place?.timezone || browserTimezone()
  // Valida também os dados lembrados, que podem ter sido alterados fora do aplicativo.
  let safeTimezone = timezone
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(now) } catch { safeTimezone = browserTimezone() }
  return { place, weather, error, loading, now, gps, select, locate, refresh: () => setRevision(v => v + 1),
    timezone: safeTimezone, context: { timezone: safeTimezone, place } satisfies EnvironmentContext }
}
export type Environment = ReturnType<typeof useEnvironment>
