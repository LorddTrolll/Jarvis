import asyncio
import hashlib
import io
import json
import uuid
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from .models import Research, TeachingPreferences, LessonJob, LessonRevision, TeachingFile, ShareEvent
from .schemas import Preferences, LessonRequest
from .research import YouTubeResearchService, WebResearchService, collect
from .planner import LessonPlanner, normalized, parse_command, validate_plan, clean_plan
from .pdf import DocumentGenerationService
from ..database import Document, now
from ..memory import store as memory
from ..memory.models import DocumentOriginal, MemoryNode


class KnowledgeHub:
    def __init__(self, settings, sessions):
        self.settings, self.sessions = settings, sessions
        self.youtube = YouTubeResearchService(settings)
        self.web = WebResearchService(settings)
        self.planner = LessonPlanner(settings)
        self.pdf = DocumentGenerationService()
        self.tasks = {}
        self.semaphore = asyncio.Semaphore(1)

    def recover(self):
        with self.sessions() as db:
            db.execute(update(LessonJob).where(LessonJob.status.in_(['queued','running'])).values(
                status='failed',stage='Execução interrompida',error='O Jarvis foi encerrado durante o processamento. Use tentar novamente para iniciar uma nova execução.',updated_at=now()))
            db.commit()

    def retention(self,cutoff):
        # Materiais vinculados ao cérebro são documentos permanentes, até exclusão explícita.
        # Pesquisas e execuções sem vínculo seguem o prazo do histórico comum.
        with self.sessions() as db:
            db.execute(delete(Research).where(Research.created_at<cutoff,Research.memory_id.is_(None)))
            db.execute(delete(LessonJob).where(LessonJob.created_at<cutoff,LessonJob.memory_id.is_(None),LessonJob.status.notin_(['queued','running'])))
            db.commit()

    async def close(self):
        tasks=list(self.tasks.values())
        for task in tasks:task.cancel()
        if tasks:await asyncio.gather(*tasks,return_exceptions=True)

    def active(self):return any(not task.done() for task in self.tasks.values())

    def preferences(self, db):
        row = db.get(TeachingPreferences, 1)
        prefs=Preferences.model_validate_json(row.payload) if row else Preferences()
        if not memory.state(db).auto_save:prefs.auto_save=False
        return prefs

    async def research(self, request, db, temporary=False):
        result = await collect(self.web, self.youtube, db, request.query, request.grade, request.videos, request.provider)
        if request.analyze:
            await self.planner.analyze(result)
        if temporary: return result
        row = Research(id=str(uuid.uuid4()), query=request.query, payload=json.dumps(result, ensure_ascii=False))
        db.add(row); db.flush()
        if request.save_to_memory: self.save_research(db, row)
        db.commit()
        return {**result, "id": row.id, "memory_id": row.memory_id}

    def save_research(self, db, row):
        result = json.loads(row.payload)
        node = memory.upsert(db, 'search', row.query,
            '\n'.join([row.query] + [s['title']+'\n'+s.get('description','') for s in result['sources']+result['videos']]),
            'education-research:'+row.id, meta={"sources": result['sources']+result['videos'], "research_id": row.id})
        row.memory_id = node.id if node else None

    def start(self, body, db):
        if len([t for t in self.tasks.values() if not t.done()])>=10:raise HTTPException(429,'Há dez trabalhos na fila. Aguarde ou cancele um deles.')
        prefs=self.preferences(db).model_dump()
        request={**prefs,**{k:v for k,v in body.model_dump().items() if v is not None}}
        if body.save_to_memory is None:request['save_to_memory']=prefs['auto_save']
        if request['content']:
            request.update(materials=['text'],research=False,videos=0)
        job=LessonJob(id=str(uuid.uuid4()),request=json.dumps(request,ensure_ascii=False))
        db.add(job);db.commit();self.schedule(job.id)
        return self.describe(db,job)

    def schedule(self,identifier,edited=False):
        task=asyncio.create_task(self.run(identifier,edited))
        self.tasks[identifier]=task
        task.add_done_callback(lambda finished:self.tasks.pop(identifier,None) if self.tasks.get(identifier) is finished else None)

    def checkpoint(self,identifier,stage,progress,**values):
        with self.sessions() as db:
            job=db.get(LessonJob,identifier)
            if not job or job.status=='cancelled':raise asyncio.CancelledError()
            for key,value in values.items():setattr(job,key,value)
            job.stage=stage;job.progress=progress;job.updated_at=now();db.commit()

    async def run(self,identifier,edited=False):
        try:
            async with self.semaphore:
                self.checkpoint(identifier,'Preparando pedido',5,status='running',error=None)
                with self.sessions() as db:
                    job=db.get(LessonJob,identifier);request=json.loads(job.request)
                    old_plan=json.loads(job.plan);context=json.loads(job.context);revision=job.revision
                if edited:
                    from .schemas import LessonPlan
                    plan=LessonPlan.model_validate(old_plan);validate_plan(plan,request)
                    plan,extra=clean_plan(plan,context);plan=plan.model_dump()
                    warnings=list(context.get('warnings',[]))+extra
                else:
                    context={'sources':[],'videos':[],'warnings':[]};warnings=[];plan=None
                    if not request['content']:
                        # Falta de credencial falha antes de gastar cotas em pesquisas.
                        if not self.settings.openai_key:raise HTTPException(503,'Configure JARVIS_OPENAI_KEY para planejar aulas com IA. Para gerar PDF sem IA, informe um texto próprio.')
                        if request['research']:
                            self.checkpoint(identifier,'Pesquisando fontes e vídeos',15)
                            with self.sessions() as db:
                                stored=db.get(Research,request['research_id']) if request.get('research_id') else None
                                if request.get('research_id') and not stored:raise HTTPException(404,'A pesquisa selecionada foi excluída. Faça uma nova pesquisa.')
                                if stored and json.loads(stored.payload).get('grade')==request['grade']:
                                    context=json.loads(stored.payload)
                                else:context=await collect(self.web,self.youtube,db,request['topic'],request['grade'],request['videos'])
                                if request['bncc']:
                                    try:
                                        curriculum=await self.web.search(db,f"BNCC {request['subject']} {request['grade']} ano {request['topic']} site:gov.br")
                                        context['sources']=list({s['url']:s for s in context['sources']+curriculum}.values())[:10]
                                    except HTTPException as error:context['warnings'].append('Consulta curricular: '+error.detail)
                        warnings.extend(context['warnings'])
                        self.checkpoint(identifier,'Construindo aulas, slides e atividades',38,context=json.dumps(context,ensure_ascii=False))
                        generated,extra=await self.planner.generate(request,context)
                        plan=generated.model_dump();warnings.extend(extra)
                self.checkpoint(identifier,'Gerando PDFs e gabarito separado',68,plan=json.dumps(plan or {},ensure_ascii=False),context=json.dumps(context,ensure_ascii=False))
                files=await asyncio.to_thread(self.pdf.render,request,plan,context,revision)
                self.checkpoint(identifier,'Verificando arquivos e quantidades',88)
                warnings.append('Revisão estrutural concluída: arquivos legíveis, páginas e quantidades conferidas. Revise conteúdo, imagens esquemáticas e respostas antes do uso docente.')
                with self.sessions() as db:
                    job=db.get(LessonJob,identifier)
                    if not job or job.status=='cancelled':raise asyncio.CancelledError()
                    for item in files:
                        db.add(TeachingFile(id=str(uuid.uuid4()),job_id=identifier,revision=revision,
                            **{k:item[k] for k in ['name','kind','data','sha256','pages']}))
                    db.add(LessonRevision(id=str(uuid.uuid4()),job_id=identifier,number=revision,plan=job.plan))
                    db.flush()
                    if request['save_to_memory']:self.save_job(db,job)
                    job.status='completed';job.stage='PDFs prontos para revisão';job.progress=100
                    job.warnings=json.dumps(list(dict.fromkeys(warnings)),ensure_ascii=False);job.updated_at=now();db.commit()
        except asyncio.CancelledError:
            with self.sessions() as db:
                job=db.get(LessonJob,identifier)
                if job and job.status in ['running','queued']:
                    job.status='cancelled';job.stage='Cancelado';job.updated_at=now();db.commit()
        except Exception as error:
            # Nunca persiste URLs de requisições ou mensagens de SDK que podem conter segredos.
            detail=error.detail if isinstance(error,HTTPException) else (str(error)[:250] if isinstance(error,ValueError) else 'Não foi possível concluir a geração. Tente novamente ou reduza o pedido.')
            self.checkpoint(identifier,'Não concluído',0,status='failed',error=detail)

    def describe(self,db,job):
        files=[{'id':f.id,'name':f.name,'kind':f.kind,'revision':f.revision,'pages':f.pages,'bytes':len(f.data),'sha256':f.sha256,
                'url':f'/api/education/files/{f.id}', 'document_id':f.document_id}
               for f in db.scalars(select(TeachingFile).where(TeachingFile.job_id==job.id).order_by(TeachingFile.revision,TeachingFile.kind))]
        revisions=[{'number':r.number,'created_at':r.created_at.isoformat()} for r in db.scalars(select(LessonRevision).where(LessonRevision.job_id==job.id).order_by(LessonRevision.number))]
        shares=[{'id':s.id,'file_id':s.file_id,'state':s.state,'created_at':s.created_at.isoformat()}
                for s in db.scalars(select(ShareEvent).where(ShareEvent.job_id==job.id).order_by(ShareEvent.created_at.desc()).limit(30))]
        return {'id':job.id,'status':job.status,'stage':job.stage,'progress':job.progress,'request':json.loads(job.request),
            'plan':json.loads(job.plan),'context':json.loads(job.context),'warnings':json.loads(job.warnings),'error':job.error,
            'revision':job.revision,'memory_id':job.memory_id,'created_at':job.created_at.isoformat(),'updated_at':job.updated_at.isoformat(),
            'files':files,'revisions':revisions,'shares':shares}

    def save_job(self,db,job):
        request=json.loads(job.request);plan=json.loads(job.plan);context=json.loads(job.context)
        title=plan.get('title',request['topic'])
        readable=f"{title}\n{request['subject']} · {request['grade']}º ano · Revisão {job.revision}\n\n"+plan.get('overview',request.get('content',''))
        readable+='\n\nObjetivos\n'+'\n'.join(plan.get('objectives',[]))
        readable+='\n\n'+'\n\n'.join(f"Aula {i+1}: {lesson['title']}\n{lesson['explanation']}" for i,lesson in enumerate(plan.get('lessons',[])))
        root=memory.upsert(db,'project',title,readable,
                           'lesson:'+job.id,meta={'lesson_id':job.id,'grade':request['grade'],'subject':request['subject'],'revision':job.revision,
                                               'sources':context.get('sources',[])+context.get('videos',[])})
        if not root:raise HTTPException(409,'Esta memória foi excluída. Crie um novo material para salvar novamente.')
        root.content=readable
        root.meta=json.dumps({**json.loads(root.meta),'revision':job.revision},ensure_ascii=False);job.memory_id=root.id
        subject=memory.upsert(db,'topic',request['subject'],'Disciplina dos materiais criados no Professor Jarvis.',
                             'teaching-subject:'+request['subject'].casefold())
        if subject:memory.link(db,subject.id,root.id,'teaching_path','Material desta disciplina.')
        for file in db.scalars(select(TeachingFile).where(TeachingFile.job_id==job.id)):
            if file.document_id:continue
            # O cérebro guarda o PDF de fato, e não somente seu nome.
            from pypdf import PdfReader
            reader=PdfReader(io.BytesIO(file.data))
            text='\n\n'.join(page.extract_text() or '' for page in reader.pages)
            original=db.scalar(select(DocumentOriginal).where(DocumentOriginal.sha256==file.sha256))
            if original:doc=db.get(Document,original.document_id)
            else:
                doc=Document(name=file.name,content=text);db.add(doc);db.flush()
                db.add(DocumentOriginal(document_id=doc.id,sha256=file.sha256,mime='application/pdf',data=file.data))
            file.document_id=doc.id
            node=memory.capture_document(db,doc,meta={'lesson_id':job.id,'revision':file.revision,'material':file.kind,'sources':context.get('sources',[])+context.get('videos',[])})
            if node:memory.link(db,root.id,node.id,'project','PDF realmente gerado e salvo neste planejamento.')
        for source in context.get('sources',[])+context.get('videos',[]):
            node=memory.upsert(db,'note',source['title'],source.get('description','')+'\n'+source['url'],
                'lesson-source:'+hashlib.sha256(source['url'].encode()).hexdigest(),meta={'sources':[source],'url':source['url']})
            if node:memory.link(db,root.id,node.id,'source','Link retornado pela API consultada, sem baixar o vídeo.')
        memory.touch(db)

    def cancel(self,identifier,db):
        job=db.get(LessonJob,identifier)
        if not job:raise HTTPException(404,'Trabalho não encontrado.')
        if job.status in ['queued','running']:
            job.status='cancelled';job.stage='Cancelado';job.updated_at=now();db.commit()
            task=self.tasks.get(identifier)
            if task:task.cancel()
        return self.describe(db,job)

    async def command(self,text,db,temporary=False):
        if normalized(text).strip(' .!,') in {'jarvis, cancele a preparacao','cancele a preparacao','pare a geracao','interrompa a aula'}:
            job=db.scalar(select(LessonJob).where(LessonJob.status.in_(['queued','running'])).order_by(LessonJob.created_at.desc()).limit(1))
            if job:
                self.cancel(job.id,db)
                return {'text':'Preparação cancelada. Arquivos já concluídos em revisões anteriores foram preservados.', 'event':{'action':'education_job','job_id':job.id}}
            return {'text':'Não há uma preparação em andamento.','event':{'action':'open_panel','panel':'education'}}
        kind,request=parse_command(text,self.preferences(db))
        if kind=='lesson':
            if temporary and request.save_to_memory is None:request.save_to_memory=False
            job=self.start(request,db)
            return {'text':'Pedido colocado na fila da Central Pedagógica. Vou pesquisar, preparar os materiais e verificar os PDFs. Acompanhe o progresso; o compartilhamento ficará disponível após a revisão.',
                    'event':{'action':'education_job','job_id':job['id']}}
        if kind=='research':
            result=await self.research(request,db,temporary)
            return {'text':f"Pesquisa concluída com {len(result['sources'])} fontes e {len(result['videos'])} vídeos. "+' '.join(result['warnings']),
                    'event':{'action':'education_research','research':result}}
        if kind=='history':
            candidates=list(db.scalars(select(LessonJob).where(LessonJob.status=='completed').order_by(LessonJob.created_at.desc()).limit(200)))
            matched=[j for j in candidates if normalized(request) in normalized(json.loads(j.request)['topic'])]
            if matched:
                return {'text':'Encontrei o material salvo: '+json.loads(matched[0].request)['topic']+'. Abri os PDFs e as revisões.',
                        'event':{'action':'education_job','job_id':matched[0].id,'recovered':True}}
            return {'text':'Não encontrei um material concluído com esse tema. Abri o histórico para você conferir os registros.',
                    'event':{'action':'open_panel','panel':'education'}}
        return None
