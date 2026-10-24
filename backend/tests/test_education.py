import io
import json
import asyncio
import time
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from app.education.research import YouTubeResearchService, safe_url
from app.education.schemas import LessonPlan
from app.education.planner import parse_command
from app.education.schemas import Preferences
from pypdf import PdfReader

COMMAND='Jarvis, prepare uma aula completa sobre o Império Romano para uma turma do 7º ano. Quero três aulas, explicações detalhadas, imagens, slides, dez atividades com gabarito separado e três vídeos educativos do YouTube. Organize tudo em PDF, salve no cérebro neural e prepare para compartilhar no meu grupo pessoal de ideias do WhatsApp.'


def sample_plan(lessons=3,questions=10):
    return LessonPlan.model_validate({'title':'Formação e transformações do Império Romano',
        'overview':'Nesta sequência estudaremos as instituições romanas, as relações sociais e as transformações políticas, comparando diferentes evidências históricas.',
        'objectives':['Identificar mudanças políticas em Roma.','Relacionar expansão territorial e diversidade cultural.'],
        'lessons':[{'title':f'Etapa {i+1}: instituições e sociedade','duration_minutes':50,
            'explanation':'A sociedade romana passou por transformações ao longo de muitos séculos. O professor apresenta diferentes fontes e discute como a expansão territorial modificou as relações sociais e políticas. Os estudantes distinguem permanências e mudanças em uma linha do tempo.',
            'methodology':['Leitura coletiva de fontes e discussão em grupos.'],'resources':['Linha do tempo e mapa histórico.'],
            'evaluation':'Observar a participação e a justificativa das relações históricas.'} for i in range(lessons)],
        'activities':[{'number':i+1,'kind':'discursive','prompt':f'Explique uma mudança política romana e justifique com uma evidência estudada. Questão {i+1}.',
            'options':[],'answer':f'RESPOSTA EXCLUSIVA DO PROFESSOR {i+1}: mudanças devem ser contextualizadas no tempo.',
            'explanation':'Aceitar explicações que relacionem fontes e mudanças nas instituições.'} for i in range(questions)],
        'slides':[{'title':'Instituições romanas','bullets':['Transformações ao longo do tempo','Comparação de fontes históricas']}],
        'mind_map':[{'label':'Roma','items':['Instituições','Sociedade']}], 'word_search':['ROMA','SENADO','IMPERIO'],
        'illustration':'temple','illustration_caption':'Esquema de um templo inspirado em formas clássicas','curriculum':[]})


def wait_job(client,identifier):
    for _ in range(250):
        result=client.get('/api/education/jobs/'+identifier).json()
        if result['status'] not in ['queued','running']:return result
        time.sleep(.02)
    raise AssertionError('Trabalho não terminou')


@pytest.mark.asyncio
async def test_youtube_official_metadata_filters_and_no_secret(app):
    app.state.settings.youtube_api_key = 'only-a-test-key'
    requests=[]
    def respond(request):
        requests.append(request)
        assert request.url.host == 'www.googleapis.com'
        assert request.url.params['key'] == 'only-a-test-key'
        if request.url.path.endswith('/search'):
            assert request.url.params['safeSearch'] == 'strict'
            return httpx.Response(200,json={'items':[{'id':{'videoId':s}} for s in ['abcdefghijk','bcdefghijkl','cdefghijklm','bad']]})
        return httpx.Response(200,json={'items':[
            {'id':'abcdefghijk','snippet':{'title':'Roma &amp; história','channelTitle':'Escola','defaultAudioLanguage':'pt-BR'},'status':{'privacyStatus':'public','embeddable':True},'contentDetails':{'duration':'PT12M30S'}},
            {'id':'bcdefghijkl','snippet':{'title':'English','defaultAudioLanguage':'en'},'status':{'privacyStatus':'public','embeddable':True}},
            {'id':'cdefghijklm','snippet':{'title':'Restrito','defaultAudioLanguage':'pt'},'status':{'privacyStatus':'public','embeddable':True},'contentDetails':{'contentRating':{'ytRating':'ytAgeRestricted'}}}]})
    service=YouTubeResearchService(app.state.settings,httpx.MockTransport(respond))
    result=await service.search('Império Romano',3,7)
    assert len(requests)==2 and len(result)==1
    assert result[0]['title']=='Roma & história' and result[0]['duration_seconds']==750
    assert result[0]['url']=='https://www.youtube.com/watch?v=abcdefghijk'
    assert result[0]['review_required'] is True and 'only-a-test-key' not in json.dumps(result)


def test_research_missing_credentials_auth_and_persistence(client,app):
    app.state.settings.youtube_api_key=''
    result=client.post('/api/education/research',json={'query':'Império Romano','provider':'youtube'}).json()
    assert result['videos']==[] and 'YOUTUBE_API_KEY' in ' '.join(result['warnings'])
    assert 'memory_id' in result and result['memory_id'] is None
    saved=client.post('/api/education/research/'+result['id']+'/save').json()
    assert saved['memory_id']
    assert client.get('/api/education/research').json()[0]['id']==result['id']
    assert client.put('/api/education/preferences',json={'school':'Minha escola','grade':8}).status_code==200
    assert client.get('/api/education/preferences').json()['grade']==8
    client.delete('/api/session')
    assert client.get('/api/education/providers').status_code==401


@pytest.mark.asyncio
async def test_youtube_failure_is_sanitized(app):
    app.state.settings.youtube_api_key='never-leak-this'
    service=YouTubeResearchService(app.state.settings,httpx.MockTransport(lambda r:httpx.Response(403,json={'error':'secret'})))
    with pytest.raises(HTTPException) as error: await service.search('Roma')
    assert error.value.status_code==502 and 'never-leak-this' not in str(error.value.detail)
    assert safe_url('javascript:alert(1)') is None and safe_url('https://user:pass@example.com') is None


def test_required_voice_command_and_actual_pdf_files(client,app,monkeypatch):
    kind,request=parse_command(COMMAND,Preferences())
    assert kind=='lesson' and request.topic=='o Império Romano' and request.lessons==3 and request.questions==10
    assert request.grade==7 and request.videos==3 and request.save_to_memory and request.prepare_share
    app.state.settings.openai_key='test-only'
    app.state.settings.youtube_api_key='test-youtube'
    calls=[]
    class FakeOpenAI:
        def __init__(self,**kwargs):self.chat=SimpleNamespace(completions=self)
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def create(self,**kwargs):
            calls.append(kwargs)
            data=sample_plan().model_dump_json() if len(calls)==1 else json.dumps({'grade_appropriate':True,'answers_match':True,'issues':[]})
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=data))])
    monkeypatch.setattr('app.education.planner.AsyncOpenAI',FakeOpenAI)
    ids=['abcdefghijk','bcdefghijkl','cdefghijklm']
    def youtube(request):
        if request.url.path.endswith('/search'):return httpx.Response(200,json={'items':[{'id':{'videoId':id}} for id in ids]})
        return httpx.Response(200,json={'items':[{'id':id,'snippet':{'title':'TESTE · Aula sobre Roma '+str(i),'channelTitle':'TESTE · Escola','defaultAudioLanguage':'pt-BR'},'status':{'privacyStatus':'public','embeddable':True},'contentDetails':{'duration':'PT12M'}} for i,id in enumerate(ids)]})
    app.state.knowledge.youtube.transport=httpx.MockTransport(youtube)
    async def search(settings,db,query,persist=False):
        return {'results':[{'title':'TESTE · Fonte institucional de história','url':'https://www.gov.br/teste-romano','description':'Trecho institucional usado apenas como fixture de contrato.'}]}
    monkeypatch.setattr('app.education.research.web_search',search)
    client.put('/api/education/preferences',json={'school':'ESCOLA PRIVADA DO PROPRIETARIO','teacher':'NOME PRIVADO DO PROFESSOR'})
    response=client.post('/api/chat',json={'text':COMMAND})
    events=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    event=next(v['result'] for v in events if v['type']=='tool')
    assert event['action']=='education_job'
    job=wait_job(client,event['job_id'])
    assert job['status']=='completed',job
    assert len(job['files'])==6 and job['memory_id'] and job['progress']==100
    assert len(job['context']['videos'])==3 and len(job['context']['sources'])==1 and len(calls)==2
    assert 'ESCOLA PRIVADA' not in json.dumps(calls) and 'NOME PRIVADO' not in json.dumps(calls)
    for file in job['files']:
        response=client.get(file['url']);assert response.headers['content-type']=='application/pdf'
        reader=PdfReader(io.BytesIO(response.content));assert len(reader.pages)==file['pages']
        text='\n'.join(p.extract_text() for p in reader.pages)
        if file['kind']=='activities':assert 'RESPOSTA EXCLUSIVA' not in text and 'Questão 10' in text
        if file['kind']=='answer_key':assert 'RESPOSTA EXCLUSIVA DO PROFESSOR 10' in text
        if file['kind']=='summary':assert 'https://www.youtube.com/watch?v=abcdefghijk' in text
        if file['kind']=='slides':assert float(reader.pages[0].mediabox.width)/float(reader.pages[0].mediabox.height)==pytest.approx(16/9)
    assert client.get('/api/education/jobs/'+job['id']+'/download').content.startswith(b'PK')
    recovered=client.post('/api/chat',json={'text':'Jarvis, recupere a aula salva sobre Império Romano.'})
    assert job['id'] in recovered.text and 'Encontrei o material salvo' in recovered.text


def test_missing_ai_fails_truthfully_and_own_text_pdf_works(client,app):
    app.state.settings.openai_key=''
    job=client.post('/api/education/jobs',json={'topic':'Fotossíntese'}).json()
    failed=wait_job(client,job['id'])
    assert failed['status']=='failed' and not failed['files'] and 'JARVIS_OPENAI_KEY' in failed['error']
    own=client.post('/api/education/jobs',json={'topic':'Meus apontamentos','content':'Este material contém os meus apontamentos sobre Roma e suas instituições.','save_to_memory':False}).json()
    ready=wait_job(client,own['id']);assert ready['status']=='completed',ready
    assert len(ready['files'])==1 and ready['memory_id'] is None


def test_all_materials_and_unverified_bncc_and_urls(client,app,monkeypatch):
    from app.education.planner import clean_plan
    plan=sample_plan(1,2)
    plan.curriculum=['EF07HI99'];plan.overview+=' Consulte https://inventado.example/falso.'
    cleaned,warnings=clean_plan(plan,{'sources':[],'videos':[]})
    assert 'EF07HI99' not in cleaned.model_dump_json() and 'https://inventado' not in cleaned.model_dump_json() and len(warnings)==2
    app.state.settings.openai_key='test-only'
    async def generate(request,context):return cleaned,[]
    monkeypatch.setattr(app.state.knowledge.planner,'generate',generate)
    kinds=['lesson_plan','sequence','summary','slides','activities','assessment','answer_key','mind_map','word_search','adapted','coloring']
    row=client.post('/api/education/jobs',json={'topic':'Roma','lessons':1,'questions':2,'materials':kinds,'research':False,'videos':0}).json()
    job=wait_job(client,row['id'])
    assert job['status']=='completed',job
    assert len(job['files'])==len(kinds)


def test_memory_revision_delete_and_shared_server_persistence(client,app,monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import create_app
    app.state.settings.openai_key='test-only'
    async def generate(request,context):return sample_plan(1,2),[]
    monkeypatch.setattr(app.state.knowledge.planner,'generate',generate)
    row=client.post('/api/education/jobs',json={'topic':'Roma','lessons':1,'questions':2,'research':False,'videos':0}).json()
    job=wait_job(client,row['id']);assert job['status']=='completed'
    graph=client.get('/api/neural/graph').json()
    assert job['memory_id'] in [n['id'] for n in graph['nodes']]
    assert any(e['source']==job['memory_id'] for e in graph['edges'])
    assert len(client.get('/api/documents').json())==len(job['files'])
    from app.database import Document
    from app.memory.models import DocumentOriginal
    with app.state.sessions() as db:
        for file in job['files']:
            original=db.get(DocumentOriginal,file['document_id'])
            assert original.data==client.get(file['url']).content
    edited=sample_plan(1,2).model_dump();edited['overview']='Texto revisado pelo professor. '+edited['overview']
    response=client.patch('/api/education/jobs/'+job['id']+'/plan',json=edited)
    assert response.status_code==202
    revised=wait_job(client,job['id']);assert revised['status']=='completed',revised
    assert revised['revision']==2 and len(revised['files'])==len(job['files'])*2
    assert client.get(f"/api/education/jobs/{job['id']}/revisions/1").json()['plan']['overview']!=edited['overview']
    with TestClient(create_app(app.state.settings)) as second:
        second.post('/api/session',json={'password':'teste-seguro'})
        restored=second.get('/api/education/jobs/'+job['id']).json()
        assert restored['revision']==2 and restored['memory_id']==job['memory_id']
        assert second.get(restored['files'][0]['url']).content==client.get(job['files'][0]['url']).content
    assert client.delete('/api/education/jobs/'+job['id']).status_code==200
    assert client.get('/api/documents').json()==[]
    assert client.get(job['files'][0]['url']).status_code==404


def test_cancellation_and_interrupted_job_recovery(client,app,monkeypatch):
    app.state.settings.openai_key='test-only'
    async def slow(request,context):
        await asyncio.sleep(30)
        return sample_plan(1,2),[]
    monkeypatch.setattr(app.state.knowledge.planner,'generate',slow)
    job=client.post('/api/education/jobs',json={'topic':'Roma','lessons':1,'questions':2,'research':False}).json()
    assert client.post('/api/education/jobs/'+job['id']+'/cancel').json()['status']=='cancelled'
    assert wait_job(client,job['id'])['files']==[]
    from app.education.models import LessonJob
    with app.state.sessions() as db:
        row=db.get(LessonJob,job['id']);row.status='running';db.commit()
    app.state.knowledge.recover()
    restored=client.get('/api/education/jobs/'+job['id']).json()
    assert restored['status']=='failed' and 'encerrado' in restored['error']


def test_assisted_share_requires_review_and_never_claims_delivery(client):
    job=client.post('/api/education/jobs',json={'topic':'Meu texto','content':'Conteúdo escrito pelo professor para compartilhar com seus colegas.'}).json()
    job=wait_job(client,job['id']);file=job['files'][0]
    payload={'file_id':file['id'],'message':'Confira este PDF.','reviewed':False}
    path='/api/education/jobs/'+job['id']+'/share'
    assert client.post(path,json=payload).status_code==400
    event=client.post(path,json={**payload,'reviewed':True}).json()
    assert event['state']=='prepared' and client.get(event['file_url']).content.startswith(b'%PDF')
    state='/api/education/shares/'+event['id']+'/outcome'
    assert client.post(state,json={'state':'sent'}).status_code==422
    assert client.post(state,json={'state':'system_returned'}).status_code==409
    assert client.post(state,json={'state':'initiated'}).json()['delivery_verified'] is False
    assert client.post(state,json={'state':'system_returned'}).json()=={'state':'system_returned','delivery_verified':False}
    assert client.delete('/api/data',headers={'X-Jarvis-Confirm':'DELETE'}).status_code==200
    assert client.get('/api/education/jobs').json()==[] and client.get(file['url']).status_code==404


def test_global_memory_opt_out_and_retention_of_unsaved_materials(client,app):
    from datetime import timedelta
    from app.database import now
    from app.education.models import LessonJob
    prefs=client.get('/api/neural/preferences').json()
    client.put('/api/neural/preferences',json={**prefs,'auto_save':False})
    job=client.post('/api/education/jobs',json={'topic':'Material sem salvamento','content':'Texto para conferir a preferência geral de armazenamento do cérebro.'}).json()
    job=wait_job(client,job['id']);assert job['memory_id'] is None
    assert client.post('/api/education/jobs/'+job['id']+'/share',json={'file_id':job['files'][0]['id'],'message':'Revisado.','reviewed':True}).status_code==409
    with app.state.sessions() as db:
        row=db.get(LessonJob,job['id']);row.created_at=now()-timedelta(days=60);db.commit()
    app.state.knowledge.retention(now()-timedelta(days=30))
    assert client.get('/api/education/jobs/'+job['id']).status_code==404


def test_invalid_generated_counts_are_not_published(client,app,monkeypatch):
    from app.education.planner import validate_plan
    app.state.settings.openai_key='test-only'
    async def invalid(request,context):
        plan=sample_plan(1,1);validate_plan(plan,request)
        return plan,[]
    monkeypatch.setattr(app.state.knowledge.planner,'generate',invalid)
    job=client.post('/api/education/jobs',json={'topic':'Roma','lessons':3,'questions':10,'research':False}).json()
    result=wait_job(client,job['id'])
    assert result['status']=='failed' and result['files']==[] and 'quantidades' in result['error']
