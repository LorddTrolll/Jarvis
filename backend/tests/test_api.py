import io
import json
from datetime import datetime, timedelta

from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.config import Settings
from app.database import Message, now
from app.main import create_app


def events(response):
    assert response.status_code == 200
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]


def test_auth_cookie_origins_and_logout(app):
    with TestClient(app) as c:
        assert c.get('/api/tasks').status_code == 401
        assert c.post('/api/session', json={'password': 'errada'}).status_code == 401
        response = c.post('/api/session', json={'password': 'teste-seguro'})
        cookie = response.headers['set-cookie']
        assert 'HttpOnly' in cookie and 'SameSite=strict' in cookie
        assert c.get('/api/tasks').status_code == 200
        assert c.post('/api/tasks', json={'title': 'bloqueada'}, headers={'Origin': 'https://site-externo.test'}).status_code == 403
        assert c.post('/api/tasks', json={'title': 'válida'}, headers={'Origin': 'http://localhost:5173'}).status_code == 201
        c.delete('/api/session')
        assert c.get('/api/tasks').status_code == 401


def test_task_crud_and_persistence(client, app):
    assert client.post('/api/tasks', json={'title': '  '}).status_code == 422
    assert client.post('/api/tasks', json={'title': 'x', 'due_at': '2026-10-25T15:00'}).status_code == 422
    created = client.post('/api/tasks', json={'title': 'Revisar Jarvis', 'priority': 'alta', 'due_at': '2026-10-25T15:00:00-03:00'})
    assert created.status_code == 201
    task_id = created.json()['id']
    assert client.patch(f'/api/tasks/{task_id}', json={'done': True}).json()['done']
    assert datetime.fromisoformat(client.get('/api/tasks').json()[0]['due_at']).isoformat() == '2026-10-25T18:00:00+00:00'
    with TestClient(create_app(app.state.settings)) as restored:
        restored.post('/api/session', json={'password': 'teste-seguro'})
        assert restored.get('/api/tasks').json()[0]['title'] == 'Revisar Jarvis'
    assert client.delete(f'/api/tasks/{task_id}').status_code == 200
    assert client.get('/api/tasks').json() == []


def test_local_chat_tools_and_history(client):
    result = events(client.post('/api/chat', json={'text': 'Jarvis, crie tarefa Testar câmera'}))
    assert result[-1]['type'] == 'done'
    assert client.get('/api/tasks').json()[0]['title'] == 'Testar câmera'
    result = events(client.post('/api/chat', json={'text': 'Jarvis, abra minhas tarefas'}))
    assert result[0]['result'] == {'action': 'open_panel', 'panel': 'tasks'}
    result = events(client.post('/api/chat', json={'text': 'Jarvis, desligue a câmera'}))
    assert result[0]['result']['action'] == 'disable_camera'
    result = events(client.post('/api/chat', json={'text': 'Qual é a previsão do tempo?'}))
    assert 'não está configurado' in result[0]['text']
    assert len(client.get('/api/messages').json()) == 8
    result = events(client.post('/api/chat', json={'text': 'crie tarefa ' + 'x' * 301}))
    assert '300 caracteres' in result[1]['text']
    assert len(client.get('/api/tasks').json()) == 1


def test_documents_txt_docx_and_delete(client):
    response = client.post('/api/documents', files={'file': ('../notas.txt', 'Projeto de visão computacional. Pinça seleciona elementos.'.encode())})
    assert response.status_code == 201
    doc_id = response.json()['id']
    assert response.json()['name'] == 'notas.txt'
    result = client.post('/api/documents/search', json={'query': 'visao pinça'}).json()
    assert result[0]['document_id'] == doc_id and 'computacional' in result[0]['excerpt']
    word = Document(); word.add_paragraph('Agenda de desenvolvimento do Jarvis')
    data = io.BytesIO(); word.save(data)
    assert client.post('/api/documents', files={'file': ('agenda.docx', data.getvalue())}).status_code == 201
    assert len(client.get('/api/documents').json()) == 2
    client.delete(f'/api/documents/{doc_id}')
    assert client.post('/api/documents/search', json={'query': 'pinça'}).json() == []


def test_reject_unsafe_and_unreadable_documents(client):
    assert client.post('/api/documents', files={'file': ('script.html', b'<script>bad</script>')}).status_code == 415
    assert client.post('/api/documents', files={'file': ('bad.pdf', b'invalido')}).status_code == 422
    writer = PdfWriter(); writer.add_blank_page(width=72, height=72)
    data = io.BytesIO(); writer.write(data)
    assert client.post('/api/documents', files={'file': ('imagem.pdf', data.getvalue())}).status_code == 422
    assert client.post('/api/documents', files={'file': ('big.txt', b'x' * 10_000_001)}).status_code == 413


def test_pdf_with_text_is_extracted_and_cited(client):
    writer = PdfWriter()
    page = writer.add_blank_page(width=500, height=500)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 50 400 Td (Jarvis e inteligencia multimodal) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    buffer = io.BytesIO(); writer.write(buffer)
    assert client.post('/api/documents', files={'file': ('texto.pdf', buffer.getvalue())}).status_code == 201
    result = client.post('/api/documents/search', json={'query': 'multimodal'}).json()
    assert result[0]['name'] == 'texto.pdf' and 'inteligencia' in result[0]['excerpt']


def test_no_fabricated_search_or_integrations(client):
    assert client.post('/api/search', json={'query': 'notícias'}).status_code == 503
    connectors = client.get('/api/integrations').json()
    assert all(not c['configured'] for c in connectors)
    assert len([c for c in connectors if c['mode'] == 'real']) == 1
    assert 'openai_key' not in client.get('/api/status').text


def test_sensitive_actions_and_clear(client):
    draft = client.post('/api/drafts', json={'recipient': '12345', 'text': 'Mensagem para revisar'}).json()
    assert draft['state'] == 'draft'
    assert client.post(f"/api/drafts/{draft['id']}/send", json={'token': 'falso-' * 8}).status_code == 403
    assert client.post(f"/api/drafts/{draft['id']}/approve").status_code == 503
    assert client.delete('/api/data').status_code == 400
    assert client.delete('/api/data', headers={'X-Jarvis-Confirm': 'DELETE'}).status_code == 200
    assert client.get('/api/drafts').json() == []


def test_retention_is_applied_at_start(tmp_path):
    config = Settings(_env_file=None, data_dir=tmp_path, password='segura', history_days=7)
    app = create_app(config)
    with app.state.sessions() as db:
        db.add(Message(role='user', content='antiga', created_at=now() - timedelta(days=10)))
        db.add(Message(role='user', content='recente'))
        db.commit()
    with TestClient(app) as c:
        c.post('/api/session', json={'password': 'segura'})
        assert [m['content'] for m in c.get('/api/messages').json()] == ['recente']


def test_login_rate_limit(app):
    with TestClient(app) as c:
        for _ in range(10):
            assert c.post('/api/session', json={'password': 'errada'}).status_code == 401
        assert c.post('/api/session', json={'password': 'teste-seguro'}).status_code == 429
