import io
import json
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from .models import Research, TeachingPreferences, LessonJob, LessonRevision, TeachingFile, ShareEvent
from .schemas import Preferences, ResearchRequest, LessonRequest, LessonPlan, Command, SharePrepare, ShareOutcome
from .planner import validate_plan, clean_plan
from .sharing import WhatsAppShareService
from ..database import now
from ..memory import store as memory


def router(hub, database, authenticate):
    api = APIRouter(prefix="/api/education", dependencies=[Depends(authenticate)])
    sharing = WhatsAppShareService()

    @api.get('/providers')
    def providers():
        return {"ai": {"configured": bool(hub.settings.openai_key)},
                "web": {"configured": bool(hub.settings.search_key), "available": hub.web.available},
                "youtube": {"configured": bool(hub.settings.youtube_api_key), "available": hub.youtube.available}}

    @api.get('/preferences')
    def preferences(db=Depends(database)):
        return hub.preferences(db).model_dump()

    @api.put('/preferences')
    def save_preferences(body: Preferences, db=Depends(database)):
        row = db.get(TeachingPreferences, 1)
        if not row: row = TeachingPreferences(id=1); db.add(row)
        row.payload = body.model_dump_json(); db.commit()
        return body

    @api.post('/research')
    async def research(body: ResearchRequest, db=Depends(database)):
        return await hub.research(body, db)

    @api.get('/research')
    def history(db=Depends(database)):
        return [{"id": r.id, "query": r.query, "created_at": r.created_at.isoformat(),
                 "memory_id": r.memory_id, **json.loads(r.payload)}
                for r in db.scalars(select(Research).order_by(Research.created_at.desc()).limit(100))]

    @api.post('/research/{identifier}/save')
    def save_research(identifier: str, db=Depends(database)):
        row = db.get(Research, identifier)
        if not row: raise HTTPException(404, 'Pesquisa não encontrada.')
        hub.save_research(db, row); db.commit()
        return {"memory_id": row.memory_id}

    @api.delete('/research/{identifier}')
    def delete_research(identifier: str, db=Depends(database)):
        row = db.get(Research, identifier)
        if not row: raise HTTPException(404, 'Pesquisa não encontrada.')
        if row.memory_id: memory.remove_node(db, row.memory_id)
        db.delete(row); db.commit()
        return {"deleted": True}

    @api.get('/youtube/thumbnail/{identifier}')
    async def thumbnail(identifier: str):
        return Response(await hub.youtube.thumbnail(identifier), media_type='image/jpeg')

    def job_or_404(db,identifier):
        job=db.get(LessonJob,identifier)
        if not job:raise HTTPException(404,'Material não encontrado.')
        return job

    @api.post('/command')
    async def command(body: Command, db=Depends(database)):
        result=await hub.command(body.text,db,body.temporary)
        if not result:raise HTTPException(422,'Peça para preparar uma aula sobre um tema, pesquisar vídeos ou recuperar aulas salvas.')
        return result

    @api.post('/jobs',status_code=202)
    async def create_job(body: LessonRequest, db=Depends(database)):
        return hub.start(body,db)

    @api.get('/jobs')
    def jobs(q: str='',db=Depends(database)):
        # Não retorna BLOBs, preferências pessoais ou todo o planejamento no índice.
        values=db.scalars(select(LessonJob).order_by(LessonJob.created_at.desc()).limit(200))
        return [{'id':j.id,'topic':json.loads(j.request)['topic'],'grade':json.loads(j.request)['grade'],
                 'status':j.status,'stage':j.stage,'progress':j.progress,'revision':j.revision,'memory_id':j.memory_id,
                 'created_at':j.created_at.isoformat()} for j in values if q.casefold() in j.request.casefold()]

    @api.get('/jobs/{identifier}')
    def job(identifier: str, db=Depends(database)):
        return hub.describe(db,job_or_404(db,identifier))

    @api.post('/jobs/{identifier}/cancel')
    async def cancel(identifier: str, db=Depends(database)):
        return hub.cancel(identifier,db)

    @api.post('/jobs/{identifier}/retry',status_code=202)
    async def retry(identifier: str, db=Depends(database)):
        job=job_or_404(db,identifier)
        if job.status not in ['failed','cancelled']:raise HTTPException(409,'Apenas trabalhos interrompidos podem ser retomados.')
        previous=hub.tasks.get(identifier)
        if previous and not previous.done():
            previous.cancel()
            import asyncio
            await asyncio.gather(previous,return_exceptions=True)
        if len(hub.tasks)>=10:raise HTTPException(429,'A fila de materiais está cheia.')
        job.status='queued';job.stage='Na fila';job.error=None;job.progress=0;job.updated_at=now();db.commit()
        hub.schedule(identifier,edited=bool(json.loads(job.plan)))
        return hub.describe(db,job)

    @api.patch('/jobs/{identifier}/plan',status_code=202)
    async def edit(identifier: str, body: LessonPlan, db=Depends(database)):
        job=job_or_404(db,identifier)
        if job.status!='completed':raise HTTPException(409,'Aguarde a conclusão antes de editar.')
        try:validate_plan(body,json.loads(job.request))
        except ValueError as error:raise HTTPException(422,str(error)) from None
        body,warnings=clean_plan(body,json.loads(job.context))
        job.plan=body.model_dump_json();job.revision+=1;job.status='queued';job.progress=0;job.stage='Preparando nova revisão'
        job.warnings=json.dumps(warnings,ensure_ascii=False);job.updated_at=now();db.commit();hub.schedule(identifier,edited=True)
        return hub.describe(db,job)

    @api.get('/jobs/{identifier}/revisions/{number}')
    def revision(identifier: str, number: int, db=Depends(database)):
        job_or_404(db,identifier)
        row=db.scalar(select(LessonRevision).where(LessonRevision.job_id==identifier,LessonRevision.number==number))
        if not row:raise HTTPException(404,'Revisão não encontrada.')
        return {'number':number,'plan':json.loads(row.plan)}

    @api.post('/jobs/{identifier}/save')
    def save(identifier: str, db=Depends(database)):
        job=job_or_404(db,identifier)
        if job.status!='completed':raise HTTPException(409,'Conclua a geração antes de salvar.')
        hub.save_job(db,job);db.commit()
        return hub.describe(db,job)

    @api.get('/files/{identifier}')
    def file(identifier: str, download: bool=False, db=Depends(database)):
        row=db.get(TeachingFile,identifier)
        if not row:raise HTTPException(404,'PDF não encontrado ou excluído.')
        return Response(row.data,media_type=row.mime,headers={'Content-Disposition':
            ('attachment' if download else 'inline')+"; filename*=UTF-8''"+quote(row.name),'ETag':'"'+row.sha256+'"'})

    @api.get('/jobs/{identifier}/download')
    def download(identifier: str, db=Depends(database)):
        job=job_or_404(db,identifier)
        files=list(db.scalars(select(TeachingFile).where(TeachingFile.job_id==identifier,TeachingFile.revision==job.revision)))
        if not files:raise HTTPException(409,'Nenhum PDF pronto nesta revisão.')
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
            for f in files:archive.writestr(f.name,f.data)
        return Response(buffer.getvalue(),media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="jarvis-{identifier[:8]}-r{job.revision}.zip"'})

    @api.delete('/jobs/{identifier}')
    async def remove(identifier: str, db=Depends(database)):
        job=job_or_404(db,identifier)
        hub.cancel(identifier,db)
        previous=hub.tasks.get(identifier)
        if previous and not previous.done():
            import asyncio
            await asyncio.gather(previous,return_exceptions=True)
        for f in list(db.scalars(select(TeachingFile).where(TeachingFile.job_id==identifier))):
            if f.document_id and not db.scalar(select(TeachingFile.id).where(TeachingFile.document_id==f.document_id,TeachingFile.job_id!=identifier).limit(1)):
                memory.remove_document(db,f.document_id)
                from ..database import Document
                doc=db.get(Document,f.document_id)
                if doc:db.delete(doc)
        if job.memory_id:memory.remove_node(db,job.memory_id)
        db.delete(job);db.commit()
        return {'deleted':True}

    @api.post('/jobs/{identifier}/share')
    def prepare_share(identifier: str, body: SharePrepare, db=Depends(database)):
        return sharing.prepare(db,job_or_404(db,identifier),body)

    @api.post('/shares/{identifier}/outcome')
    def share_outcome(identifier: str, body: ShareOutcome, db=Depends(database)):
        return sharing.outcome(db,identifier,body)

    return api
