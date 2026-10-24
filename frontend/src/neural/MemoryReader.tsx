import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Search, X } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { api } from '../api'
import { CATEGORIES } from './types'
import type { MemoryDetail } from './types'

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const result = [], lower = text.toLocaleLowerCase('pt-BR'), needle = query.toLocaleLowerCase('pt-BR')
  let cursor = 0, found = 0
  while (found < 200) {
    const at = lower.indexOf(needle,cursor)
    if (at < 0) break
    result.push(text.slice(cursor,at),<mark key={at}>{text.slice(at,at+needle.length)}</mark>); cursor = at + needle.length; found++
  }
  result.push(text.slice(cursor)); return result
}
export function PDFReader({url}: {url: string}) {
  const [document,setDocument] = useState<PDFDocumentProxy | null>(null)
  const [page,setPage] = useState(1), [error,setError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true, destroy: (()=>void) | undefined
    void import('pdfjs-dist').then(pdf => {
      pdf.GlobalWorkerOptions.workerSrc = workerUrl
      const task = pdf.getDocument({url,withCredentials:true,enableXfa:false,useSystemFonts:true})
      destroy = () => { void task.destroy() }
      return task.promise
    }).then(doc => { if(active) setDocument(doc) }).catch(() => { if(active)setError('Não foi possível renderizar este PDF. Use o texto extraído ou baixe o original.') })
    return () => { active=false; destroy?.() }
  },[url])
  useEffect(() => {
    if(!document || !canvas.current)return
    let active = true, cancel:(()=>void)|undefined
    void document.getPage(page).then(pdfPage => {
      if(!active || !canvas.current)return
      const width = Math.max(250,canvas.current.parentElement!.clientWidth-30)
      const base = pdfPage.getViewport({scale:1}), viewport=pdfPage.getViewport({scale:Math.min(1.5,width/base.width)})
      canvas.current.width=viewport.width; canvas.current.height=viewport.height
      const task=pdfPage.render({canvas:canvas.current,canvasContext:canvas.current.getContext('2d')!,viewport})
      cancel=()=>task.cancel(); return task.promise
    }).catch(e=>{ if(active && e?.name!=='RenderingCancelledException')setError('Não foi possível desenhar esta página.') })
    return()=>{active=false;cancel?.()}
  },[document,page])
  return <div className="pdf-reader"><div className="pdf-controls"><button aria-label="Página anterior" disabled={page===1} onClick={()=>setPage(p=>p-1)} data-gesture-safe="true"><ChevronLeft size={16}/></button><span>Página {page} de {document?.numPages || '…'}</span><button aria-label="Próxima página" disabled={!document || page>=document.numPages} onClick={()=>setPage(p=>p+1)} data-gesture-safe="true"><ChevronRight size={16}/></button></div>{error?<p className="reader-error">{error}</p>:<canvas ref={canvas} aria-label={`Página ${page} do PDF original`}/>}</div>
}
export function MemoryReader({id,onBack,onRelated,onLesson}: {id:string;onBack:()=>void;onRelated:(id:string)=>void;onLesson?:(id:string)=>void}) {
  const [memory,setMemory]=useState<MemoryDetail|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[mode,setMode]=useState<'original'|'text'>('original')
  useEffect(()=>{ let active=true;setMemory(null);setError('');setQuery('');setMode('original');void api<MemoryDetail>(`/neural/nodes/${id}`).then(value=>{if(active)setMemory(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false} },[id])
  return <section className="memory-reader" data-neural-reader="true" aria-label="Leitor de memória"><header><button className="reader-back" onClick={onBack} data-gesture-safe="true"><ArrowLeft size={16}/>Voltar ao agrupamento</button><span>PINÇA REVERSA PARA VOLTAR</span><button className="icon-button" onClick={onBack} aria-label="Fechar arquivo" data-gesture-safe="true"><X size={18}/></button></header>{error?<p className="reader-error">{error}</p>:memory?<><div className="reader-title"><FileText size={22}/><div><h2>{memory.title}</h2><small>{new Date(memory.created_at).toLocaleString('pt-BR')} · {CATEGORIES.find(c=>c.id===memory.kind)?.label||memory.kind}</small></div>{memory.meta.lesson_id&&onLesson&&<button className="button secondary" onClick={()=>onLesson(memory.meta.lesson_id!)} data-gesture-safe="true">Abrir na Central Pedagógica</button>}{memory.original_url&&<a className="button secondary" href={memory.original_url+'?download=true'} download><Download size={14}/>Original</a>}</div><div className="reader-tools"><label><Search size={15}/><input aria-label="Pesquisar dentro do arquivo" value={query} onChange={e=>{setQuery(e.target.value);if(e.target.value)setMode('text')}} placeholder="Pesquisar no conteúdo…"/></label>{memory.mime==='application/pdf'&&<button className="text-button" onClick={()=>setMode(m=>m==='original'?'text':'original')} data-gesture-safe="true">{mode==='original'?'Texto extraído':'Ver PDF original'}</button>}</div><div className="reader-scroll" data-neural-scroll="true">{query&&<p className="reader-matches">{memory.content.toLocaleLowerCase().split(query.toLocaleLowerCase()).length-1} ocorrência(s) · até 200 destaques</p>}{mode==='original'&&memory.original_url&&memory.mime==='application/pdf'?<PDFReader url={memory.original_url}/>:mode==='original'&&memory.original_url&&memory.mime?.startsWith('image/')?<img className="memory-image" src={memory.original_url} alt={memory.title}/>:mode==='original'&&memory.original_url&&memory.mime?.startsWith('video/')?<video className="memory-video" src={memory.original_url} controls preload="metadata"/>:<pre className="memory-content">{highlight(memory.content,query)}</pre>}{!memory.original_url&&memory.kind==='document'&&<p className="reader-legacy">Arquivo da versão anterior: texto preservado. Reimporte para recuperar o download e a visualização do original.</p>}{memory.meta.sources?.length? <div className="memory-sources"><h3>Fontes consultadas</h3>{memory.meta.sources.map((source,i)=>source.url&&/^https?:\/\//.test(source.url)?<a href={source.url} key={i} target="_blank" rel="noreferrer">{source.title||source.url}</a>:<span key={i}>{source.title}</span>)}</div>:null}</div><footer><strong>Conhecimento relacionado</strong><div>{memory.related.slice(0,6).map(n=><button key={n.id} onClick={()=>onRelated(n.id)} data-gesture-safe="true" title={n.reason}>{n.title.slice(0,65)}<ChevronRight size={12}/></button>)}</div></footer></>:<p className="reader-loading">Abrindo memória…</p>}</section>
}
