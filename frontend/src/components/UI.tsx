import { AlertCircle, Check, LoaderCircle, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'good' | 'warn' | 'muted' }) {
  return <span className={`badge ${tone}`}><i />{children}</span>
}
export function Empty({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon}<h3>{title}</h3><p>{children}</p></div>
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice"><AlertCircle size={17} /><span>{children}</span></div>
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const modal = useRef<HTMLElement>(null)
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = modal.current
    const elements = () => Array.from(element?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]') || [])
    elements()[0]?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current() }
      if (event.key === 'Tab') {
        const items = elements(), first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    element?.addEventListener('keydown', handler)
    return () => { element?.removeEventListener('keydown', handler); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section ref={modal} className="modal" role="dialog" aria-modal="true" aria-label={title} data-sensitive="true">
      <div className="section-head"><h2>{title}</h2><button className="icon-button" aria-label="Fechar diálogo" onClick={onClose}><X size={18} /></button></div>{children}
    </section>
  </div>
}
export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" className="toggle" checked={checked} onChange={e => onChange(e.target.checked)} /></label>
}
export function Submit({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return <button className="button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{children}</button>
}
