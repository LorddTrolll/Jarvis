import { useEffect, useMemo, useState } from 'react'

export type CoreState = 'idle' | 'listening' | 'thinking' | 'speaking'
export function Core({ state, reduced, suspended }: { state: CoreState; reduced: boolean; suspended: boolean }) {
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const strands = useMemo(() => Array.from({ length: 18 }, (_, layer) => {
    const points = Array.from({ length: 241 }, (_, i) => {
      const angle = i / 240 * Math.PI * 2
      const wave = 151 + 11 * Math.sin(angle * 3 + layer * .49) + 7 * Math.sin(angle * 5 - layer * .31)
      const x = 200 + Math.cos(angle) * wave
      const y = 200 + Math.sin(angle) * wave * (.88 + Math.sin(layer * .8) * .08)
      return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
    return { path: points + ' Z', color: ['#b38aff', '#9165ee', '#d4b6ff'][layer % 3], delay: -layer * 2.7 }
  }), [])
  return <div className={`intelligence-core core-${state}`} data-paused={reduced || hidden || suspended} role="img" aria-label={`Núcleo Jarvis: ${{ idle:'em espera',listening:'ouvindo',thinking:'processando',speaking:'respondendo' }[state]}`}>
    <div className="core-aura" />
    <svg viewBox="0 0 400 400" aria-hidden="true"><defs><radialGradient id="core-light"><stop offset="0" stopColor="#8254ce" stopOpacity=".09"/><stop offset="1" stopColor="#8254ce" stopOpacity="0"/></radialGradient></defs><circle cx="200" cy="200" r="190" fill="url(#core-light)"/>
      {strands.map((strand, i) => <g className="core-strand" key={i} style={{ animationDelay:`${strand.delay}s`, animationDuration:`${24 + i * 1.3}s`, animationDirection:i % 2 ? 'reverse' : 'normal' }}><path d={strand.path} fill="none" stroke={strand.color} strokeWidth={i % 4 ? '.65' : '1.2'} opacity={i % 4 ? '.37' : '.8'}/><circle cx={200 + Math.cos(i * 1.9) * 154} cy={200 + Math.sin(i * 1.9) * 142} r={i % 3 ? '1.1' : '1.8'} fill="#e7d4ff"/></g>)}
    </svg><div className="core-center"><span>J.A.R.V.I.S</span><small>INTELIGÊNCIA PESSOAL</small></div>
  </div>
}
