import { useEffect, useState } from 'react'
import { api } from '../api'

interface Telemetry { cpu_percent: number | null; memory_percent: number; download_bps: number | null; upload_bps: number | null; sampled_at: string }
export function useTelemetry(enabled: boolean) {
  const [sample, setSample] = useState<Telemetry | null>(null), [error, setError] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let pending = false
    const load = async () => {
      if (pending || document.hidden) return
      pending = true
      try { const result = await api<Telemetry>('/system', { signal:controller.signal }); setSample(result); setError(false) }
      catch { if (!controller.signal.aborted) setError(true) }
      finally { pending = false }
    }
    void load()
    const interval = window.setInterval(() => { void load() }, 3000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [enabled])
  return { sample, error }
}
