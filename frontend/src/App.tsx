import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowRight, AudioLines, Bell, Bot, BrainCircuit, Camera, CameraOff, Check, CheckCheck, ChevronRight, Clock3, Cpu, FileText, Fingerprint, FolderOpen, Globe2, Hand, LayoutDashboard, Link2, LoaderCircle, MessageSquare, Mic, MicOff, Radio, Search, Send, Settings2, ShieldCheck, Sparkles, Square, Terminal, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react'
import { api, chatStream } from './api'
import { Badge, Empty, Modal, Notice, Submit, Toggle } from './components/UI'
import { clickFromGesture } from './gestures/dispatch'
import { DEFAULT_CONFIG } from './gestures/engine'
import type { GestureConfig, GestureFrame, Point } from './gestures/engine'
import { LABELS, useHands } from './tracking/useHands'
import { useVoice } from './voice/useVoice'
import { Hud } from './immersive/Hud'
import { useEnvironment } from './environment/useEnvironment'
import { LocationDialog } from './environment/Environment'
import type { Audit, DocumentItem, Draft, FileResult, Integration, Message, Panel, Source, Status, Task } from './types'
const NeuralMemory = lazy(() => import('./neural/NeuralMemory').then(module => ({default: module.NeuralMemory})))
import type { NeuralCommand } from './neural/types'

const NAV: { id: Panel; label: string; icon: typeof Bot }[] = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
  { id: 'neural', label: 'Memórias', icon: BrainCircuit },
  { id: 'chat', label: 'Conversar com Jarvis', icon: MessageSquare },
  { id: 'vision', label: 'Visão e gestos', icon: Hand },
  { id: 'tasks', label: 'Agenda e tarefas', icon: CheckCheck },
  { id: 'search', label: 'Pesquisa na web', icon: Globe2 },
  { id: 'files', label: 'Arquivos e memória', icon: FolderOpen },
  { id: 'integrations', label: 'Conexões', icon: Link2 },
  { id: 'settings', label: 'Configurações', icon: Settings2 },
]
const TITLES: Record<Panel, [string, string]> = {
  neural: ['Memória neural', 'Memórias conectadas, arquivos reais e controle pelas mãos.'],
  dashboard: ['Seu espaço, com mais clareza.', 'Um assistente que acompanha seu dia.'],
  chat: ['Conversa', 'Texto, voz e ferramentas conectadas à sua conversa.'],
  vision: ['Visão e gestos', 'Uma nova forma de interagir. Processamento de vídeo inteiramente local.'],
  tasks: ['Agenda', 'Organize suas próximas ações e acompanhe os prazos.'],
  search: ['Pesquisa', 'Pesquise na web e confira as fontes originais.'],
  files: ['Arquivos', 'Importe documentos e encontre os trechos que precisa.'],
  integrations: ['Conexões', 'Conexões oficiais, permissões claras e você no controle.'],
  settings: ['Ajustes do núcleo', 'Preferências, privacidade e estado dos serviços.'],
}
function stored<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function App() {
  const [session, setSession] = useState<{ authenticated: boolean; password_required: boolean } | null>(null)
  const desktopToken = useRef(new URLSearchParams(window.location.hash.slice(1)).get('desktop') || '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [neuralSynthetic,setNeuralSynthetic] = useState(false)
  const [panel, setPanel] = useState<Panel>('dashboard')
  const [tasks, setTasks] = useState<Task[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [temporary, setTemporary] = useState(false)
  const temporaryRef = useRef(false)
  const [neuralCommand, setNeuralCommand] = useState<NeuralCommand|null>(null)
  const neuralFrame = useRef<((frame:GestureFrame)=>boolean)|null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [audits, setAudits] = useState<Audit[]>([])
  const [searchHistory, setSearchHistory] = useState<{ id: number; query: string; results: Source[] }[]>([])
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [working, setWorking] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatFilter, setChatFilter] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState('normal')
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [fileQuery, setFileQuery] = useState('')
  const [fileResults, setFileResults] = useState<FileResult[]>([])
  const [recipient, setRecipient] = useState('')
  const [draftText, setDraftText] = useState('')
  const [review, setReview] = useState<Draft | null>(null)
  const [reviewChecked, setReviewChecked] = useState(false)
  const [dialog, setDialog] = useState<'help' | 'notifications' | 'clear' | 'voice' | 'email' | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)
  const environment = useEnvironment(!!session?.authenticated)
  const [voiceConsent, setVoiceConsent] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; label: string } | null>(null)
  const [clearConfirm, setClearConfirm] = useState('')
  const [allowDocuments, setAllowDocuments] = useState(false)
  const [readAloud, setReadAloud] = useState(() => stored('jarvis-read-aloud', false))
  const readAloudRef = useRef(readAloud); readAloudRef.current = readAloud
  const [reduced, setReduced] = useState(() => stored('jarvis-reduced', window.matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [gestureConfig, setGestureConfig] = useState<GestureConfig>(() => ({ ...DEFAULT_CONFIG, ...stored('jarvis-gesture-config', {}) }))
  const [peacePanel, setPeacePanel] = useState<Panel>(() => stored('jarvis-peace-panel', 'tasks'))
  const abort = useRef<AbortController | null>(null)
  const sendRef = useRef<(text: string) => void>(() => {})
  const gestureCallback = useRef<(frame: GestureFrame) => void>(() => {})
  const cursor = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const chatBottom = useRef<HTMLDivElement>(null)
  const dragged = useRef<{ element: HTMLElement; origin: Point; x: number; y: number } | null>(null)
  const voice = useVoice(text => sendRef.current(text))
  const hands = useHands(frame => gestureCallback.current(frame), gestureConfig)

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), [])
  const go = useCallback((next: Panel) => { setPanel(next); scrollRef.current?.scrollTo(0, 0) }, [])
  const refresh = useCallback(async () => {
    const [s, t, m, d, dr, it, a, sh] = await Promise.all([
      api<Status>('/status'), api<Task[]>('/tasks'), api<Message[]>('/messages'), api<DocumentItem[]>('/documents'),
      api<Draft[]>('/drafts'), api<Integration[]>('/integrations'), api<Audit[]>('/audit'),
      api<{ id: number; query: string; results: Source[] }[]>('/searches'),
    ])
    setStatus(s); setTasks(t); if(!temporaryRef.current) setMessages(m); setDocuments(d); setDrafts(dr); setIntegrations(it); setAudits(a); setSearchHistory(sh)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const connect = () => { void (async () => {
      const current = await api<NonNullable<typeof session>>('/session', {signal:controller.signal})
      const token = desktopToken.current
      if (token) history.replaceState(null, '', location.pathname + location.search)
      if (!current.authenticated && (!current.password_required || token)) {
        await api('/session', {method:'POST',body:JSON.stringify({password:''}),headers:token?{'X-Jarvis-Desktop':token}:undefined,signal:controller.signal})
        desktopToken.current = ''; current.authenticated = true
      }
      if (!controller.signal.aborted) setSession(current)
    })().catch(() => { if (!controller.signal.aborted) { desktopToken.current=''; timer=setTimeout(connect,2000) } }) }
    connect()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])
  useEffect(() => { if (session?.authenticated) void refresh().catch(e => notify(e.message, true)) }, [session?.authenticated, refresh, notify])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 6500); return () => clearTimeout(id) }, [toast])
  useEffect(() => { localStorage.setItem('jarvis-read-aloud', JSON.stringify(readAloud)) }, [readAloud])
  useEffect(() => { localStorage.setItem('jarvis-reduced', JSON.stringify(reduced)); document.documentElement.classList.toggle('reduce-motion', reduced) }, [reduced])
  useEffect(() => { localStorage.setItem('jarvis-gesture-config', JSON.stringify(gestureConfig)) }, [gestureConfig])
  useEffect(() => { localStorage.setItem('jarvis-peace-panel', JSON.stringify(peacePanel)) }, [peacePanel])
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' }) }, [messages, reduced])
  useEffect(() => () => abort.current?.abort(), [])

  const stopAll = useCallback(() => { abort.current?.abort(); voice.stop(); hands.stop(); notify('Câmera, voz e resposta interrompidas.') }, [voice.stop, hands.stop, notify])
  const startVoice = () => { if (voiceConsent) { setReadAloud(true); voice.start() } else setDialog('voice') }
  useEffect(() => {
    const expired = () => {
      abort.current?.abort(); voice.stop(); hands.stop()
      setSession(current => current ? { ...current, authenticated: false } : current)
      setReview(null); setDialog(null); setLocationOpen(false)
    }
    window.addEventListener('jarvis-session-expired', expired)
    return () => window.removeEventListener('jarvis-session-expired', expired)
  }, [voice.stop, hands.stop])
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { if(!document.querySelector('[role=dialog]')&&panel!=='dashboard'&&panel!=='neural') go('dashboard'); abort.current?.abort(); voice.stop(); setDialog(null); setReview(null); setDeleteTarget(null) } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [voice.stop, go, panel])

  gestureCallback.current = frame => {
    if (cursor.current) {
      cursor.current.style.display = frame.cursor ? 'grid' : 'none'
      if (frame.cursor) cursor.current.style.transform = `translate(${frame.cursor.x * window.innerWidth}px, ${frame.cursor.y * window.innerHeight}px)`
      cursor.current.dataset.pinch = String(frame.gesture === 'pinch')
    }
    if (document.querySelector('[role="dialog"]')) return
    if((panel === 'neural'||panel==='dashboard') && neuralFrame.current?.(frame)) return
    for (const action of frame.actions) {
      if (action === 'pause') { voice.stop(); abort.current?.abort(); notify('Navegação por gestos pausada.') }
      if (action === 'home') go('dashboard')
      if (action === 'tools') go(peacePanel)
      if (action === 'click' && frame.cursor) clickFromGesture(frame.cursor)
      if (action === 'confirm' && frame.cursor) clickFromGesture(frame.cursor)
      if (action === 'next' || action === 'previous') {
        const index = NAV.findIndex(n => n.id === panel)
        go(NAV[(index + (action === 'next' ? 1 : NAV.length - 1)) % NAV.length].id)
      }
      if (action === 'scroll_up' || action === 'scroll_down') scrollRef.current?.scrollBy({ top: action === 'scroll_down' ? 320 : -320, behavior: 'smooth' })
      if (action === 'drag_start' && frame.cursor) {
        const element = document.elementFromPoint(frame.cursor.x * innerWidth, frame.cursor.y * innerHeight)?.closest<HTMLElement>('[data-gesture-draggable]')
        if (element) dragged.current = { element, origin: frame.cursor, x: Number(element.dataset.x || 0), y: Number(element.dataset.y || 0) }
      }
      if (action === 'drag' && dragged.current && frame.cursor) {
        const { element, origin, x, y } = dragged.current
        const nextX = Math.max(-100, Math.min(100, x + (frame.cursor.x - origin.x) * innerWidth))
        const nextY = Math.max(-65, Math.min(65, y + (frame.cursor.y - origin.y) * innerHeight))
        element.style.transform = `translate(${nextX}px,${nextY}px)`
        element.dataset.x = String(nextX); element.dataset.y = String(nextY)
      }
      if (action === 'drag_end') dragged.current = null
    }
  }

  const send = async (text: string) => {
    if (!text.trim() || busy || neuralSynthetic) return
    if(panel !== 'neural' && panel !== 'dashboard') go('chat'); setChatText(''); setBusy(true)
    const controller = new AbortController(); abort.current = controller
    const id = Date.now()
    let answer = ''
    setMessages(current => [...current, { id, role: 'user', content: text.trim() }, { id: id + 1, role: 'assistant', content: '' }])
    try {
      await chatStream(text.trim(), allowDocuments, event => {
        if (event.type === 'delta') {
          answer += event.text || ''
          setMessages(current => current.map(m => m.id === id + 1 ? { ...m, content: answer } : m))
        }
        if (event.type === 'error') notify(event.text || 'Erro na resposta.', true)
        if (event.type === 'tool' && event.result && typeof event.result === 'object') {
          const result = event.result as { action?: string; panel?: Panel; results?: Source[]; error?: string; query?: string }
          if (result.action === 'open_panel' && NAV.some(n => n.id === result.panel)) go(result.panel!)
          if (result.action?.startsWith('neural_')) { setNeuralCommand({id:Date.now(),action:result.action,query:result.query});go('neural') }
          if (result.action === 'open_location') setLocationOpen(true)
          if (result.action === 'disable_camera') hands.stop()
          if (result.results) setSources(result.results)
          if (result.error) notify(result.error, true)
        }
      }, controller.signal, {environment:environment.context, temporary, temporary_history:temporary ? messages.slice(-24).map(m=>({role:m.role,content:m.content.slice(0,8000)})):[]})
      if (readAloudRef.current && answer && !controller.signal.aborted && !document.hidden) voice.speak(answer)
      await refresh()
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) notify(e instanceof Error ? e.message : 'Falha na conversa.', true)
      else notify('Resposta interrompida. O histórico preserva as ações já concluídas.')
    } finally { setBusy(false); abort.current = null }
  }
  sendRef.current = text => { void send(text) }

  const perform = async (fn: () => Promise<unknown>, success?: string) => {
    if (working) return
    setWorking(true)
    try { await fn(); await refresh(); if (success) notify(success) }
    catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível concluir.', true) }
    finally { setWorking(false) }
  }
  const login = async (e: FormEvent) => {
    e.preventDefault(); setWorking(true)
    try { await api('/session', { method: 'POST', body: JSON.stringify({ password }) }); setSession({ authenticated: true, password_required: !!password }); setPassword('') }
    catch (e) { notify(e instanceof Error ? e.message : 'Falha ao entrar.', true) }
    finally { setWorking(false) }
  }
  const logout = async () => {
    stopAll()
    try {
      await api('/session', { method: 'DELETE' })
      setSession(current => current ? { ...current, authenticated: false } : current)
      setMessages([]); setTasks([]); setDocuments([]); setDrafts([]); setSources([]); setFileResults([])
      setAllowDocuments(false); setVoiceConsent(false); setLocationOpen(false); go('dashboard')
    } catch (e) { notify(e instanceof Error ? e.message : 'Falha ao sair.', true) }
  }
  const activeTasks = tasks.filter(t => !t.done)
  const dueTasks = activeTasks.filter(t => t.due_at && new Date(t.due_at).getTime() < Date.now())
  const pendingDrafts = drafts.filter(d => d.state === 'draft')

  const toggleTemporary = () => {
    if(busy) {notify('Aguarde ou interrompa a resposta atual.');return}
    const next=!temporary;temporaryRef.current=next;setTemporary(next);setMessages([])
    if(!next)void api<Message[]>('/messages').then(setMessages).catch(e=>notify(e.message,true))
    notify(next?'Conversa temporária: perguntas e respostas não serão salvas.':'Conversa persistente restaurada.')
  }

  const taskRow = (task: Task) => <div className={`task-row ${task.done ? 'done' : ''}`} key={task.id}>
    <button className="task-check" aria-label={task.done ? `Reabrir ${task.title}` : `Concluir ${task.title}`} data-gesture-safe="true" disabled={working} onClick={() => void perform(() => api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) }))}>{task.done && <Check size={13} />}</button>
    <span className="task-copy"><strong>{task.title}</strong>{task.due_at && <small className={new Date(task.due_at).getTime() < Date.now() && !task.done ? 'warning-text' : ''}><Clock3 size={11} />{dateLabel(task.due_at)}</small>}</span>
    {task.priority === 'alta' && <span className="priority-dot" title="Prioridade alta" />}
    {panel === 'tasks' && <button className="icon-button danger-hover" aria-label={`Excluir ${task.title}`} data-sensitive="true" onClick={() => setDeleteTarget({ path: `/tasks/${task.id}`, label: task.title })}><Trash2 size={15} /></button>}
  </div>

  const composer = (hero = false) => <form className={`composer ${hero ? 'hero-composer' : ''}`} onSubmit={e => { e.preventDefault(); void send(chatText) }}>
    <Sparkles size={19} className="composer-spark" />
    <textarea aria-label="Mensagem para o Jarvis" placeholder='Digite: “bom dia”, “clima”, “abra minhas memórias”…' value={chatText} onChange={e => setChatText(e.target.value)} maxLength={8000} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(chatText) } }} disabled={busy||neuralSynthetic} />
    {voice.listening ? <button type="button" className="icon-button listening" aria-label="Parar microfone" onClick={voice.stop}><MicOff size={19} /></button> : <button type="button" className="icon-button" aria-label="Falar com Jarvis" onClick={startVoice} disabled={busy} title="Clique para falar (pt-BR)"><Mic size={19} /></button>}
    {busy ? <button type="button" className="send-button" aria-label="Interromper resposta" onClick={() => abort.current?.abort()}><Square size={15} /></button> : <button type="submit" className="send-button" aria-label="Enviar mensagem" disabled={neuralSynthetic||!chatText.trim()}><ArrowRight size={20} /></button>}
  </form>

  if (!session?.authenticated) return <div className="os-startup"><div className="startup-mark"><AudioLines size={42}/></div><h1>J.A.R.V.I.S</h1>{session?.password_required ? <><p>Núcleo protegido</p><form onSubmit={login}><label>Chave de acesso<input type="password" autoComplete="current-password" aria-label="Senha do proprietário" value={password} onChange={e => setPassword(e.target.value)} required autoFocus /></label><Submit busy={working}>Desbloquear núcleo</Submit></form><small>No Windows, o iniciador abre uma sessão local automaticamente.</small></> : <p><LoaderCircle className="spin" size={15}/>Inicializando núcleo local…</p>}{toast && <div role="alert" className="toast error">{toast.text}</div>}</div>

  let content: ReactNode
  if (panel === 'neural') content = null
  else if (panel === 'dashboard') content = null
  else if (panel === 'chat') content = <section className="chat-panel panel-surface"><div className="section-head"><span className="mini-title"><MessageSquare size={16} />{temporary?'TEMPORÁRIA':'CONVERSA'}</span><button className="text-button" onClick={toggleTemporary}>{temporary?'Salvar próximas conversas':'Conversa temporária'}</button><label className="compact-search"><Search size={15} /><input aria-label="Buscar conversa" placeholder="Buscar no histórico" value={chatFilter} onChange={e => setChatFilter(e.target.value)} /></label></div>
    {!status?.ai_configured && <Notice>Conecte o provedor de IA nas configurações para conversar sobre qualquer assunto. Hora, data, clima e tarefas já funcionam com comandos locais.</Notice>}
    <div className="chat-messages" aria-live="polite" aria-busy={busy}>{messages.filter(m => !chatFilter || m.content.toLowerCase().includes(chatFilter.toLowerCase())).map(m => <div className={`message ${m.role}`} key={m.id}><span className="message-avatar">{m.role === 'assistant' ? <AudioLines size={17} /> : 'EU'}</span><div><span className="message-name">{m.role === 'assistant' ? 'JARVIS' : 'VOCÊ'}{m.created_at && <time>{dateLabel(m.created_at)}</time>}</span><p>{m.content || (busy ? 'Pensando…' : 'Resposta interrompida.')}</p>{m.role === 'assistant' && m.content && <button className="text-button" aria-label="Ouvir resposta" onClick={() => voice.speak(m.content)}><Volume2 size={13} />Ouvir</button>}</div></div>)}
      {!messages.length && <Empty title="Uma boa conversa abre possibilidades." icon={<AudioLines size={36} />}>Experimente “abra tarefas” ou “crie tarefa Revisar projeto”. Com o provedor configurado, converse livremente.</Empty>}<div ref={chatBottom} /></div>
    {voice.interim && <div className="transcript"><Radio size={14} />{voice.interim}</div>}{sources.length > 0 && <div className="chat-sources">{sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowRight size={12} /></a>)}</div>}
    {composer()}<div className="chat-footer"><span><ShieldCheck size={12} />{status?.ai_configured ? `Modelo: ${status.ai_model}` : 'Comandos locais disponíveis'}</span><span>Confira informações importantes nas fontes.</span></div>
  </section>
  else if (panel === 'vision') content = <>
    <section className="panel-surface vision-intro"><div className="section-head"><span className="mini-title"><Fingerprint size={16} />INTERAÇÃO NATURAL</span><Badge tone={hands.active ? 'good' : 'muted'}>{hands.active ? 'Rastreamento ativo' : 'Câmera desligada'}</Badge></div><h2>Uma interface que acompanha você.</h2><p>Ative a câmera no painel Visão local. Mostre a mão aberta para habilitar a navegação, aponte e faça uma pinça curta para selecionar os elementos destacados.</p><Notice>A pinça funciona apenas em ações permitidas. Envio, exclusão e permissões exigem interação direta. Os quadros da câmera não são gravados nem enviados ao servidor.</Notice><div className="calibration-space"><div className="calibration-note" data-gesture-draggable="true"><Hand size={24} /><strong>Seu primeiro movimento</strong><span>Segure uma pinça sobre este cartão e mova a mão para arrastá-lo.</span></div></div></section>
    <section className="panel-surface"><div className="section-head"><h2>Vocabulário de gestos</h2><span className="mono">01 — 10</span></div><div className="gesture-grid">{[['✋','Mão aberta','Ativar navegação'],['☝','Indicador','Mover o cursor'],['👌','Pinça curta','Selecionar ao soltar'],['↔','Pinça mantida','Arrastar o cartão'],['✊','Mão fechada','Pausar interação'],['✌','Dois dedos','Abrir painel escolhido'],['👍','Sinal de positivo','Selecionar ação permitida'],['⇆','Mão para os lados','Alternar painéis'],['↕','Mão para cima/baixo','Rolar conteúdo'],['👐','Duas mãos abertas','Voltar ao início']].map(([symbol,title,desc]) => <div className="gesture-item" key={title}><span>{symbol}</span><div><strong>{title}</strong><small>{desc}</small></div></div>)}</div></section>
    <section className="panel-surface"><h2>Calibração individual</h2><label className="setting-row"><span><strong>Sensibilidade da pinça</strong><small>Maior valor aceita dedos mais afastados. Teste com sua mão no visor.</small></span><input aria-label="Sensibilidade da pinça" type="range" min="0.15" max="0.45" step="0.01" value={gestureConfig.pinchThreshold} onChange={e => setGestureConfig(c => ({ ...c, pinchThreshold: Number(e.target.value) }))} /><output>{gestureConfig.pinchThreshold.toFixed(2)}</output></label><label className="setting-row"><span><strong>Suavização do cursor</strong><small>Valores menores reduzem tremores.</small></span><input aria-label="Suavização do cursor" type="range" min="0.1" max="0.7" step="0.05" value={gestureConfig.smoothing} onChange={e => setGestureConfig(c => ({ ...c, smoothing: Number(e.target.value) }))} /></label><label className="setting-row"><span><strong>Painel ao mostrar dois dedos</strong><small>Remapeie o atalho para seu fluxo.</small></span><select value={peacePanel} onChange={e => setPeacePanel(e.target.value as Panel)}>{NAV.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label className="setting-row"><span><strong>Processamento do rastreamento</strong><small>CPU oferece maior compatibilidade. Desligue e reative a câmera após mudar.</small></span><select aria-label="Processamento do rastreamento" value={gestureConfig.delegate} onChange={e => setGestureConfig(c => ({ ...c, delegate: e.target.value as 'CPU' | 'GPU' }))}><option value="CPU">CPU (padrão)</option><option value="GPU">GPU (experimental)</option></select></label><button className="button secondary" onClick={() => { setGestureConfig(DEFAULT_CONFIG); setPeacePanel('tasks') }}>Restaurar calibração</button></section>
  </>
  else if (panel === 'tasks') content = <section className="panel-surface"><div className="section-head"><h2>Próximas ações <span className="count">{activeTasks.length}</span></h2><Badge>{tasks.filter(t => t.done).length} concluídas</Badge></div><form className="task-form" onSubmit={e => { e.preventDefault(); void perform(async () => { await api('/tasks', { method: 'POST', body: JSON.stringify({ title: taskTitle, priority: taskPriority, due_at: taskDue ? new Date(taskDue).toISOString() : null }) }); setTaskTitle(''); setTaskDue('') }, 'Tarefa criada.') }}><label className="grow">O que precisa ser feito?<input placeholder="Ex.: revisar as ideias do projeto" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required maxLength={300} /></label><div className="form-row"><label>Prazo (opcional)<input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)} /></label><label>Prioridade<select value={taskPriority} onChange={e => setTaskPriority(e.target.value)}><option value="normal">Normal</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></label><Submit busy={working}>Adicionar</Submit></div></form><div className="tasks-list">{tasks.map(taskRow)}{!tasks.length && <Empty title="Uma lista limpa. Muitas possibilidades." icon={<CheckCheck size={30} />}>Adicione sua primeira tarefa acima ou peça no chat.</Empty>}</div><p className="footnote">Os prazos são exibidos no seu fuso horário. Alertas aparecem aqui enquanto o aplicativo está aberto; não há notificações em segundo plano.</p></section>
  else if (panel === 'search') content = <section className="panel-surface"><div className="section-head"><h2>Explore uma pergunta</h2><Badge tone={status?.search_configured ? 'good' : 'warn'}>{status?.search_configured ? 'Brave Search configurado' : 'Provedor não configurado'}</Badge></div><form className="search-form" onSubmit={e => { e.preventDefault(); void perform(async () => { const result = await api<{ results: Source[] }>('/search', { method: 'POST', body: JSON.stringify({ query }) }); setSources(result.results) }) }}><Search size={20} /><input aria-label="Consulta de pesquisa" placeholder="O que você quer descobrir?" value={query} onChange={e => setQuery(e.target.value)} required minLength={2} maxLength={500} /><button className="button primary" disabled={working}>{working ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={18} />}Pesquisar</button></form>{!status?.search_configured && <Notice>Configure JARVIS_SEARCH_KEY no backend com uma chave da API Brave Search. Nenhum resultado demonstrativo é apresentado.</Notice>}<div className="search-results">{sources.map((s,i) => <article key={s.url}><span className="result-index">{String(i+1).padStart(2,'0')}</span><div><small>{new URL(s.url).hostname} {s.age && `· ${s.age}`}</small><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowRight size={16} /></a></h3><p>{s.description}</p></div></article>)}{!sources.length && <Empty title="Boas respostas começam com boas perguntas." icon={<Globe2 size={34} />}>Os resultados exibem links e trechos retornados pelo provedor, para você conferir cada fonte.</Empty>}</div>{searchHistory.length > 0 && <><h3>Pesquisas recentes</h3><div className="history-tags">{searchHistory.map(h => <button key={h.id} onClick={() => { setQuery(h.query); setSources(h.results) }} data-gesture-safe="true"><Clock3 size={13} />{h.query}</button>)}</div></>}</section>
  else if (panel === 'files') content = <><section className="panel-surface"><div className="section-head"><h2>Biblioteca pessoal <span className="count">{documents.length}</span></h2><Badge tone="good">Armazenamento local</Badge></div><label className={`upload-zone ${working ? 'disabled' : ''}`}><Upload size={28} /><strong>Adicione conhecimento ao seu espaço</strong><span>PDF, DOCX, TXT, MD, imagens e vídeos · Até 10 MB</span><input aria-label="Importar documento" type="file" accept=".txt,.pdf,.docx,.md,.png,.jpg,.jpeg,.webp,.mp4,.webm" disabled={working} onChange={e => { const file = e.target.files?.[0]; if (file) void perform(async () => { const body = new FormData(); body.append('file',file); await api('/documents', { method: 'POST', body }) }, 'Documento importado e indexado localmente.'); e.target.value = '' }} />{working && <LoaderCircle className="spin" size={20} />}</label><div className="document-list">{documents.map(d => <div className="document-row" key={d.id}><span className="file-icon"><FileText size={21} /></span><div><strong>{d.name}</strong><small>{d.characters.toLocaleString('pt-BR')} caracteres · Extração local</small></div><button className="icon-button danger-hover" aria-label={`Excluir documento ${d.name}`} onClick={() => setDeleteTarget({ path: `/documents/${d.id}`, label: d.name })}><Trash2 size={16} /></button></div>)}</div></section><section className="panel-surface"><h2>Encontre um trecho</h2><p className="muted">Busca local por palavras e termos. Busca semântica por embeddings ainda não implementada.</p><form className="search-form" onSubmit={e => { e.preventDefault(); void perform(async () => setFileResults(await api<FileResult[]>('/documents/search', { method: 'POST', body: JSON.stringify({ query: fileQuery }) }))) }}><Search size={18} /><input aria-label="Buscar nos documentos" placeholder="Procure um assunto nos seus arquivos" value={fileQuery} onChange={e => setFileQuery(e.target.value)} minLength={2} required /><button className="button primary" disabled={working}>Buscar</button></form>{fileResults.map((r,i) => <article className="file-excerpt" key={`${r.document_id}-${i}`}><strong><FileText size={14} />{r.name}<small>posição {r.offset}</small></strong><p>{r.excerpt}</p></article>)}<Toggle label="Autorizar trechos dos arquivos nesta conversa com IA" description="Ao ativar, trechos relevantes podem ser enviados ao provedor de IA para responder suas perguntas. Desligado por padrão e ao recarregar." checked={allowDocuments} onChange={setAllowDocuments} /></section></>
  else if (panel === 'integrations') content = <><section className="panel-surface"><div className="section-head"><h2>Conectores</h2><ShieldCheck size={18} className="accent" /></div><div className="connector-grid">{integrations.map(i => <article className={`connector ${i.mode === 'planned' ? 'planned' : ''}`} key={i.id}><span className="connector-logo">{i.id === 'telegram' ? <Send size={23} /> : <Link2 size={21} />}</span><div><strong>{i.name}</strong><small>{i.mode === 'planned' ? 'Planejado · sem conexão disponível' : i.configured ? 'Token configurado · acesso ainda não verificado' : 'Bot API · requer token no backend'}</small></div><Badge tone={i.mode === 'planned' ? 'muted' : i.configured ? 'good' : 'warn'}>{i.mode === 'planned' ? 'Planejado' : i.configured ? 'Configurado' : 'Sem chave'}</Badge></article>)}</div><Notice>Telegram é o primeiro adaptador real. Os demais estão no roteiro e não acessam contas. Para desconectar o bot, remova JARVIS_TELEGRAM_TOKEN e reinicie o backend; revogue o token no BotFather se necessário.</Notice></section><section className="panel-surface"><div className="section-head"><h2>Prepare uma mensagem</h2><span className="mini-title">TELEGRAM</span></div><form onSubmit={e => { e.preventDefault(); void perform(async () => { await api('/drafts', { method: 'POST', body: JSON.stringify({ platform: 'telegram', recipient, text: draftText }) }); setDraftText('') }, 'Rascunho criado. Revise antes de enviar.') }} className="draft-form"><label>ID numérico da conversa<input placeholder="Ex.: 123456789" value={recipient} onChange={e => setRecipient(e.target.value)} pattern="-?[0-9]{1,20}" required maxLength={21} /></label><label>Mensagem<textarea placeholder="Escreva o conteúdo para revisão…" value={draftText} onChange={e => setDraftText(e.target.value)} maxLength={4000} required rows={4} /></label><Submit busy={working}>Criar rascunho</Submit></form></section><section className="panel-surface"><h2>Rascunhos e envios <span className="count">{drafts.length}</span></h2>{drafts.map(d => <article className="draft-item" key={d.id}><div className="section-head"><span>Telegram · {d.recipient}</span><Badge tone={d.state === 'sent' ? 'good' : d.state === 'uncertain' ? 'warn' : 'muted'}>{{ draft: 'Aguardando revisão', sent: 'Envio confirmado', sending: 'Enviando', uncertain: 'Entrega incerta' }[d.state] || d.state}</Badge></div><p>{d.text}</p>{d.state === 'draft' && <button className="button secondary" data-sensitive="true" onClick={() => { setReview(d); setReviewChecked(false) }}>Revisar mensagem<ChevronRight size={15} /></button>}{d.state === 'uncertain' && <Notice>Consulte a conversa no Telegram antes de tentar um novo envio.</Notice>}{d.external_id && <small>ID confirmado pelo Telegram: {d.external_id}</small>}</article>)}{!drafts.length && <Empty title="Cada mensagem começa com um rascunho.">Prepare acima. O envio só acontece após sua revisão e confirmação.</Empty>}</section></>
  else content = <><section className="panel-surface"><h2>Experiência</h2><Toggle label="Ler respostas em voz alta" description="Usa a síntese de voz do navegador. Você pode interromper a qualquer momento." checked={readAloud} onChange={value => { setReadAloud(value); if (!value) voice.stop() }} /><label className="setting-row"><span><strong>Voz em português</strong><small>Opções disponibilizadas pelo seu navegador e sistema.</small></span><select aria-label="Voz de síntese" value={voice.voiceName} onChange={e => voice.setVoiceName(e.target.value)}><option value="">Automática (pt-BR)</option>{voice.voices.map(v => <option value={v.name} key={v.name}>{v.name}</option>)}</select></label><button className="button secondary" onClick={() => voice.speak("Olá! Esta é a voz do seu assistente Jarvis.")}><Volume2 size={16}/>Testar voz</button><Toggle label="Reduzir animações" description="Desativa os movimentos do núcleo e transições decorativas." checked={reduced} onChange={setReduced} /><Notice>A voz funciona por clique para falar. A palavra de ativação “Jarvis” ainda não está implementada. O reconhecimento Web Speech pode enviar áudio ao serviço do navegador; depende dele e da conexão.</Notice></section><section className="panel-surface"><h2>Serviços e privacidade</h2><div className="service-row"><span><Cpu size={17} />Modelo de linguagem</span><Badge tone={status?.ai_configured ? 'good' : 'warn'}>{status?.ai_configured ? status.ai_model : 'Não configurado'}</Badge></div><div className="service-row"><span><Globe2 size={17} />Brave Search</span><Badge tone={status?.search_configured ? 'good' : 'warn'}>{status?.search_configured ? 'Chave configurada' : 'Não configurado'}</Badge></div><div className="service-row"><span><ShieldCheck size={17} />Senha de acesso</span><Badge tone={status?.password_enabled ? 'good' : 'warn'}>{status?.password_enabled ? 'Ativada' : 'Modo localhost'}</Badge></div><div className="config-guide"><Terminal size={18} /><div><strong>Configuração no backend</strong><p>Copie <code>.env.example</code> para <code>.env</code> na raiz. Configure <code>JARVIS_OPENAI_KEY</code>, <code>JARVIS_SEARCH_KEY</code> e, se desejar, <code>JARVIS_TELEGRAM_TOKEN</code>. Reinicie o backend. As chaves ficam exclusivamente no servidor.</p></div></div><p className="footnote">Conversas enviadas à IA são processadas pelo provedor configurado. Histórico local com retenção de {status?.history_days || 30} dias, aplicada ao iniciar o backend. Documentos e tarefas são mantidos até você excluir.</p></section><section className="panel-surface"><div className="section-head"><h2>Registro de ações</h2><Activity size={17} /></div>{audits.slice(0,12).map(a => <div className="audit-row" key={a.id}><span>{a.action}</span><small>{dateLabel(a.created_at)}</small></div>)}{!audits.length && <p className="muted">As ações de ferramentas e envios aparecerão aqui.</p>}</section><section className="panel-surface danger-zone"><div><h2>Excluir dados locais</h2><p>Apaga conversas, tarefas, documentos, pesquisas e rascunhos. Não apaga mensagens já enviadas.</p></div><button className="button danger" onClick={() => { setClearConfirm(''); setDialog('clear') }} data-sensitive="true"><Trash2 size={16} />Excluir meus dados</button></section></>

  const toggleVoiceOutput = () => { setReadAloud(!readAloud); if (!readAloud) voice.speak('Respostas por voz ativadas. Estou à disposição.'); else voice.stop() }
  const openNews = () => {
    go('search'); const newsQuery = 'Principais notícias de hoje Brasil e mundo'; setQuery(newsQuery)
    if (status?.search_configured) void perform(async () => { const result = await api<{results:Source[]}>('/search', {method:'POST',body:JSON.stringify({query:newsQuery})}); setSources(result.results) })
    else notify('Conecte a pesquisa nas configurações para consultar notícias atuais.')
  }
  const brain = <Suspense fallback={<div className="panel-surface">Preparando o cérebro 3D…</div>}><NeuralMemory onSynthetic={setNeuralSynthetic} embedded expanded={panel==='neural'} active={panel==='neural'||panel==='dashboard'} onExpand={() => go(panel==='neural'?'dashboard':'neural')} frameHandler={neuralFrame} command={neuralCommand} cameraActive={hands.active} onCamera={() => hands.active ? hands.stop() : void hands.start()} onAsk={text=>void send(text)} busy={busy} answer={messages.at(-1)?.role==='assistant' ? messages.at(-1)!.content : ''} temporary={temporary} onTemporary={toggleTemporary} onRefresh={refresh} notify={notify} reduced={reduced} onVoice={() => voice.listening ? voice.stop() : startVoice()} listening={voice.listening} interim={voice.interim} allowDocuments={allowDocuments} onAllowDocuments={setAllowDocuments}/></Suspense>
  const camera = <section className="camera-card panel-surface"><div className="section-head"><span className="mini-title"><Camera size={15} />VISÃO LOCAL</span><span className={`camera-led ${hands.active ? 'on' : ''}`} /></div><div className={`camera-viewport ${hands.active ? 'camera-on' : ''}`}><video ref={hands.videoRef} muted playsInline aria-label="Sua câmera local" /><canvas ref={hands.canvasRef} aria-label="Pontos de rastreamento das mãos" />{!hands.active && <div className="camera-placeholder"><div className="camera-target"><CameraOff size={25} strokeWidth={1.3} /></div><strong>{hands.loading ? 'Preparando sua câmera…' : 'Seu próximo movimento'}</strong><span>{hands.loading ? 'Carregando o modelo local de mãos' : 'Controle sua interface com gestos'}</span></div>}<span className="camera-corner tl"/><span className="camera-corner tr"/><span className="camera-corner bl"/><span className="camera-corner br"/>{hands.active && <div className="camera-info"><span><span className="live-dot" />AO VIVO</span><span>{hands.fps} FPS</span></div>}</div><div className="camera-status"><span>{hands.active ? LABELS[hands.frame.gesture] : 'Câmera e rastreamento desligados'}</span>{hands.active && <span className="mono">{hands.frame.hands}/2</span>}</div><button className={`button ${hands.active || hands.loading ? 'secondary' : 'primary'} full-width`} disabled={false} onClick={() => hands.active || hands.loading ? hands.stop() : void hands.start()} data-sensitive={hands.active || hands.loading ? undefined : 'true'} data-gesture-safe={hands.active || hands.loading ? 'true' : undefined}>{hands.loading ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}{hands.loading ? 'Cancelar ativação' : hands.active ? 'Desligar câmera' : 'Ativar câmera'}</button><p className="camera-privacy"><ShieldCheck size={11} />Vídeo processado apenas neste dispositivo</p></section>
  return <div className={`jarvis-os panel-${panel} ${hands.active || hands.loading ? 'camera-visible' : ''}`}>
    <Hud environment={environment} status={status} panel={panel} go={go} brain={brain} onLocation={() => setLocationOpen(true)} onEmail={() => setDialog('email')} onNews={openNews} onStop={stopAll} onAsk={text => void send(text)} composer={composer()} camera={camera} tasks={tasks} answer={messages.at(-1)?.role==='assistant' ? messages.at(-1)!.content : ''} interim={voice.interim} busy={busy} listening={voice.listening} speaking={voice.speaking} readAloud={readAloud} onVoiceOutput={toggleVoiceOutput} onVoiceStop={voice.stop} reduced={reduced} temporary={temporary} onTemporary={toggleTemporary} cameraActive={hands.active} voiceSupported={voice.synthesisSupported}/>
    {panel !== 'dashboard' && panel !== 'neural' && <section className={`os-service-layer service-${panel}`} aria-label={NAV.find(n => n.id === panel)?.label}><header className="os-service-header"><span><span className="os-module-dot"/>JARVIS / {NAV.find(n => n.id === panel)?.label}</span><button className="icon-button" aria-label="Fechar módulo" title="Voltar ao núcleo" onClick={() => go('dashboard')} data-gesture-safe="true"><X size={18}/></button></header><main className="os-service-scroll" ref={scrollRef}><div className="page-heading"><div><h1>{TITLES[panel][0]}</h1><p>{TITLES[panel][1]}</p></div></div>{content}{panel==='settings'&&session.password_required&&<button className="button secondary" onClick={() => void logout()}>Bloquear núcleo</button>}</main></section>}
    {(voice.error || hands.error) && <div role="alert" className="os-device-error"><span>{voice.error || hands.error}</span><button className="text-button" onClick={() => go('settings')}>Ajustes</button></div>}
    {(voice.speaking || voice.listening) && panel!=='dashboard'&&panel!=='neural' && <button className="floating-voice-stop" onClick={voice.stop}><VolumeX size={17}/>{voice.speaking ? "Interromper fala" : "Parar microfone"}</button>}
    <div ref={cursor} className="gesture-cursor" aria-hidden="true"><span /></div>
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <X size={17} /> : <Check size={17} />}<span>{toast.text}</span><button aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={15} /></button></div>}
    {locationOpen && <LocationDialog environment={environment} onClose={() => setLocationOpen(false)} />}
    {dialog === 'email' && <Modal title="E-mails" onClose={() => setDialog(null)}><p>O e-mail ainda não está conectado. Nenhuma caixa de entrada é acessada e nenhum e-mail é enviado pelo Jarvis nesta versão.</p><button className="button secondary" onClick={() => { setDialog(null); go('integrations') }}>Ver conexões disponíveis<ChevronRight size={15}/></button></Modal>}
    {dialog === 'help' && <Modal title="Seu espaço, em poucos passos" onClose={() => setDialog(null)}><ol className="help-list"><li>Use o chat para conversar. Sem chave de IA, experimente “abra tarefas”.</li><li>Ative a câmera, mostre a mão aberta e aponte. Faça uma pinça curta e solte para selecionar.</li><li>Clique no microfone para ditar uma frase em português. O serviço de reconhecimento é do navegador.</li><li>Envios e exclusões precisam de confirmação direta. Gestos não os aprovam.</li></ol><p className="muted">ESC interrompe a voz e a resposta atual. O botão Interromper também desliga a câmera.</p><button className="button primary" onClick={() => setDialog(null)}>Entendi<Check size={16} /></button></Modal>}
    {dialog === 'voice' && <Modal title="Falar com o Jarvis" onClose={() => setDialog(null)}><p>O reconhecimento usa a Web Speech API do navegador. Dependendo do navegador, o áudio pode ser enviado ao serviço de transcrição dele. O Jarvis recebe o texto e não grava o áudio.</p><p>A captura começa apenas após sua permissão. O microfone para ao terminar a frase, ao trocar de aba ou ao clicar em Interromper.</p><button className="button primary full-width" onClick={() => { setVoiceConsent(true); setReadAloud(true); setDialog(null); voice.start() }}><Mic size={17} />Continuar e ativar microfone</button></Modal>}
    {dialog === 'notifications' && <Modal title="No seu radar" onClose={() => setDialog(null)}>{dueTasks.length ? dueTasks.map(t => <div className="notification-item" key={t.id}><Clock3 size={16} /><div><strong>{t.title}</strong><small>Prazo: {dateLabel(t.due_at!)}</small></div></div>) : <Empty title="Tudo tranquilo por aqui." icon={<Bell size={30} />}>Nenhuma tarefa com prazo vencido.</Empty>}{pendingDrafts.length > 0 && <p>{pendingDrafts.length} rascunho(s) aguardando revisão em Conexões.</p>}</Modal>}
    {review && <Modal title="Revise antes de enviar" onClose={() => { if (!working) setReview(null) }}><p className="muted">Esta ação envia uma mensagem real pelo bot Telegram configurado.</p><div className="review-recipient"><Send size={18} /><span>Conversa de destino<strong>{review.recipient}</strong></span></div><blockquote className="review-message">{review.text}</blockquote><label className="confirm-label"><input type="checkbox" checked={reviewChecked} onChange={e => setReviewChecked(e.target.checked)} />Conferi o destinatário e o conteúdo e autorizo este envio.</label><button className="button primary full-width" disabled={!reviewChecked || working} onClick={() => void perform(async () => { const approval = await api<{ token: string }>(`/drafts/${review.id}/approve`, { method: 'POST' }); try { await api(`/drafts/${review.id}/send`, { method: 'POST', body: JSON.stringify(approval) }); notify('Telegram confirmou o envio.') } finally { setReview(null); await refresh() } })}><Send size={16} />{working ? 'Enviando…' : 'Confirmar e enviar mensagem'}</button></Modal>}
    {deleteTarget && <Modal title="Excluir este item?" onClose={() => setDeleteTarget(null)}><p>“{deleteTarget.label}” será removido dos dados locais.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="button danger" disabled={working} onClick={() => void perform(async () => { await api(deleteTarget.path, { method: 'DELETE' }); setDeleteTarget(null); setFileResults([]) }, 'Item excluído.')}><Trash2 size={16} />Excluir</button></div></Modal>}
    {dialog === 'clear' && <Modal title="Excluir todos os dados locais" onClose={() => setDialog(null)}><p>Esta ação remove todas as informações armazenadas pelo Jarvis. Digite EXCLUIR para confirmar.</p><input aria-label="Confirmação de exclusão" value={clearConfirm} onChange={e => setClearConfirm(e.target.value)} placeholder="EXCLUIR" /><button className="button danger full-width" disabled={clearConfirm !== 'EXCLUIR' || working} onClick={() => void perform(async () => { await api('/data', { method: 'DELETE', headers: { 'X-Jarvis-Confirm': 'DELETE' } }); setSources([]); setFileResults([]); environment.select(null); setDialog(null) }, 'Dados locais excluídos.')}><Trash2 size={16} />Excluir permanentemente</button></Modal>}
  </div>
}
