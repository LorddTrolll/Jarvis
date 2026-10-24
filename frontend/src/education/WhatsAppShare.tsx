import { useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { api } from '../api'
import { Modal } from '../components/UI'
import { PDFReader } from '../neural/MemoryReader'
import type { Job, TeachingFile } from './types'

export function WhatsAppShare({job,file,onClose}:{job:Job;file:TeachingFile;onClose:()=>void}) {
  const [message,setMessage]=useState(`Preparei este material sobre ${job.request.topic} para o ${job.request.grade}º ano. Segue o PDF para nossa troca de ideias.`)
  const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('')
  const [prepared,setPrepared]=useState<{id:string;file:File}|null>(null)
  const reset=()=>{setPrepared(null);setNote('');setError('')}
  const prepare=async()=>{
    setBusy(true);setError('')
    try {
      const result=await api<{id:string}>(`/education/jobs/${job.id}/share`,{method:'POST',body:JSON.stringify({file_id:file.id,message,reviewed})})
      const response=await fetch(file.url,{credentials:'same-origin'})
      if(!response.ok)throw new Error('Não foi possível carregar o PDF para compartilhar.')
      const blob=await response.blob()
      if(blob.type!=='application/pdf'||blob.size>10_000_000)throw new Error('Arquivo PDF inválido para compartilhamento.')
      setPrepared({id:result.id,file:new File([blob],file.name,{type:'application/pdf'})})
    } catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar o compartilhamento.')}
    finally{setBusy(false)}
  }
  const outcome=(state:string)=>api(`/education/shares/${prepared!.id}/outcome`,{method:'POST',body:JSON.stringify({state})})
  let native=false
  try{native=!!prepared&&!!navigator.canShare?.({files:[prepared.file]})&&!!navigator.share}catch{/* Downloads continuam disponíveis. */}
  const share=()=>{
    if(!prepared||!native||busy)return
    setBusy(true);setError('');setNote('')
    // A chamada nativa permanece no clique direto; buscar o arquivo aqui perderia a ativação do usuário.
    const initiated=outcome('initiated').then(()=>true,()=>false)
    let operation:Promise<void>
    try{operation=navigator.share({files:[prepared.file],text:message,title:job.plan.title||job.request.topic})}
    catch(e){operation=Promise.reject(e)}
    void operation.then(async()=>{
      if(await initiated)await outcome('system_returned')
      else setError('O sistema retornou, mas não foi possível registrar o evento no núcleo.')
      setNote('O compartilhador foi encerrado. A entrega no WhatsApp não pode ser verificada pelo Jarvis.')
    }).catch(async e=>{
      const cancelled=e instanceof DOMException&&e.name==='AbortError'
      try{if(await initiated)await outcome(cancelled?'cancelled':'failed')}catch{/* Não simula um registro remoto. */}
      setNote(cancelled?'Compartilhamento cancelado. Nenhuma entrega confirmada.':'Não foi possível concluir o compartilhamento. Baixe o PDF e anexe no WhatsApp.')
    }).finally(()=>setBusy(false))
  }
  const download=()=>{
    if(!prepared)return
    const url=URL.createObjectURL(prepared.file),link=document.createElement('a')
    link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000)
    void outcome('downloaded').catch(()=>setError('Download solicitado, mas não foi possível registrar o evento.'))
    setNote('Download solicitado. Abra o WhatsApp, escolha o grupo e anexe o PDF; confirme o envio por lá.')
  }
  return <Modal title="Revisar e compartilhar PDF" onClose={onClose} wide>
    <p>Confira o arquivo e a mensagem. No compartilhador do dispositivo, escolha o WhatsApp, o grupo e confirme o envio.</p>
    <PDFReader key={file.id} url={file.url}/>
    {file.kind==='answer_key'&&<p className="education-warning">Você selecionou o gabarito do professor. Confira o destinatário antes de compartilhar.</p>}
    <label>Mensagem que acompanha o PDF<textarea aria-label="Mensagem do compartilhamento" value={message} maxLength={4000} onChange={e=>{setMessage(e.target.value);reset()}}/></label>
    <label className="education-check"><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);reset()}}/>Revisei este PDF, o gabarito selecionado e a mensagem.</label>
    {!prepared?<button className="button primary" disabled={!reviewed||!message.trim()||busy} onClick={()=>void prepare()}>{busy?'Carregando PDF…':'Preparar compartilhamento'}</button>:<div className="education-actions">{native?<button className="button primary" data-sensitive="true" disabled={busy} onClick={share}><Share2 size={16}/>Escolher aplicativo e grupo</button>:<p>Este navegador não compartilha arquivos pelo sistema. Use o download e anexe no WhatsApp.</p>}<button className="button secondary" disabled={busy} onClick={download}><Download size={16}/>Baixar PDF para anexar</button></div>}
    {note&&<p role="status">{note}</p>}{error&&<p className="education-warning" role="alert">{error}</p>}
    <small>O Jarvis registra a preparação e o retorno do sistema. Ele não registra “enviado” sem confirmação de entrega.</small>
  </Modal>
}
