import type { ReactNode } from 'react'
import { ArrowUpRight, BrainCircuit, CheckCheck, ChevronRight, Clock3, Cloud, FolderOpen, Globe2, Hand, Link2, Mail, Maximize, MessageSquare, Minimize, Radio, Settings2, ShieldCheck, Square, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Panel, Status, Task } from '../types'
import type { Environment } from '../environment/useEnvironment'
import { WeatherIcon } from '../environment/Environment'
import { useTelemetry } from './useTelemetry'

interface Props {
  environment: Environment; status: Status | null; panel: Panel; go: (panel: Panel) => void
  onLocation: () => void; onEmail: () => void; onNews: () => void; onStop: () => void; onAsk: (text: string) => void
  brain: ReactNode; composer: ReactNode; camera: ReactNode; tasks: Task[]; answer: string; interim: string; busy: boolean
  listening: boolean; speaking: boolean; readAloud: boolean; onVoiceOutput: () => void; onVoiceStop: () => void; reduced: boolean
  temporary: boolean; onTemporary: () => void; cameraActive: boolean; voiceSupported: boolean
}
const SERVICES: { id:Panel; title:string; label:string; icon:typeof BrainCircuit }[] = [
  {id:'tasks',title:'Agenda',label:'Agenda e tarefas',icon:CheckCheck},
  {id:'neural',title:'Memórias',label:'Memórias',icon:BrainCircuit},
  {id:'files',title:'Arquivos',label:'Arquivos e memória',icon:FolderOpen},
  {id:'integrations',title:'Conexões',label:'Conexões',icon:Link2},
]
function rate(value: number | null | undefined) {
  if (value == null) return '—'
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB/s`
  return `${(value / 1024).toFixed(1)} KB/s`
}

export function Hud(p: Props) {
  const e=p.environment, telemetry=useTelemetry(true)
  const [fullscreen,setFullscreen]=useState(!!document.fullscreenElement),[fullscreenError,setFullscreenError]=useState('')
  useEffect(()=>{const update=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[])
  const state=p.listening?'listening':p.busy?'thinking':p.speaking?'speaking':'idle'
  const stateLabel={idle:'EM ESPERA',listening:'OUVINDO VOCÊ',thinking:'PROCESSANDO',speaking:'RESPONDENDO'}[state]
  const activeTasks=p.tasks.filter(t=>!t.done), priorities=activeTasks.filter(t=>t.priority==='alta')
  const clock=e.now.toLocaleTimeString('pt-BR',{timeZone:e.timezone,hour:'2-digit',minute:'2-digit'})
  const date=e.now.toLocaleDateString('pt-BR',{timeZone:e.timezone,weekday:'long',day:'numeric',month:'long'})
  const toggleFullscreen=async()=>{
    setFullscreenError('')
    try { if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen() }
    catch { setFullscreenError('Tela cheia indisponível. Use F11 ou o iniciador do Windows.') }
  }
  return <>
    <header className="os-header"><button className="os-brand" aria-label="Voltar ao núcleo" onClick={()=>p.go('dashboard')} data-gesture-safe="true"><span className="os-brand-dot"/>J.A.R.V.I.S</button><div className="os-link-state"><i/>{p.status?'NÚCLEO LOCAL · CONECTADO':'CONECTANDO AO NÚCLEO'}</div><div className="os-header-tools"><button aria-label="Localização" title="Localização" onClick={p.onLocation}><Globe2 size={15}/><span>{e.place?.name.split(',')[0]||'Localização'}</span></button><button aria-label={p.readAloud?'Desativar respostas por voz':'Ativar respostas por voz'} title="Respostas por voz" aria-pressed={p.readAloud} onClick={p.onVoiceOutput}>{p.readAloud?<Volume2 size={16}/>:<VolumeX size={16}/>}</button><button aria-label={fullscreen?'Sair da tela cheia':'Tela cheia'} onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize size={15}/>:<Maximize size={15}/>}</button><button aria-label="Interromper tudo" title="Interromper tudo" onClick={p.onStop} data-gesture-safe="true"><Square size={13}/></button></div></header>
    <div className="hud-layout">
      <aside className="hud-context" aria-label="Contexto e computador"><section className="hud-card hud-clock"><span className="hud-kicker">AGORA</span><time className="local-time" dateTime={e.now.toISOString()}>{clock}<small>{e.now.toLocaleTimeString('pt-BR',{timeZone:e.timezone,second:'2-digit'}).padStart(2,'0')}</small></time><p>{date}</p><small className="hud-timezone">{e.timezone.replaceAll('_',' ')}</small></section>
        <section className="hud-card hud-weather"><div className="hud-card-heading"><span className="hud-kicker">CLIMA</span><button aria-label="Configurar localização" title={e.place?.name||'Configurar localização'} onClick={p.onLocation}><span>{e.place?.name.split(',')[0]||'Escolher cidade'}</span><ArrowUpRight size={12}/></button></div>{e.weather?<><div className="weather-reading"><strong>{Math.round(e.weather.temperature)}<small>°C</small></strong><WeatherIcon code={e.weather.code} day={e.weather.is_day}/></div><p>{e.weather.description}</p><div className="hud-weather-range">{Math.round(e.weather.low)}° mín. <span>·</span> {Math.round(e.weather.high)}° máx.</div><small className="weather-details">Sensação {Math.round(e.weather.feels_like)}° · Umidade {e.weather.humidity}%</small><small className="weather-source"><a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a> · {e.weather.observed_at.split('T')[1]?.slice(0,5)}{e.error?' · sem atualização':''}</small></>:<div className="weather-empty"><Cloud size={22}/><p>{e.loading?'Consultando o clima…':e.error||'Defina sua localização para acompanhar o clima.'}</p><button onClick={e.error?e.refresh:p.onLocation}>{e.error?'Tentar novamente':'Definir localização'}<ChevronRight size={12}/></button></div>}</section>
        <section className="hud-card hud-telemetry" aria-label="Telemetria do computador"><div className="hud-card-heading"><span className="hud-kicker">NÚCLEO</span><i className={telemetry.error?'telemetry-off':'telemetry-on'}/></div>{telemetry.error?<p className="telemetry-unavailable">Métricas indisponíveis</p>:<><div className="telemetry-meter"><span>CPU<strong>{telemetry.sample?.cpu_percent==null?'—':`${Math.round(telemetry.sample.cpu_percent)}%`}</strong></span><progress max={100} value={telemetry.sample?.cpu_percent??undefined} aria-label="Uso de CPU"/></div><div className="telemetry-meter"><span>Memória<strong>{telemetry.sample?`${Math.round(telemetry.sample.memory_percent)}%`:'—'}</strong></span><progress max={100} value={telemetry.sample?.memory_percent??undefined} aria-label="Uso de memória"/></div><div className="telemetry-network"><span>Rede</span><strong>↓ {rate(telemetry.sample?.download_bps)}</strong><small>↑ {rate(telemetry.sample?.upload_bps)}</small></div></>}<small className="telemetry-origin">MÁQUINA QUE EXECUTA O JARVIS</small></section>
        {p.camera}
      </aside>
      <main className="hud-center" aria-label="Núcleo do assistente" aria-hidden={p.panel!=='dashboard'&&p.panel!=='neural'} inert={p.panel!=='dashboard'&&p.panel!=='neural'}><div className="hud-core-state"><h1>{stateLabel}</h1><span>{p.temporary?'MEMÓRIA TEMPORÁRIA':'PRONTO PARA CONECTAR SEU DIA'}</span></div><div className="hud-brain">{p.brain}</div>
        {(p.panel==='dashboard'||p.panel==='neural')&&<div className="hud-command-area"><div className={`hud-response ${p.answer||p.interim?'has-answer':''}`} aria-live="polite" aria-busy={p.busy}>{p.interim?<p><Radio size={13}/>{p.interim}</p>:p.answer?<><span className="hud-kicker">JARVIS</span><p className="hud-answer">{p.answer}</p><button className="hud-response-history" onClick={()=>p.go('chat')}>Abrir conversa<ChevronRight size={12}/></button></>:<p className="hud-prompt">Explore suas memórias ou toque no microfone para falar.</p>}</div>
          {p.composer}<div className="hud-command-shortcuts"><button disabled={p.busy} onClick={()=>p.onAsk('Bom dia')} data-gesture-safe="true"><Clock3 size={12}/>Bom dia</button><button disabled={p.busy} onClick={()=>p.onAsk('Como está o tempo?')} data-gesture-safe="true">Clima</button><button onClick={p.onTemporary} aria-pressed={p.temporary} title="Alternar conversa temporária"><ShieldCheck size={12}/>{p.temporary?'Temporária':'Memória ativa'}</button>{(p.speaking||p.listening)&&<button className="hud-speech-stop" onClick={p.onVoiceStop}><Square size={10}/>{p.speaking?'Interromper fala':'Parar microfone'}</button>}</div>
        </div>}
      </main>
      <nav className="hud-services" aria-label="Navegação principal"><div className="hud-services-heading"><span className="hud-kicker">SEUS SERVIÇOS</span><span>{activeTasks.length} pendente{activeTasks.length===1?'':'s'}</span></div>
        {SERVICES.map(s=><button className={`hud-service ${p.panel===s.id?'selected':''}`} key={s.id} aria-label={s.label} aria-current={p.panel===s.id?'page':undefined} onClick={()=>p.go(s.id)} data-gesture-safe="true"><s.icon size={15}/><span>{s.title}</span><small>{s.id==='tasks'?activeTasks.length:s.id==='integrations'?(p.status?.telegram_configured?'1 configurado':'Configurar'):''}</small><ChevronRight size={13}/></button>)}
        <button className="hud-service" onClick={p.onEmail} aria-label="E-mails"><Mail size={15}/><span>E-mails</span><small>Não conectado</small><ChevronRight size={13}/></button><button className="hud-service" onClick={p.onNews} aria-label="Notícias"><Globe2 size={15}/><span>Notícias</span><small>{p.status?.search_configured?'Pesquisar':'Configurar'}</small><ChevronRight size={13}/></button>
        <section className="hud-priorities"><button className="hud-kicker" onClick={()=>p.go('tasks')}>PRIORIDADES<ChevronRight size={12}/></button>{priorities.length?priorities.slice(0,2).map(t=><p key={t.id}><i/>{t.title}</p>):<p className="no-priorities">Nenhuma prioridade definida.</p>}</section>
        <div className="hud-service-tools"><button aria-label="Conversar com Jarvis" title="Conversa" onClick={()=>p.go('chat')} data-gesture-safe="true"><MessageSquare size={17}/></button><button aria-label="Visão e gestos" title="Visão e gestos" className={p.cameraActive?'is-active':''} onClick={()=>p.go('vision')} data-gesture-safe="true"><Hand size={17}/></button><button aria-label="Pesquisa na web" title="Pesquisa na web" onClick={()=>p.go('search')} data-gesture-safe="true"><Globe2 size={17}/></button><button aria-label="Configurações" title="Configurações" onClick={()=>p.go('settings')} data-gesture-safe="true"><Settings2 size={17}/></button></div>
        <p className="hud-permission-status">{p.cameraActive?'Gestos ativos':'Câmera desligada'}<span>·</span>{p.listening?'Microfone ativo':'Microfone desligado'}</p><button className="hud-voice-toggle" disabled={!p.voiceSupported} aria-pressed={p.readAloud} onClick={p.onVoiceOutput}>{p.readAloud?<Volume2 size={14}/>:<VolumeX size={14}/>}<span>{p.readAloud?'Respostas por voz ativas':'Ativar respostas por voz'}</span></button>
        {fullscreenError&&<p role="alert" className="hud-inline-note">{fullscreenError}</p>}
      </nav>
    </div>
  </>
}
