import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BrainCircuit, ChevronRight, FileText, Hand, Layers3, Maximize2, Mic, MicOff, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X, ListFilter, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from '../api'
import { Modal, Toggle } from '../components/UI'
import type { GestureFrame } from '../gestures/engine'
import { NeuralGestureMachine, navigate } from './interaction'
import { benchmarkGraph } from './layout'
import { MemoryReader } from './MemoryReader'
import { NeuralScene } from './NeuralScene'
import type { SceneHandle } from './NeuralScene'
import { CATEGORIES, DEFAULT_NEURAL_GESTURE } from './types'
import type { MemoryDetail, MemoryGraph, MemoryNode, NeuralCommand, NeuralPreferences, NeuralSearchResult, NeuralView } from './types'


const EMPTY: MemoryGraph = {nodes:[],edges:[],total:0,revision:0,categories:{},next_offset:null,embedding_method:'TF-IDF + LSA local'}
const GLOBAL: NeuralView = {level:'global',selected:null,parent:null,layout_version:'brain-v2'}
const DEFAULT_PREFS: NeuralPreferences = {auto_save:true,gesture:DEFAULT_NEURAL_GESTURE,view:GLOBAL}

class SceneBoundary extends Component<{children:ReactNode}, {failed:boolean}> {
  state = {failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?<div className="neural-fallback"><BrainCircuit size={40}/><h3>Modo de leitura simplificado</h3><p>WebGL não ficou disponível neste navegador. Suas memórias continuam acessíveis pela lista e pela busca.</p></div>:this.props.children}
}
interface Props { onLesson?:(id:string)=>void; embedded?:boolean; expanded?:boolean; active?:boolean; onExpand?:()=>void; onSynthetic?:(value:boolean)=>void; frameHandler: MutableRefObject<((frame:GestureFrame)=>boolean)|null>; command:NeuralCommand|null; cameraActive:boolean; onCamera:()=>void; onAsk:(text:string)=>void; busy:boolean; answer:string; temporary:boolean; onTemporary:()=>void; onRefresh:()=>Promise<void>; notify:(text:string,error?:boolean)=>void; reduced:boolean; onVoice:()=>void; listening:boolean; interim:string; allowDocuments:boolean; onAllowDocuments:(value:boolean)=>void }

export function NeuralMemory({frameHandler,command,cameraActive,onCamera,onAsk,busy,answer,temporary,onTemporary,onRefresh,notify,reduced,onVoice,listening,interim,allowDocuments,onAllowDocuments,embedded=false,expanded=false,active=true,onExpand,onSynthetic,onLesson}:Props) {
  const [graph,setGraph]=useState<MemoryGraph>(EMPTY),[preferences,setPreferences]=useState<NeuralPreferences>(DEFAULT_PREFS)
  const [view,setView]=useState<NeuralView>(GLOBAL),[hovered,setHovered]=useState<string|null>(null),[detail,setDetail]=useState<MemoryDetail|null>(null)
  const [query,setQuery]=useState(''),[results,setResults]=useState<NeuralSearchResult[]|null>(null),[kind,setKind]=useState('')
  const [after,setAfter]=useState(''),[before,setBefore]=useState(''),[limit,setLimit]=useState(1000)
  const [fps,setFps]=useState(0),[ready,setReady]=useState(false),[phase,setPhase]=useState('Mão aberta para começar')
  const [effects,setEffects]=useState(!reduced),[low,setLow]=useState(false),[spread,setSpread]=useState(1)
  const [synthetic,setSynthetic]=useState(false),[settings,setSettings]=useState(false),[creating,setCreating]=useState(false)
  useEffect(()=>{onSynthetic?.(synthetic)},[synthetic,onSynthetic])
  const [removing,setRemoving]=useState(false),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true)
  const [title,setTitle]=useState(''),[note,setNote]=useState(''),[newKind,setNewKind]=useState<'note'|'project'>('note')
  const [members,setMembers]=useState<string[]>([]),[ask,setAsk]=useState('')
  const scene=useRef<SceneHandle>(null),root=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null)
  const machine=useRef(new NeuralGestureMachine()),latestFrame=useRef<(frame:GestureFrame)=>boolean>(()=>false)
  const viewRef=useRef(view),prefs=useRef(preferences),restore=useRef(false),mounted=useRef(true)
  const poseHistory=useRef(new Map<string,ReturnType<SceneHandle['snapshot']>>())
  const singleTimer=useRef<ReturnType<typeof setTimeout>|null>(null),saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const saveQueue=useRef(Promise.resolve()),lastSearch=useRef(0),queryRef=useRef(query)
  viewRef.current=view;prefs.current=preferences;queryRef.current=query
    const sampleGraph=useRef<MemoryGraph|null>(null)
  if(synthetic&&!sampleGraph.current)sampleGraph.current=benchmarkGraph(1000)
  const activeGraph=synthetic?sampleGraph.current!:graph

  const load=useCallback(async()=>{
    const params=new URLSearchParams({limit:String(limit)})
    if(kind)params.set('kind',kind)
    if(after)params.set('after',new Date(after+'T00:00:00').toISOString())
    if(before)params.set('before',new Date(before+'T23:59:59.999').toISOString())
    const next=await api<MemoryGraph>('/neural/graph?'+params)
    if(mounted.current)setGraph(next)
  },[limit,kind,after,before])
  const loadRef=useRef(load);loadRef.current=load
  const queueSave=useCallback((value:NeuralPreferences)=>{
    saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{await api('/neural/preferences',{method:'PUT',body:JSON.stringify(value)})})
    void saveQueue.current.catch(e=>notify(e.message,true))
    return saveQueue.current
  },[notify])
  const persistView=useCallback((next:NeuralView)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current)
    saveTimer.current=setTimeout(()=>queueSave({...prefs.current,view:next}),650)
  },[queueSave])
  useEffect(()=>{
    mounted.current=true
    void api<NeuralPreferences>('/neural/preferences').then(value=>{
      if(!mounted.current)return
      if(value.view.layout_version!=='brain-v2'){
        value.view=value.view.selected?.startsWith('category:')?GLOBAL:{...value.view,layout_version:'brain-v2',camera:null,target:null,global_camera:null,global_target:null,cluster_camera:null,cluster_target:null}
      }
      prefs.current=value;setPreferences(value);setView(value.view);viewRef.current=value.view;machine.current.config=value.gesture;restore.current=true
    }).catch(e=>notify(e.message,true))
    return()=>{mounted.current=false;if(singleTimer.current)clearTimeout(singleTimer.current);if(saveTimer.current)clearTimeout(saveTimer.current)}
  },[notify])
  useEffect(()=>{setLoading(true);void load().catch(e=>notify(e.message,true)).finally(()=>{if(mounted.current)setLoading(false)})},[load,notify])
  useEffect(()=>{
    const stream=new EventSource('/api/neural/events')
    stream.onmessage=()=>void loadRef.current().catch(e=>notify(e.message,true))
    return()=>stream.close()
  },[notify])
  useEffect(()=>{machine.current.config=preferences.gesture},[preferences.gesture])
  useEffect(()=>{
    if(!view.selected || view.selected.startsWith('category:') || synthetic){setDetail(null);return}
    let active=true
    void api<MemoryDetail>(`/neural/nodes/${view.selected}`).then(value=>{if(active)setDetail(value)}).catch(e=>{
      if(active){setDetail(null);setView(GLOBAL);viewRef.current=GLOBAL;if(e.message!=='Memória não encontrada.')notify(e.message,true)}
    })
    return()=>{active=false}
  },[view.selected,graph.revision,synthetic,notify])

  const transition=(action:'expand'|'open'|'back'|'global',id?:string)=>{
    if(synthetic&&action==='open'){notify('Nó sintético de teste: não existe arquivo associado.');action='expand'}
    const current=viewRef.current
    if(id?.startsWith('category:')&&action==='open')action='expand'
    if(id?.startsWith('category:')&&action==='expand'){setKind(id.split(':')[1]);setResults(null)}
    if(action==='global'||action==='back'&&current.level==='cluster'){setKind('');setResults(null)}
    const pose=scene.current?.snapshot()
    if(pose)poseHistory.current.set(`${current.level}:${current.selected||''}`,pose)
    let next=navigate(current,action,id)
    const old=poseHistory.current.get(`${next.level}:${next.selected||''}`)
    const globalPose=current.level==='global'?pose:null, clusterPose=current.level==='cluster'?pose:null
    const globalCamera=globalPose?.camera||current.global_camera||null, globalTarget=globalPose?.target||current.global_target||null
    const clusterCamera=clusterPose?.camera||current.cluster_camera||null, clusterTarget=clusterPose?.target||current.cluster_target||null
    next={...next,layout_version:'brain-v2',global_camera:globalCamera,global_target:globalTarget,cluster_camera:clusterCamera,cluster_target:clusterTarget,
      camera:old?.camera||((action==='back'||action==='global')?(next.level==='global'?globalCamera:next.level==='cluster'?clusterCamera:null):null),
      target:old?.target||((action==='back'||action==='global')?(next.level==='global'?globalTarget:next.level==='cluster'?clusterTarget:null):null)}
    if(action==='global'){next={...next,camera:null,target:null,global_camera:null,global_target:null};poseHistory.current.delete('global:')}
    viewRef.current=next;setView(next)
    if(!synthetic)queueSave({...prefs.current,view:next})
  }
  const transitionRef=useRef(transition);transitionRef.current=transition
  const select=(id:string,double=false)=>{
    if(singleTimer.current)clearTimeout(singleTimer.current)
    if(double)transition('open',id)
    else singleTimer.current=setTimeout(()=>transitionRef.current('expand',id),preferences.gesture.double_ms)
  }
  const search=useCallback(async(text:string)=>{
    const run=++lastSearch.current
    if(!text.trim()){setResults(null);return}
    const data=await api<{results:NeuralSearchResult[]}>('/neural/search',{method:'POST',body:JSON.stringify({query:text,kind:kind||null,after:after?new Date(after+'T00:00:00').toISOString():null,before:before?new Date(before+'T23:59:59.999').toISOString():null})})
    if(run!==lastSearch.current||!mounted.current)return
    setGraph(current=>({...current,nodes:[...current.nodes,...data.results.filter(n=>!current.nodes.some(old=>old.id===n.id))]}))
    setResults(data.results)
    if(data.results.length)transitionRef.current('expand',data.results[0].id)
  },[kind,after,before])
  useEffect(()=>{
    if(!command)return
    if(command.action==='neural_global')transitionRef.current('global')
    if(command.action==='neural_expand'&&viewRef.current.selected)transitionRef.current('expand',viewRef.current.selected)
    if(command.action==='neural_search'&&command.query){setQuery(command.query);void search(command.query).catch(e=>notify(e.message,true))}
  },[command,search,notify])

  latestFrame.current=frame=>{
    const measurement=frame.measurement
    if(!measurement||!frame.hands||!frame.active){machine.current.reset();return false}
    const pointer=frame.cursor||measurement.tip
    const hit=document.elementFromPoint(pointer.x*innerWidth,pointer.y*innerHeight)
    const reading=!!hit?.closest('[data-neural-reader]')
    const stage=!!hit?.closest('[data-neural-stage]')
    if(!stage&&!reading || hit?.closest('button,input,select,textarea,a,[role="dialog"]')){machine.current.reset();return false}
    const target=scene.current?.hitTest(pointer)||null
    const actions=machine.current.sample({visible:true,active:frame.active,ratio:measurement.ratio,point:pointer,target},performance.now())
    if(target)setHovered(current=>current===target?current:target)
    if(actions.length)setPhase(machine.current.phase)
    for(const action of actions){
      if(action.type==='single'&&action.target&&!reading)transition('expand',action.target)
      if(action.type==='double'&&action.target&&!reading)transition('open',action.target)
      if(action.type==='reverse')transition('back')
      if(action.type==='drag')scene.current?.orbit(action.dx||0,action.dy||0)
    }
    return true
  }
  useEffect(()=>{frameHandler.current=frame=>latestFrame.current(frame);return()=>{frameHandler.current=null}},[frameHandler])
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(!active)return
      if((event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"]'))return
      if(event.key==='Escape'||event.key==='Backspace'){event.preventDefault();transitionRef.current('back')}
      if(event.key==='0')transitionRef.current('global')
      if(event.key.toLowerCase()==='o'&&viewRef.current.selected)transitionRef.current('open',viewRef.current.selected)
    }
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard)
  },[active])
  const onReady=useCallback(()=>setReady(true),[])
  const onCameraRest=()=>{
    if(synthetic)return
    const pose=scene.current?.snapshot()
    if(pose){const next={...viewRef.current,...pose};viewRef.current=next;persistView(next)}
  }
  const changePreference=(value:NeuralPreferences)=>{
    void queueSave({...value,view:viewRef.current}).then(()=>{prefs.current=value;setPreferences(value)}).catch(()=>{setPreferences({...prefs.current})})
  }
  const selectedNode=activeGraph.nodes.find(n=>n.id===view.selected)
  const cluster=view.selected?.startsWith('category:')?CATEGORIES.find(c=>`category:${c.id}`===view.selected):null
  const list=(results?results.map(r=>activeGraph.nodes.find(n=>n.id===r.id)).filter(Boolean) as MemoryNode[]:activeGraph.nodes).filter(n=>!kind||n.kind===kind)

  return <div className={`neural-memory ${embedded?'embedded-brain':''} ${expanded?'brain-expanded':''} ${synthetic?'is-synthetic':''}`} ref={root} data-testid="neural-memory"><div className="neural-toolbar"><div className="neural-brand"><BrainCircuit size={21}/><div><strong>Cérebro de memórias</strong><span>SEU CONHECIMENTO CONECTADO</span></div><span className="neural-live-dot"/></div><div className="neural-toolbar-actions">{embedded&&<button aria-label={expanded?"Recolher explorador de memórias":"Explorar memórias"} title={expanded?"Recolher lista":"Explorar memórias"} onClick={onExpand} data-gesture-safe="true"><ListFilter size={15}/></button>}<span className={synthetic?'synthetic-status':'neural-local-status'}>{synthetic?'TESTE SINTÉTICO · NÃO SALVO':'MEMÓRIA LOCAL'}</span><button aria-label="Importar memória" onClick={()=>file.current?.click()}><Upload size={15}/><span>Adicionar arquivo</span></button><button aria-label="Nova nota ou projeto" onClick={()=>{if(synthetic)notify('Saia do teste sintético para criar uma memória real.');else setCreating(true)}}><Plus size={16}/></button><button aria-label="Configurações neurais" onClick={()=>setSettings(true)}><Settings2 size={16}/></button></div></div>
    <input ref={file} type="file" className="neural-file-input" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp4,.webm" onChange={e=>{
      const selected=e.target.files?.[0];e.target.value='';if(!selected)return
      if(synthetic){notify('Desative o teste sintético antes de importar.');return}
      setSaving(true);const body=new FormData();body.append('file',selected)
      void api<{duplicate:boolean;node_id:string}>('/documents',{method:'POST',body}).then(async value=>{await load();await onRefresh();notify(value.duplicate?'Este arquivo já está na memória.':'Nova memória adicionada ao cérebro.');if(value.node_id)transitionRef.current('expand',value.node_id)}).catch(e=>notify(e.message,true)).finally(()=>setSaving(false))
    }}/>
    <div className="neural-workspace"><aside className="neural-explorer"><div className="neural-counts"><strong>{activeGraph.total.toLocaleString('pt-BR')}</strong><span>memórias {synthetic?'de teste':'registradas'}</span><small>{activeGraph.edges.length} relações neste recorte</small></div><form className="neural-search" onSubmit={e=>{e.preventDefault();void search(query).catch(e=>notify(e.message,true))}}><Search size={14}/><input aria-label="Buscar no cérebro" placeholder="Buscar no cérebro…" value={query} onChange={e=>setQuery(e.target.value)} minLength={2}/><button aria-label="Pesquisar memória" disabled={synthetic}><ArrowRight size={14}/></button></form>{results&&<button className="neural-clear-search" onClick={()=>{setQuery('');setResults(null)}}>{results.length} resultado(s) · limpar<X size={11}/></button>}<details className="memory-categories"><summary>Tipos de memória<Layers3 size={12}/></summary><div className="neural-categories">{CATEGORIES.map(cat=><button key={cat.id} onClick={()=>{setKind(k=>k===cat.id?'':cat.id);setResults(null)}} className={kind===cat.id?'selected':''} data-gesture-safe="true"><i style={{background:cat.color}}/><span>{cat.label}</span><small>{activeGraph.categories[cat.id]||0}</small></button>)}</div></details><div className="neural-sidebar-heading">{results?'RESULTADOS':'MEMÓRIAS RECENTES'}<span>{list.length}</span></div><div className="neural-node-list" aria-label="Lista de memórias">{list.slice(0,100).map(n=><button key={n.id} onClick={()=>select(n.id)} onDoubleClick={()=>select(n.id,true)} className={view.selected===n.id?'selected':''} title="Clique para expandir; clique duplo para abrir; tecla O abre a seleção" data-testid={`memory-${n.id}`} data-gesture-safe="true"><i style={{background:CATEGORIES.find(c=>c.id===n.kind)?.color}}/><span>{n.title}</span><ChevronRight size={11}/></button>)}{!list.length&&<p>{loading?'Lendo memórias…':'Adicione um arquivo ou converse com o Jarvis para começar.'}</p>}</div>{graph.next_offset!==null&&!synthetic&&<button className="neural-load-more" onClick={()=>setLimit(n=>Math.min(5000,n+1000))} disabled={limit>=5000}>Carregar mais memórias</button>}<button className="neural-new-memory" onClick={()=>{if(synthetic)notify('Saia do teste sintético para criar uma memória real.');else setCreating(true)}}><Plus size={13}/>Nova nota ou projeto</button></aside>
    <div className="neural-stage" data-neural-stage="true" data-view={view.level} data-memory-count={activeGraph.nodes.length} data-memory-ids={activeGraph.nodes.map(n=>n.id).join(',')} data-testid="neural-stage"><div className="neural-scene-heading"><div className="neural-breadcrumb"><button onClick={()=>transition('global')} data-gesture-safe="true">Cérebro completo</button>{view.level!=='global'&&<><ChevronRight size={11}/><span>{cluster?.label||selectedNode?.title||detail?.title||'Memória'}</span></>}</div><div><button onClick={()=>transition('back')} aria-label="Voltar um nível" disabled={view.level==='global'} data-gesture-safe="true"><ArrowLeft size={15}/></button><button aria-label="Aproximar cérebro" title="Aproximar" onClick={()=>scene.current?.zoom(.74)} data-gesture-safe="true"><ZoomIn size={15}/></button><button aria-label="Afastar cérebro" title="Afastar" onClick={()=>scene.current?.zoom(1.35)} data-gesture-safe="true"><ZoomOut size={15}/></button><button onClick={()=>transition('global')} aria-label="Enquadrar cérebro completo" data-gesture-safe="true"><Maximize2 size={15}/></button></div></div>
      <SceneBoundary><NeuralScene active={active} ref={scene} graph={activeGraph} view={view} matches={results?.map(r=>r.id)||null} hovered={hovered} spread={spread} effects={effects} reduced={reduced} low={low} onHover={setHovered} onSelect={select} onStats={setFps} onReady={onReady} onCamera={onCameraRest}/></SceneBoundary>
      {!loading&&!activeGraph.nodes.length&&<div className="neural-onboarding"><Sparkles size={23}/><h2>Um universo começa com uma memória.</h2><p>Adicione um arquivo, registre uma ideia ou faça sua primeira pergunta. As conexões surgem a partir do seu conhecimento.</p><button onClick={()=>file.current?.click()}><Upload size={14}/>Adicionar primeira memória</button></div>}
      <aside className="neural-inspector"><div className="neural-jarvis-orb"><div/><div/><span>J.A.R.V.I.S.<small>NEURAL CORE</small></span></div><span className="neural-core-status"><i/> {synthetic?'AMOSTRA DE TESTE':'ARMAZENAMENTO LOCAL'}</span>{view.level!=='global'&&<section><span className="inspector-label">{cluster?'AGRUPAMENTO':'MEMÓRIA EM FOCO'}</span><h3>{cluster?.label||selectedNode?.title||detail?.title}</h3><p>{cluster?`${activeGraph.categories[cluster.id]||0} memórias deste tipo.`:detail?.excerpt||selectedNode?.excerpt}</p>{!cluster&&<button className="neural-open" onClick={()=>view.selected&&transition('open',view.selected)} data-gesture-safe="true"><FileText size={13}/>Abrir memória</button>}{!synthetic&&!cluster&&detail&&<button className="neural-delete" onClick={()=>setRemoving(true)} aria-label="Excluir memória selecionada"><Trash2 size={11}/>Excluir memória</button>}{detail?.related.slice(0,4).map(n=><button className="neural-relation" key={n.id} onClick={()=>transition('expand',n.id)} title={n.reason} data-gesture-safe="true"><strong>{n.title.slice(0,45)}</strong><small>{n.reason}</small></button>)}</section>}</aside>
      {!embedded&&<div className="neural-bottom-dock"><div className="neural-gesture-feedback"><Hand size={13}/><span>{listening?(interim||'Ouvindo você…'):cameraActive?phase:'Mouse, teclado ou gestos'}</span><span className="neural-navigation-state">{view.level==='global'?'VISÃO GLOBAL':view.level==='file'?'ARQUIVO ABERTO':'AGRUPAMENTO EXPANDIDO'}</span></div><form onSubmit={e=>{e.preventDefault();if(ask.trim()){onAsk(ask);setAsk('')}}}><BrainCircuit size={17}/><input aria-label="Perguntar ao cérebro" disabled={synthetic} value={ask} onChange={e=>setAsk(e.target.value)} placeholder="Pergunte ao Jarvis ou encontre uma memória…" maxLength={8000}/><button type="button" aria-label={listening?'Parar microfone neural':'Falar com cérebro'} onClick={onVoice} disabled={synthetic} className={listening?'neural-mic-active':''}>{listening?<MicOff size={15}/>:<Mic size={15}/>}</button><button aria-label="Enviar pergunta neural" disabled={synthetic||busy||!ask.trim()}><ArrowRight size={17}/></button></form>{(busy||answer)&&<p className="neural-last-answer" aria-live="polite">{busy&&!answer?'Jarvis está pensando…':answer.slice(0,400)}</p>}<div className="neural-hints"><span>PINÇA <b>expande</b></span><span>PINÇA ×2 <b>abre</b></span><span>ABERTURA INTENCIONAL <b>volta</b></span><span>SEGURAR <b>orbita</b></span></div></div>
      }<div className="neural-scene-stats"><span className="neural-live-dot"/>{ready?'CENÁRIO ATIVO':'CARREGANDO 3D'}<output aria-label="FPS do cenário">{fps} FPS</output><span>{activeGraph.nodes.length} memórias visíveis</span><span>Profundidade 3D real</span></div>
      <button className={`neural-gestures-toggle ${cameraActive?'active':''}`} onClick={onCamera} aria-label={cameraActive?'Pausar câmera neural':'Habilitar gestos neurais'}><Hand size={14}/>{cameraActive?'Gestos ativos':'Habilitar gestos'}</button>
      {view.level==='file'&&view.selected&&!view.selected.startsWith('category:')&&!synthetic&&<MemoryReader onLesson={onLesson} id={view.selected} onBack={()=>transition('back')} onRelated={id=>transition('open',id)}/>}
    </div></div>
    <div className="neural-footer"><span><ShieldCheck size={11}/>Conteúdo e vetores processados localmente · {graph.embedding_method}</span><span>{saving?'Importando memória…':synthetic?'Dados sintéticos isolados do banco':preferences.auto_save&&!temporary?'Registro automático ativo':temporary?'Conversa temporária':'Registro automático pausado'}</span></div>
    {settings&&<Modal title="Controle do cérebro neural" onClose={()=>setSettings(false)}><div className="neural-settings"><Toggle label="Permitir que a IA consulte minhas memórias" description="Trechos relevantes podem ser enviados ao provedor de IA. Desligado por padrão e ao recarregar a página." checked={allowDocuments} onChange={onAllowDocuments}/><Toggle label="Salvar perguntas, respostas e pesquisas no cérebro" description="Arquivos adicionados explicitamente continuam sendo salvos. Desativar não apaga as memórias existentes." checked={preferences.auto_save} onChange={checked=>changePreference({...prefs.current,auto_save:checked})}/><button className="button secondary" onClick={onTemporary}>{temporary?'Voltar à conversa persistente':'Iniciar conversa temporária'}</button><p className="muted">Uma conversa temporária não grava perguntas, respostas ou pesquisas. Tarefas e rascunhos solicitados explicitamente continuam sendo ações reais.</p><Toggle label="Modo de desempenho" description="Reduz resolução, geometria e conexões visíveis." checked={low} onChange={setLow}/><Toggle label="Brilho e pulsos" checked={effects} onChange={setEffects}/><label>Separação dos neurônios<input type="range" min=".6" max="1.8" step=".1" value={spread} onChange={e=>setSpread(Number(e.target.value))}/></label><label>Janela da pinça dupla: {preferences.gesture.double_ms} ms<input type="range" min="300" max="700" step="50" value={preferences.gesture.double_ms} onChange={e=>changePreference({...prefs.current,gesture:{...prefs.current.gesture,double_ms:Number(e.target.value)}})}/></label><label>Contato da pinça: {preferences.gesture.pinch_threshold.toFixed(2)} da palma<input type="range" min=".12" max=".5" step=".01" value={preferences.gesture.pinch_threshold} onChange={e=>changePreference({...prefs.current,gesture:{...prefs.current.gesture,pinch_threshold:Number(e.target.value)}})}/></label><label>Amplitude da pinça reversa: {preferences.gesture.reverse_amplitude.toFixed(2)} palmas<input type="range" min=".5" max="1.5" step=".05" value={preferences.gesture.reverse_amplitude} onChange={e=>changePreference({...prefs.current,gesture:{...prefs.current.gesture,reverse_amplitude:Number(e.target.value)}})}/></label><p className="muted">Para voltar, espere a soltura normal terminar, mantenha polegar e indicador meio separados por um instante e abra mais, de forma contínua. A soltura comum não retorna de nível.</p><div className="neural-date-filters"><label>A partir de<input type="date" value={after} onChange={e=>setAfter(e.target.value)}/></label><label>Até<input type="date" value={before} onChange={e=>setBefore(e.target.value)}/></label></div><Toggle label="Teste visual com 1.000 nós sintéticos" description="Somente desempenho. Não cria nem mistura memórias no banco." checked={synthetic} onChange={checked=>{if(checked&&listening)onVoice();setSynthetic(checked);setResults(null);setView(GLOBAL);viewRef.current=GLOBAL}}/></div></Modal>}
    {creating&&<Modal title="Adicionar conhecimento" onClose={()=>setCreating(false)}><form className="neural-create-form" onSubmit={e=>{e.preventDefault();if(saving)return;setSaving(true);void api<MemoryNode>('/neural/nodes',{method:'POST',body:JSON.stringify({title,content:note,kind:newKind,members:newKind==='project'?members:[]})}).then(async value=>{setCreating(false);setTitle('');setNote('');setMembers([]);await load();transitionRef.current('expand',value.id);notify('Memória salva no cérebro.')}).catch(e=>notify(e.message,true)).finally(()=>setSaving(false))}}><label>Tipo<select value={newKind} onChange={e=>setNewKind(e.target.value as 'note'|'project')}><option value="note">Nota</option><option value="project">Projeto</option></select></label><label>Título<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={300}/></label><label>Conhecimento<textarea value={note} onChange={e=>setNote(e.target.value)} rows={5} maxLength={50000}/></label>{newKind==='project'&&<fieldset><legend>Vincular memórias ao projeto</legend>{graph.nodes.filter(n=>n.kind!=='topic'&&n.kind!=='conversation').slice(0,100).map(n=><label key={n.id}><input type="checkbox" checked={members.includes(n.id)} onChange={e=>setMembers(ids=>e.target.checked?[...ids,n.id]:ids.filter(id=>id!==n.id))}/>{n.title}</label>)}</fieldset>}<button className="button primary" disabled={saving}><Plus size={15}/>Salvar memória</button></form></Modal>}
    {removing&&detail&&<Modal title="Excluir esta memória?" onClose={()=>setRemoving(false)}><p>“{detail.title}” e suas conexões serão removidos. {['document','image','video'].includes(detail.kind)?'O arquivo original também será apagado do armazenamento local.':detail.kind==='task'?'A tarefa na agenda será preservada. Esta memória não reaparecerá ao reiniciar.':'O registro correspondente também será removido do histórico, quando existir.'} Outras memórias serão preservadas.</p><button className="button danger" disabled={saving} onClick={()=>{setSaving(true);void api(`/neural/nodes/${detail.id}`,{method:'DELETE'}).then(async()=>{setRemoving(false);transitionRef.current('global');await load();await onRefresh();notify('Memória e conexões removidas.')}).catch(e=>notify(e.message,true)).finally(()=>setSaving(false))}}><Trash2 size={15}/>Confirmar exclusão</button></Modal>}
  </div>
}
