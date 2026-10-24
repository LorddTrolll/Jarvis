import type { EnvironmentContext } from './environment/useEnvironment'
import type { StreamEvent } from './types'

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' })
  if (!response.ok) {
    if (response.status === 401 && path !== '/session') window.dispatchEvent(new Event('jarvis-session-expired'))
    let message = `Erro ${response.status}`
    const raw = await response.text()
    try { const data = JSON.parse(raw); message = typeof data.detail === 'string' ? data.detail : 'Confira os campos informados.' }
    catch { message = raw || message }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function chatStream(text: string, allow_documents: boolean, onEvent: (event: StreamEvent) => void, signal: AbortSignal, options: { environment?: EnvironmentContext; temporary?: boolean; temporary_history?: { role: string; content: string }[] } = {}) {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, allow_documents, ...options }), signal })
  if (!response.ok || !response.body) {
    if (response.status === 401) window.dispatchEvent(new Event('jarvis-session-expired'))
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || 'Não foi possível conversar com o backend.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const event of events) {
        const line = event.split('\n').find(x => x.startsWith('data: '))
        if (line) onEvent(JSON.parse(line.slice(6)))
      }
      if (done) break
    }
  } finally { reader.releaseLock() }
}
