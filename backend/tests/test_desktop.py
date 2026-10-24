from collections import namedtuple
import secrets

from fastapi.testclient import TestClient
from app.main import create_app
from app.system import SystemMonitor


def test_desktop_capability_preserves_password_and_rejects_remote(app):
    token = secrets.token_urlsafe(32)
    app.state.settings.desktop_token = token
    with TestClient(app, client=("127.0.0.1", 50000)) as local:
        assert local.get('/api/tasks').status_code == 401
        assert local.post('/api/session', json={}, headers={'X-Jarvis-Desktop': 'invalid'}).status_code == 401
        result = local.post('/api/session', json={}, headers={'X-Jarvis-Desktop':token})
        assert result.status_code == 200
        assert 'HttpOnly' in result.headers['set-cookie']
        assert token not in result.text and token not in result.headers['set-cookie']
        assert local.get('/api/tasks').status_code == 200
    with TestClient(app, client=("203.0.113.5", 50000)) as remote:
        assert remote.post('/api/session', json={}, headers={'X-Jarvis-Desktop': token}).status_code == 401
    app.state.settings.desktop_token = ''
    with TestClient(app, client=("127.0.0.1", 50000)) as standard:
        assert standard.post('/api/session', json={}).status_code == 401
        assert standard.post('/api/session', json={'password':'teste-seguro'}).status_code == 200


def test_local_empty_password_still_requires_loopback(app):
    app.state.settings.password = ''
    with TestClient(app, client=("127.0.0.1", 50000)) as local:
        assert local.post('/api/session', json={}).status_code == 200
    with TestClient(app, client=("203.0.113.5", 50000)) as remote:
        assert remote.post('/api/session', json={}).status_code == 403


def test_real_metrics_are_authenticated(app, client):
    with TestClient(app) as anonymous:
        assert anonymous.get('/api/system').status_code == 401
    result = client.get('/api/system')
    assert result.status_code == 200
    data = result.json()
    assert 0 <= data['memory_percent'] <= 100
    assert data['cpu_percent'] is None or 0 <= data['cpu_percent'] <= 100
    assert set(data) == {'cpu_percent','memory_percent','download_bps','upload_bps','sampled_at'}


def test_telemetry_uses_deltas_not_invented_network_percentage(monkeypatch):
    import app.system as module
    Cpu = namedtuple('Cpu', 'user system idle')
    Net = namedtuple('Net', 'bytes_recv bytes_sent')
    point = {'time':100.0,'cpu':Cpu(10,10,80),'net':Net(100,200)}
    monkeypatch.setattr(module.time,'monotonic',lambda:point['time'])
    monkeypatch.setattr(module.psutil,'cpu_times',lambda:point['cpu'])
    monkeypatch.setattr(module.psutil,'net_io_counters',lambda:point['net'])
    monitor = SystemMonitor()
    assert monitor.sample()['cpu_percent'] is None
    point.update(time=102.0,cpu=Cpu(15,15,90),net=Net(2148,1224))
    sample = monitor.sample()
    assert sample['cpu_percent'] == 50
    assert sample['download_bps'] == 1024 and sample['upload_bps'] == 512


def test_daily_briefing_uses_real_tasks_and_temporary_mode(client):
    client.post('/api/tasks',json={'title':'Revisar o projeto','priority':'alta'})
    response=client.post('/api/chat',json={'text':'Bom dia','temporary':True,'environment':{'timezone':'America/Sao_Paulo'}})
    assert response.status_code == 200
    assert 'daily_briefing' in response.text
    assert 'Revisar o projeto' in response.text and '1 tarefa(s)' in response.text
    assert client.get('/api/messages').json() == []
