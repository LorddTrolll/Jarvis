import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import ai, services
from app.config import Settings
from app.main import create_app


def test_search_adapter_real_contract_mocked_transport(client, app, monkeypatch):
    app.state.settings.search_key = 'test-key'
    original = httpx.AsyncClient
    def handler(request):
        assert str(request.url).startswith('https://api.search.brave.com/res/v1/web/search')
        assert request.headers['X-Subscription-Token'] == 'test-key'
        return httpx.Response(200, json={'web': {'results': [
            {'title': 'Fonte', 'url': 'https://example.org/noticia', 'description': 'Trecho'},
            {'title': 'Inválido', 'url': 'javascript:alert(1)'},
        ]}})
    monkeypatch.setattr(services.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    result = client.post('/api/search', json={'query': 'visão computacional'}).json()
    assert len(result['results']) == 1
    assert client.get('/api/searches').json()[0]['query'] == 'visão computacional'


def test_telegram_approval_is_session_bound_one_use_and_exact(client, app, monkeypatch):
    app.state.settings.telegram_token = 'test-token'
    calls = []
    async def send(settings, recipient, text):
        calls.append((recipient, text))
        return '42'
    monkeypatch.setattr(services, 'send_telegram', send)
    draft = client.post('/api/drafts', json={'recipient': '1234', 'text': 'Revisada'}).json()
    path = f"/api/drafts/{draft['id']}"
    approval = client.post(path + '/approve').json()
    assert calls == []
    with TestClient(app) as other:
        other.post('/api/session', json={'password': 'teste-seguro'})
        assert other.post(path + '/send', json=approval).status_code == 403
    approval = client.post(path + '/approve').json()
    duplicate = client.post(path + '/approve').json()
    response = client.post(path + '/send', json=approval)
    assert response.json() == {'state': 'sent', 'external_id': '42'}
    assert client.post(path + '/send', json=approval).status_code == 403
    assert client.post(path + '/send', json=duplicate).status_code == 409
    assert calls == [('1234', 'Revisada')]
    assert client.get('/api/audit').json()[0]['action'] == 'message_sent'


def test_telegram_transport_contract(client, app, monkeypatch):
    app.state.settings.telegram_token = 'test-only'
    original = httpx.AsyncClient
    def handler(request):
        assert request.url.host == 'api.telegram.org'
        assert json.loads(request.content) == {'chat_id': '-1234', 'text': 'Mensagem'}
        return httpx.Response(200, json={'ok': True, 'result': {'message_id': 87}})
    monkeypatch.setattr(services.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    item = client.post('/api/drafts', json={'recipient': '-1234', 'text': 'Mensagem'}).json()
    path = f"/api/drafts/{item['id']}"
    token = client.post(path + '/approve').json()
    assert client.post(path + '/send', json=token).json()['external_id'] == '87'


def test_delivery_error_never_claims_sent(client, app, monkeypatch):
    app.state.settings.telegram_token = 'test-only'
    async def fail(*args):
        raise HTTPException(502, 'Entrega incerta')
    monkeypatch.setattr(services, 'send_telegram', fail)
    item = client.post('/api/drafts', json={'recipient': '55', 'text': 'Teste'}).json()
    path = f"/api/drafts/{item['id']}"
    token = client.post(path + '/approve').json()
    assert client.post(path + '/send', json=token).status_code == 502
    assert client.get('/api/drafts').json()[0]['state'] == 'uncertain'
    assert client.post(path + '/approve').status_code == 409


@pytest.mark.asyncio
async def test_tool_permissions_validation_and_document_consent(app):
    with app.state.sessions() as db:
        with pytest.raises(ValueError):
            await ai.execute_tool('send_approved_message', '{}', app.state.settings, db, False)
        with pytest.raises(ValueError):
            await ai.execute_tool('search_personal_files', '{"query":"segredo"}', app.state.settings, db, False)
        with pytest.raises(ValueError):
            await ai.execute_tool('open_panel', '{"panel_name":"terminal"}', app.state.settings, db, False)
    names = [t['function']['name'] for t in ai.tools(False)]
    assert 'search_personal_files' not in names
    assert not any('send' in name or 'approve' in name or 'shell' in name for name in names)


def test_llm_stream_and_structured_tool_roundtrip(client, app, monkeypatch):
    app.state.settings.openai_key = 'test-only'
    invocations = []
    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=self)
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def create(self, **kwargs):
            invocations.append(kwargs)
            async def stream():
                if len(invocations) == 1:
                    yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=None, tool_calls=[SimpleNamespace(index=0, id='call1', function=SimpleNamespace(name='create_task', arguments='{"title":"Criada pela ferramenta"}'))]))])
                else:
                    for text in ['Tarefa ', 'criada.']:
                        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=text, tool_calls=None))])
            return stream()
    monkeypatch.setattr(ai, 'AsyncOpenAI', FakeOpenAI)
    response = client.post('/api/chat', json={'text': 'Organize meu dia'})
    assert response.status_code == 200
    assert 'Tarefa ' in response.text and 'criada.' in response.text
    assert client.get('/api/tasks').json()[0]['title'] == 'Criada pela ferramenta'
    assert len(invocations) == 2 and invocations[0]['stream']
    assert client.get('/api/messages').json()[-1]['content'] == 'Tarefa criada.'
