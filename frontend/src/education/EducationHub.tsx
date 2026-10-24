import { useEffect, useState } from 'react'
import { BookOpen, BrainCircuit, Download, ExternalLink, FileText, LoaderCircle, Search, Share2, Square, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Modal } from '../components/UI'
import { PDFReader } from '../neural/MemoryReader'
import { WhatsAppShare } from './WhatsAppShare'
import { MATERIALS } from './types'
import type { EducationEvent, Job, JobSummary, Plan, Preferences, Research, TeachingFile } from './types'
import './education.css'

type Tab='professor'|'research'|'history'|'preferences'
const STATE:Record<string,string>={queued:'Na fila',running:'Em andamento',completed:'Pronto para revisão',failed:'Não concluído',cancelled:'Cancelado'}
export function EducationHub({event,onJob,onMemory}:{event:EducationEvent|null;onJob:(id:string)=>void;onMemory:()=>void}) {
  const [tab,setTab]=useState<Tab>('professor'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [providers,setProviders]=useState<Record<string,{configured:boolean;available?:boolean|null}>>({})
  const [preferences,setPreferences]=useState<Preferences|null>(null)
  const [topic,setTopic]=useState(''),[subject,setSubject]=useState('História'),[grade,setGrade]=useState(7),[lessons,setLessons]=useState(3),[questions,setQuestions]=useState(10),[videos,setVideos]=useState(3)
  const [materials,setMaterials]=useState(['lesson_plan','sequence','summary','slides','activities','answer_key'])
  const [activityType,setActivityType]=useState('mixed')
  const [adaptation,setAdaptation]=useState(''),[bncc,setBncc]=useState(false),[save,setSave]=useState(true),[ownText,setOwnText]=useState('')
  const [researchId,setResearchId]=useState<string|null>(null)
  const [query,setQuery]=useState(''),[provider,setProvider]=useState('both'),[research,setResearch]=useState<Research|null>(null),[researchHistory,setResearchHistory]=useState<Research[]>([])
  const [history,setHistory]=useState<JobSummary[]>([]),[filter,setFilter]=useState(''),[selected,setSelected]=useState<string|null>(null)
  const [job,setJob]=useState<Job|null>(null),[fileId,setFileId]=useState(''),[sharing,setSharing]=useState<TeachingFile|null>(null),[draft,setDraft]=useState<Plan|null>(null)
  const [deleting,setDeleting]=useState<{kind:'job'|'research';id:string}|null>(null),[note,setNote]=useState('')
  const run=async<T,>(action:()=>Promise<T>):Promise<T|undefined>=>{
    setBusy(true);setError('');setNote('')
    try{return await action()}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.')}
    finally{setBusy(false)}
  }
  const loadHistory=async()=>{
    const [jobs,researches]=await Promise.all([api<JobSummary[]>('/education/jobs'),api<Research[]>('/education/research')])
    setHistory(jobs);setResearchHistory(researches)
  }
  useEffect(()=>{
    let active=true
    void Promise.all([api<Preferences>('/education/preferences'),api<typeof providers>('/education/providers')]).then(([p,pr])=>{
      if(!active)return
      setPreferences(p);setProviders(pr);setSubject(p.subject);setGrade(p.grade);setLessons(p.lessons);setQuestions(p.questions);setSave(p.auto_save);setAdaptation(p.adaptation);setActivityType(p.activity_type)
    }).catch(e=>{if(active)setError(e.message)})
    void loadHistory().catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[])
  useEffect(()=>{
    if(!event)return
    if(event.job_id){setSelected(event.job_id);setTab('professor');setFileId('')}
    if(event.research){setResearch(event.research);setQuery(event.research.query);setTab('research')}
  },[event])
  useEffect(()=>{
    if(!selected)return
    let active=true
    setJob(null);setDraft(null);setError('')
    const poll=async()=>{
      try{
        const result=await api<Job>(`/education/jobs/${selected}`)
        if(!active)return
        setJob(result)
        if(!['running','queued'].includes(result.status))void loadHistory().catch(()=>{})
      }catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível consultar o progresso.')}
    }
    void poll()
    return()=>{active=false}
  },[selected])
  // Revisões e retomadas mantêm o mesmo identificador; continuam sendo acompanhadas.
  useEffect(()=>{
    if(!job||!['queued','running'].includes(job.status))return
    let active=true
    const timer=setTimeout(()=>{void api<Job>(`/education/jobs/${job.id}`).then(v=>{if(active){setJob(v);if(!['running','queued'].includes(v.status))void loadHistory().catch(()=>{})}}).catch(e=>{if(active)setError(e.message)})},2000)
    return()=>{active=false;clearTimeout(timer)}
  },[job])
  const openJob=(id:string)=>{setSelected(id);setTab('professor');setFileId('')}
  const start=()=>void run(async()=>{
    const result=await api<Job>('/education/jobs',{method:'POST',body:JSON.stringify({topic,subject,grade,lessons,questions,materials,videos,
      activity_type:activityType,adaptation,bncc,research_id:researchId,save_to_memory:save,prepare_share:true,content:ownText})})
    openJob(result.id);onJob(result.id);await loadHistory()
  })
  const doResearch=()=>void run(async()=>{
    const result=await api<Research>('/education/research',{method:'POST',body:JSON.stringify({query,provider,grade,videos:Math.max(1,videos),analyze:true})})
    setResearch(result);await loadHistory();setProviders(await api('/education/providers'))
  })
  const selectedFile=job?.files.find(f=>f.id===fileId)||job?.files.find(f=>f.revision===job.revision)||job?.files[0]
  const jobAction=(action:string)=>void run(async()=>{
    if(!job)return
    const result=await api<Job>(`/education/jobs/${job.id}/${action}`,{method:'POST'})
    setJob(result);if(action==='retry')onJob(result.id);await loadHistory()
    if(action==='save'){setNote('Planejamento e PDFs salvos no cérebro neural.');onMemory()}
  })
  const sources=(value:Research)=> <div className="education-research-results">
    {value.warnings.map((w,i)=><p className="education-warning" key={i}>{w}</p>)}
    {value.analysis&&<article className="education-analysis"><h3>Síntese das fontes</h3><p>{value.analysis.summary}</p>{value.analysis.conflicts.length>0&&<><h4>Divergências para conferir</h4>{value.analysis.conflicts.map((s,i)=><p key={i}>{s}</p>)}</>}<small>{value.analysis.limitations}</small></article>}
    <h3>Fontes <span className="count">{value.sources?.length||0}</span></h3>
    {value.sources?.map((s,i)=><article className="education-source" key={s.url}><span>{String(i+1).padStart(2,'0')}</span><div><a href={s.url} target="_blank" rel="noreferrer">{s.title}<ExternalLink size={13}/></a><p>{s.description}</p><small>{new URL(s.url).hostname} · Trecho retornado pela busca; confira a página original.</small></div></article>)}
    <h3>Vídeos educativos <span className="count">{value.videos?.length||0}</span></h3>
    <div className="education-videos">{value.videos?.map(v=><article key={v.id}><a href={v.url} target="_blank" rel="noreferrer"><img src={v.thumbnail} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none'}}/><strong>{v.title}<ExternalLink size={12}/></strong></a><small>{v.channel} · {v.duration_seconds?`${Math.floor(v.duration_seconds/60)}:${String(v.duration_seconds%60).padStart(2,'0')}`:'Duração não informada'}</small><p>{v.description.slice(0,220)}</p><small>{v.validation}</small></article>)}</div>
    {!value.sources?.length&&!value.videos?.length&&<p>Nenhuma fonte disponível para esta consulta. Verifique os provedores acima.</p>}
  </div>
  return <div className="education-hub">
    <div className="education-topline"><span><BookOpen size={18}/>PROFESSOR JARVIS</span><small>Uma ordem. Pesquisa, materiais e memória.</small></div>
    <nav className="education-tabs" aria-label="Central Pedagógica">{([['professor','Criar material'],['research','Pesquisar'],['history','Histórico'],['preferences','Preferências']] as const).map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>{setTab(id);setError('');if(id==='history')void loadHistory().catch(e=>setError(e.message))}} data-gesture-safe="true">{label}</button>)}</nav>
    <div className="education-providers" aria-label="Provedores pedagógicos">{[['ai','Professor IA','JARVIS_OPENAI_KEY'],['web','Pesquisa web','JARVIS_SEARCH_KEY'],['youtube','YouTube','YOUTUBE_API_KEY']].map(([id,label,key])=><span key={id} className={providers[id]?.configured?'configured':''} title={providers[id]?.configured?'Acesso depende da disponibilidade e da cota do provedor':`Configure ${key} no .env do backend`}><i/>{label}: {providers[id]?.configured?(providers[id]?.available===false?'indisponível':providers[id]?.available===true?'consultado':'chave configurada'):`configurar ${key}`}</span>)}</div>
    {error&&<p className="education-warning" role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
    {tab==='professor'&&<>
      <section className="education-card"><div className="section-head"><h2>O que vamos preparar?</h2>{selected&&<button className="text-button" onClick={()=>{setSelected(null);setJob(null)}}>Novo material</button>}</div>
        <p className="muted">Você também pode tocar no microfone do Jarvis e pedir a aula completa, com tema, ano, quantidade de aulas e atividades.</p>
        <form onSubmit={e=>{e.preventDefault();start()}}><label>Tema<input aria-label="Tema da aula" placeholder="Ex.: formação e queda do Império Romano" value={topic} onChange={e=>{setTopic(e.target.value);setResearchId(null)}} required minLength={2} maxLength={300}/></label>
          <div className="education-form-grid"><label>Disciplina<input value={subject} maxLength={80} onChange={e=>setSubject(e.target.value)}/></label><label>Ano escolar<input aria-label="Ano escolar" type="number" min={1} max={12} value={grade} onChange={e=>setGrade(+e.target.value)}/></label><label>Aulas<input aria-label="Quantidade de aulas" type="number" min={1} max={10} value={lessons} onChange={e=>setLessons(+e.target.value)}/></label><label>Atividades<input aria-label="Quantidade de atividades" type="number" min={1} max={40} value={questions} onChange={e=>setQuestions(+e.target.value)}/></label><label>Vídeos<input aria-label="Quantidade de vídeos" type="number" min={0} max={8} value={videos} onChange={e=>setVideos(+e.target.value)}/></label></div>
          <details><summary>Materiais e adaptações</summary><label>Tipo de atividade<select value={activityType} onChange={e=>setActivityType(e.target.value)}><option value="mixed">Objetivas e discursivas</option><option value="objective">Somente objetivas</option><option value="discursive">Somente discursivas</option></select></label><div className="education-materials">{Object.entries(MATERIALS).filter(([k])=>k!=='text').map(([k,label])=><label key={k}><input type="checkbox" checked={materials.includes(k)} onChange={e=>setMaterials(m=>e.target.checked?[...m,k]:m.filter(v=>v!==k))}/>{label}</label>)}</div><label>Adaptações para a turma<textarea aria-label="Adaptações para a turma" value={adaptation} maxLength={1500} onChange={e=>setAdaptation(e.target.value)} placeholder="Ex.: linguagem concreta, leitura orientada e atividades em etapas"/></label><label className="education-check"><input type="checkbox" checked={bncc} onChange={e=>setBncc(e.target.checked)}/>Consultar BNCC; incluir códigos apenas com evidência nas fontes.</label></details>
          <details><summary>Criar PDF a partir de um texto próprio</summary><p>Funciona sem IA. Com texto próprio, será gerado somente o PDF desse conteúdo.</p><textarea aria-label="Texto próprio para PDF" value={ownText} maxLength={40000} onChange={e=>setOwnText(e.target.value)} placeholder="Cole aqui o conteúdo que deseja transformar em PDF"/></details>
          <div className="education-actions"><label className="education-check"><input type="checkbox" checked={save} onChange={e=>setSave(e.target.checked)}/>Salvar materiais no cérebro</label><button className="button primary" disabled={busy||(!ownText&&!providers.ai?.configured)||(!ownText&&!materials.length)}>{busy?<LoaderCircle size={16} className="spin"/>:<BookOpen size={16}/>}Preparar materiais</button></div>
        </form>
      </section>
      {selected&&!job&&!error&&<p role="status">Carregando material…</p>}
      {job&&<section className="education-card education-job" aria-label="Material pedagógico"><div className="section-head"><div><span className="mini-title">{STATE[job.status]} · REVISÃO {job.revision}</span><h2>{job.plan.title||job.request.topic}</h2></div>{['queued','running'].includes(job.status)?<button className="button secondary" onClick={()=>jobAction('cancel')}><Square size={14}/>Cancelar</button>:<button className="icon-button" aria-label="Excluir material" onClick={()=>setDeleting({kind:'job',id:job.id})}><Trash2 size={16}/></button>}</div>
        <p role="status">{job.stage}</p><progress aria-label="Progresso do material" value={job.progress} max={100}/>
        {job.error&&<p className="education-warning" role="alert">{job.error}</p>}
        {['failed','cancelled'].includes(job.status)&&<button className="button secondary" onClick={()=>jobAction('retry')}>Tentar novamente</button>}
        {job.warnings.map((w,i)=><p className="education-warning" key={i}>{w}</p>)}
        {job.status==='completed'&&<><div className="education-actions"><a className="button primary" href={`/api/education/jobs/${job.id}/download`} download><Download size={15}/>Baixar todos os PDFs</a><button className="button secondary" disabled={busy} onClick={()=>jobAction('save')}><BrainCircuit size={15}/>{job.memory_id?'Atualizar no cérebro':'Salvar no cérebro'}</button>{job.plan.title&&<button className="button secondary" onClick={()=>setDraft(structuredClone(job.plan))}>Editar planejamento</button>}</div>
          {job.request.prepare_share&&<p>Compartilhamento preparado para revisão. Selecione um PDF e use “Revisar e compartilhar”.</p>}
        </>}
        {job.files.length>0&&<div className="education-file-workspace"><div className="education-file-list"><h3>Arquivos e revisões</h3>{job.files.map(f=><button key={f.id} className={selectedFile?.id===f.id?'selected':''} onClick={()=>setFileId(f.id)} data-gesture-safe="true"><FileText size={16}/><span>{MATERIALS[f.kind]||f.kind}<small>R{f.revision} · {f.pages} pág. · {Math.round(f.bytes/1024)} KB</small></span></button>)}</div>{selectedFile&&<div className="education-preview"><div className="education-actions"><strong>{MATERIALS[selectedFile.kind]}</strong><a className="button secondary" href={selectedFile.url+'?download=true'} download><Download size={14}/>PDF</a><button className="button secondary" disabled={job.status!=='completed'||!job.memory_id} title={!job.memory_id?'Salve no cérebro antes de compartilhar':undefined} data-sensitive="true" onClick={()=>setSharing(selectedFile)}><Share2 size={14}/>Revisar e compartilhar</button></div><PDFReader key={selectedFile.id} url={selectedFile.url}/></div>}</div>}
        {job.context.sources&&<details><summary>Pesquisa usada neste material</summary>{sources(job.context)}</details>}
        {job.shares.length>0&&<details><summary>Registro do compartilhamento assistido</summary>{job.shares.map(s=><p key={s.id}>{({prepared:'PDF preparado para revisão',initiated:'Compartilhador aberto',system_returned:'Sistema retornou; entrega não verificada',cancelled:'Cancelado',failed:'Falhou',downloaded:'Download solicitado'} as Record<string,string>)[s.state]||s.state} · {new Date(s.created_at).toLocaleString('pt-BR')}</p>)}</details>}
      </section>}
    </>}
    {tab==='research'&&<section className="education-card"><h2>Pesquise antes de ensinar</h2><form onSubmit={e=>{e.preventDefault();doResearch()}}><label>Assunto<input aria-label="Pesquisa pedagógica" value={query} onChange={e=>setQuery(e.target.value)} required minLength={2} maxLength={500}/></label><div className="education-actions"><label>Onde pesquisar<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="both">Fontes e YouTube</option><option value="web">Somente fontes web</option><option value="youtube">Somente YouTube</option></select></label><button className="button primary" disabled={busy}><Search size={15}/>{busy?'Pesquisando…':'Pesquisar'}</button></div></form>{research&&<><div className="education-actions"><button className="button secondary" disabled={busy||!research.id||!!research.memory_id} onClick={()=>void run(async()=>{const saved=await api<{memory_id:string}>(`/education/research/${research.id}/save`,{method:'POST'});setResearch({...research,...saved});onMemory()})}><BrainCircuit size={15}/>{research.memory_id?'Salvo no cérebro':'Salvar pesquisa no cérebro'}</button><button className="button secondary" onClick={()=>{setTopic(research.query.slice(0,300));setResearchId(research.id||null);setGrade(research.grade);setTab('professor')}}>Preparar aula sobre este tema</button></div>{sources(research)}</>}</section>}
    {tab==='history'&&<section className="education-card"><h2>Materiais e pesquisas salvos</h2><p className="muted">Este histórico está no núcleo do Jarvis. Dispositivos conectados ao mesmo núcleo consultam os mesmos registros.</p><label>Buscar por tema<input aria-label="Buscar material salvo" value={filter} onChange={e=>setFilter(e.target.value)}/></label><h3>Materiais</h3>{history.filter(h=>h.topic.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(h=><div className="education-history-row" key={h.id}><button onClick={()=>openJob(h.id)} data-gesture-safe="true"><BookOpen size={18}/><span><strong>{h.topic}</strong><small>{h.grade}º ano · {STATE[h.status]} · R{h.revision} · {new Date(h.created_at).toLocaleString('pt-BR')}</small></span></button><button className="icon-button" aria-label={`Excluir ${h.topic}`} onClick={()=>setDeleting({kind:'job',id:h.id})}><Trash2 size={15}/></button></div>)}{!history.length&&<p>Nenhum material criado ainda.</p>}<h3>Pesquisas</h3>{researchHistory.filter(r=>r.query.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(r=><div className="education-history-row" key={r.id}><button onClick={()=>{setResearch(r);setQuery(r.query);setTab('research')}}><Search size={17}/><span>{r.query}<small>{r.sources.length} fontes · {r.videos.length} vídeos</small></span></button><button className="icon-button" aria-label={`Excluir pesquisa ${r.query}`} onClick={()=>setDeleting({kind:'research',id:r.id!})}><Trash2 size={15}/></button></div>)}</section>}
    {tab==='preferences'&&preferences&&<section className="education-card"><h2>Seu modo de ensinar</h2><p className="muted">Esses dados personalizam os arquivos e ficam no núcleo local. Escola e nome do professor não são enviados ao modelo de IA.</p><form onSubmit={e=>{e.preventDefault();void run(async()=>{await api('/education/preferences',{method:'PUT',body:JSON.stringify(preferences)});setNote('Preferências salvas. Serão usadas nos próximos pedidos.');setGrade(preferences.grade);setSubject(preferences.subject);setLessons(preferences.lessons);setQuestions(preferences.questions);setSave(preferences.auto_save);setAdaptation(preferences.adaptation);setActivityType(preferences.activity_type)})}}><div className="education-form-grid">{([['school','Escola',160],['teacher','Professor(a)',120],['subject','Disciplina',80],['term','Bimestre ou período',80]] as const).map(([key,label,max])=><label key={key}>{label}<input value={preferences[key]} maxLength={max} onChange={e=>setPreferences({...preferences,[key]:e.target.value})}/></label>)}</div><div className="education-form-grid">{([['grade','Ano',12],['lessons','Aulas',10],['questions','Atividades',40]] as const).map(([key,label,max])=><label key={key}>{label}<input type="number" min={1} max={max} value={preferences[key]} onChange={e=>setPreferences({...preferences,[key]:+e.target.value})}/></label>)}<label>Estilo dos slides<select value={preferences.slide_style} onChange={e=>setPreferences({...preferences,slide_style:e.target.value})}><option value="clean">Claro e limpo</option><option value="visual">Visual</option><option value="high_contrast">Alto contraste</option></select></label></div><label>Tipo de atividade<select value={preferences.activity_type} onChange={e=>setPreferences({...preferences,activity_type:e.target.value})}><option value="mixed">Objetivas e discursivas</option><option value="objective">Somente objetivas</option><option value="discursive">Somente discursivas</option></select></label><label>Adaptações recorrentes<textarea value={preferences.adaptation} maxLength={1500} onChange={e=>setPreferences({...preferences,adaptation:e.target.value})}/></label><label className="education-check"><input type="checkbox" checked={preferences.auto_save} onChange={e=>setPreferences({...preferences,auto_save:e.target.checked})}/>Salvar novos materiais no cérebro automaticamente</label><button className="button primary" disabled={busy}>Salvar preferências</button></form></section>}
    {sharing&&job&&<WhatsAppShare job={job} file={sharing} onClose={()=>{setSharing(null);void api<Job>(`/education/jobs/${job.id}`).then(setJob).catch(()=>{})}}/>}
    {draft&&job&&<Modal title="Editar e gerar nova revisão" onClose={()=>setDraft(null)} wide><p>As versões anteriores permanecem disponíveis. Revise também os slides e as respostas ao alterar o conteúdo.</p><label>Título<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Resumo<textarea value={draft.overview} onChange={e=>setDraft({...draft,overview:e.target.value})}/></label>{draft.lessons.map((lesson,i)=><details key={i}><summary>Aula {i+1} · {lesson.title}</summary><label>Título<input value={lesson.title} onChange={e=>setDraft({...draft,lessons:draft.lessons.map((l,k)=>k===i?{...l,title:e.target.value}:l)})}/></label><label>Explicação<textarea value={lesson.explanation} onChange={e=>setDraft({...draft,lessons:draft.lessons.map((l,k)=>k===i?{...l,explanation:e.target.value}:l)})}/></label></details>)}{draft.activities.map((a,i)=><details key={i}><summary>Atividade {a.number}</summary>{(['prompt','answer','explanation'] as const).map(key=><label key={key}>{{prompt:'Enunciado',answer:'Gabarito',explanation:'Justificativa'}[key]}<textarea value={a[key]} onChange={e=>setDraft({...draft,activities:draft.activities.map((v,k)=>k===i?{...v,[key]:e.target.value}:v)})}/></label>)}</details>)}{draft.slides.map((slide,i)=><details key={i}><summary>Slide {i+1}</summary><label>Título<input value={slide.title} onChange={e=>setDraft({...draft,slides:draft.slides.map((s,k)=>k===i?{...s,title:e.target.value}:s)})}/></label><label>Tópicos, um por linha<textarea value={slide.bullets.join('\n')} onChange={e=>setDraft({...draft,slides:draft.slides.map((s,k)=>k===i?{...s,bullets:e.target.value.split('\n')}:s)})}/></label></details>)}<button className="button primary" disabled={busy} onClick={()=>void run(async()=>{const result=await api<Job>(`/education/jobs/${job.id}/plan`,{method:'PATCH',body:JSON.stringify(draft)});setDraft(null);setJob(result);setFileId('');onJob(result.id)})}>Gerar PDFs da nova revisão</button></Modal>}
    {deleting&&<Modal title="Excluir registro" onClose={()=>setDeleting(null)}><p>Excluir este registro e seus arquivos gerados? As cópias já baixadas ou compartilhadas permanecem nos dispositivos.</p><button className="button danger" disabled={busy} onClick={()=>void run(async()=>{await api(`/education/${deleting.kind==='job'?'jobs':'research'}/${deleting.id}`,{method:'DELETE'});if(selected===deleting.id){setJob(null);setSelected(null)}if(research?.id===deleting.id)setResearch(null);setDeleting(null);await loadHistory();onMemory()})}>Excluir</button></Modal>}
  </div>
}
