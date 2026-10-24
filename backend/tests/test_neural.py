import io
import json
import sqlite3
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from app.config import Settings
from app.main import create_app
from app.memory.models import DocumentChunk, MemoryNode


def upload(client, name, text):
    response = client.post('/api/documents', files={'file': (name, text.encode('utf-8'))})
    assert response.status_code == 201, response.text
    return response.json()


def test_graph_persists_file_original_chunks_and_deduplicates(client, app):
    record = upload(client, 'historia.md', '# Roma\nO Império Romano foi uma sociedade da Antiguidade.')
    duplicate = upload(client, 'outra-copia.md', '# Roma\nO Império Romano foi uma sociedade da Antiguidade.')
    assert duplicate['duplicate'] and record['id'] == duplicate['id']
    graph = client.get('/api/neural/graph').json()
    assert len([n for n in graph['nodes'] if n['kind'] == 'document']) == 1
    detail = client.get('/api/neural/nodes/' + record['node_id']).json()
    assert 'Antiguidade' in detail['content']
    assert client.get(detail['original_url']).content.startswith(b'# Roma')
    with app.state.sessions() as db:
        assert db.scalar(select(DocumentChunk).where(DocumentChunk.document_id == record['id']))
        assert json.loads(db.get(MemoryNode,record['node_id']).embedding)
    with TestClient(create_app(app.state.settings)) as reopened:
        reopened.post('/api/session',json={'password':'teste-seguro'})
        restored = reopened.get('/api/neural/graph').json()
        assert record['node_id'] in [n['id'] for n in restored['nodes']]
        assert len(restored['nodes']) == len(graph['nodes'])


def test_question_answer_and_conversation_are_linked(client):
    response=client.post('/api/chat',json={'text':'Como funciona a memória neural?'})
    assert response.status_code == 200
    graph=client.get('/api/neural/graph').json()
    question=next(n for n in graph['nodes'] if n['kind']=='question')
    answer=next(n for n in graph['nodes'] if n['kind']=='answer')
    assert any(e['source']==question['id'] and e['target']==answer['id'] and e['relation']=='answer' for e in graph['edges'])
    assert any(n['kind']=='conversation' for n in graph['nodes'])


def test_semantic_search_explains_related_and_excludes_unrelated(client):
    first=upload(client,'roma.txt','História do Império Romano: Roma, imperadores e política da Antiguidade.')
    second=upload(client,'imperadores.txt','Os imperadores de Roma governaram o Império Romano durante a Antiguidade.')
    unrelated=upload(client,'receita.txt','Receita de bolo: farinha, ovos, chocolate, forno e açúcar.')
    graph=client.get('/api/neural/graph').json()
    connections=[e for e in graph['edges'] if e['relation']=='similarity']
    assert any({e['source'],e['target']}=={first['node_id'],second['node_id']} for e in connections)
    assert not any(unrelated['node_id'] in (e['source'],e['target']) for e in connections)
    assert all('termos compartilhados' in e['reason'] for e in connections)
    result=client.post('/api/neural/search',json={'query':'Império Romano'}).json()
    assert result['external'] is False and result['results'][0]['id'] in [first['node_id'],second['node_id']]
    assert unrelated['node_id'] not in [r['id'] for r in result['results']]
    assert client.post('/api/neural/search',json={'query':'quasar inexistente'}).json()['results']==[]


def test_temporary_chat_and_autosave_opt_out(client):
    preferences=client.get('/api/neural/preferences').json()
    preferences['auto_save']=False
    assert client.put('/api/neural/preferences',json=preferences).status_code==200
    client.post('/api/chat',json={'text':'Esta pergunta não deve entrar no grafo'})
    assert client.get('/api/neural/graph').json()['total']==0
    assert len(client.get('/api/messages').json())==2
    preferences['auto_save']=True
    client.put('/api/neural/preferences',json=preferences)
    client.post('/api/chat',json={'text':'Segredo temporário', 'temporary':True,'temporary_history':[{'role':'user','content':'Contexto temporário'}]})
    assert len(client.get('/api/messages').json())==2
    assert client.get('/api/neural/graph').json()['total']==0
    record=upload(client,'manual.txt','Arquivo incluído explicitamente deve persistir.')
    assert record['node_id']


def test_neural_navigation_commands_are_local(client):
    for text, expected in [('Jarvis, abra seu cérebro','open_panel'),('Jarvis, mostre suas memórias','open_panel'),
                           ('Jarvis, encontre minha pesquisa sobre Roma','neural_search'),('Jarvis, expanda esse neurônio','neural_expand'),
                           ('Jarvis, volte para o cérebro completo','neural_global')]:
        response=client.post('/api/chat',json={'text':text+'.'})
        events=[json.loads(l[6:]) for l in response.text.splitlines() if l.startswith('data: ')]
        assert events[0]['result']['action']==expected
    assert client.get('/api/neural/graph').json()['categories']['question']==5


def test_deletion_cascades_without_deleting_other_memories(client):
    first=upload(client,'apagar.txt','História de Roma e do Império Romano.')
    second=upload(client,'manter.txt','Outra memória sobre Roma e seus imperadores.')
    client.get('/api/neural/graph')
    assert client.delete('/api/neural/nodes/'+first['node_id']).status_code==200
    graph=client.get('/api/neural/graph').json()
    assert first['node_id'] not in [n['id'] for n in graph['nodes']]
    assert all(first['node_id'] not in (e['source'],e['target']) for e in graph['edges'])
    assert client.get('/api/documents/'+str(first['id'])+'/original').status_code==404
    assert second['node_id'] in [n['id'] for n in graph['nodes']]
    assert client.delete('/api/documents/'+str(second['id'])).status_code==200
    assert not any(n['kind']=='document' for n in client.get('/api/neural/graph').json()['nodes'])


def test_project_links_and_view_and_gesture_preferences(client):
    record=upload(client,'projeto.txt','Conhecimento para meu projeto espacial.')
    project=client.post('/api/neural/nodes',json={'kind':'project','title':'Exploração','content':'Projeto pessoal','members':[record['node_id']]}).json()
    graph=client.get('/api/neural/graph').json()
    assert any(e['source']==project['id'] and e['target']==record['node_id'] and e['relation']=='project' for e in graph['edges'])
    preferences=client.get('/api/neural/preferences').json()
    preferences['view']={'level':'cluster','selected':project['id'],'parent':None,'camera':[1,2,15],'target':[0,1,0]}
    preferences['gesture']['double_ms']=500
    assert client.put('/api/neural/preferences',json=preferences).status_code==200
    restored=client.get('/api/neural/preferences').json()
    assert restored['view']['selected']==project['id'] and restored['gesture']['double_ms']==500
    preferences['gesture']['double_ms']=1
    assert client.put('/api/neural/preferences',json=preferences).status_code==422
    assert client.post('/api/neural/nodes',json={'title':'Inválido','members':['inexistente']}).status_code==404


def test_image_is_verified_and_original_is_authorized(client, app):
    data=io.BytesIO(); Image.new('RGB',(16,8),(15,120,180)).save(data,format='PNG')
    response=client.post('/api/documents',files={'file':('imagem.png',data.getvalue())})
    assert response.status_code==201
    detail=client.get('/api/neural/nodes/'+response.json()['node_id']).json()
    assert detail['kind']=='image' and detail['mime']=='image/png'
    assert client.get(detail['original_url']).content==data.getvalue()
    with TestClient(app) as outsider:
        assert outsider.get(detail['original_url']).status_code==401
    assert client.post('/api/documents',files={'file':('fake.png',b'<script>invalido</script>')}).status_code==422
    assert client.post('/api/documents',files={'file':('fake.svg',b'<svg/>')}).status_code==415


def test_migration_preserves_legacy_database_and_backups(tmp_path):
    with sqlite3.connect(tmp_path/'jarvis.db') as db:
        db.execute('CREATE TABLE documents (id INTEGER PRIMARY KEY,name VARCHAR(255),content TEXT,created_at DATETIME)')
        db.execute("INSERT INTO documents VALUES (1,'legado.txt','Texto preservado da versão anterior.','2026-10-24 12:00:00')")
    config=Settings(_env_file=None,data_dir=tmp_path,password='teste',openai_key='',search_key='',telegram_token='')
    with TestClient(create_app(config)) as client:
        client.post('/api/session',json={'password':'teste'})
        graph=client.get('/api/neural/graph').json()
        node=next(n for n in graph['nodes'] if n['kind']=='document')
        detail=client.get('/api/neural/nodes/'+node['id']).json()
        assert detail['content']=='Texto preservado da versão anterior.' and detail['original_url'] is None
        previous=graph['revision']
        reimport=upload(client,'legado.txt','Texto preservado da versão anterior.')
        assert reimport['id']==1 and reimport['node_id']==node['id']
        assert client.get('/api/neural/graph').json()['revision']>previous
        assert client.get('/api/neural/nodes/'+node['id']).json()['original_url']
    assert (tmp_path/'backups/before-neural-v1.db').exists()


def test_neural_clear_removes_graph_and_keeps_revision_monotonic(client):
    upload(client,'primeiro.txt','Texto de teste de exclusão.')
    previous=client.get('/api/neural/graph').json()['revision']
    client.delete('/api/data',headers={'X-Jarvis-Confirm':'DELETE'})
    graph=client.get('/api/neural/graph').json()
    assert graph['nodes']==[] and graph['edges']==[] and graph['revision']>previous
    upload(client,'segundo.txt','Outro conhecimento preservado depois da exclusão.')
    assert client.get('/api/neural/graph').json()['total']==1


@pytest.mark.asyncio
async def test_memory_tool_is_json_serializable_and_requires_document_consent(client, app):
    from app.ai import execute_tool
    upload(client,'local.txt','Astronomia: estrelas e planetas do sistema solar.')
    with app.state.sessions() as db:
        with pytest.raises(ValueError):
            await execute_tool('search_neural_memory','{"query":"planetas"}',app.state.settings,db,False)
        result=await execute_tool('search_neural_memory','{"query":"planetas"}',app.state.settings,db,True)
        assert result and 'planetas' in json.dumps(result,ensure_ascii=False)


def test_automatic_context_is_opt_in_and_answer_records_actual_sources(client, app, monkeypatch):
    from types import SimpleNamespace
    from app import ai
    app.state.settings.openai_key='test-only'
    document=upload(client,'astronomia.txt','Astronomia: planetas com órbitas. MARCADOR_PRIVADO_DO_DOCUMENTO.')
    payloads=[]
    class Provider:
        def __init__(self,**kwargs): self.chat=SimpleNamespace(completions=self)
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def create(self,**kwargs):
            payloads.append(kwargs['messages'])
            async def chunks():
                yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='Resposta de teste.',tool_calls=None))])
            return chunks()
    monkeypatch.setattr(ai,'AsyncOpenAI',Provider)
    assert client.post('/api/chat',json={'text':'Explique astronomia e planetas','allow_documents':False}).status_code==200
    assert 'MARCADOR_PRIVADO' not in json.dumps(payloads[0])
    assert client.post('/api/chat',json={'text':'Explique astronomia e planetas','allow_documents':True}).status_code==200
    assert 'MARCADOR_PRIVADO' in json.dumps(payloads[1])
    graph=client.get('/api/neural/graph').json()
    assert any(e['target']==document['node_id'] and e['relation']=='source' for e in graph['edges'])
