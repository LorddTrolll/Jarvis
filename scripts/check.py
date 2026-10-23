"""Readiness local: interface, autenticação, SQLite e pesos, sem alterar dados do usuário."""
import hashlib
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
import httpx
from app.config import Settings

settings = Settings(_env_file=root / '.env')
with httpx.Client(base_url='http://127.0.0.1:8000', trust_env=False, timeout=10) as client:
    assert client.get('/api/health').json()['status'] == 'ok', 'Backend indisponível'
    response = client.post('/api/session', json={'password': settings.password})
    assert response.status_code == 200, 'Falha de autenticação: verifique configuração do backend'
    response = client.get('/api/tasks')
    assert response.status_code == 200 and isinstance(response.json(), list), 'Falha ao consultar SQLite'
    status = client.get('/api/status').json()
    client.delete('/api/session')
with httpx.Client(trust_env=False, timeout=10) as client:
    assert 'JARVIS' in client.get('http://127.0.0.1:5173').text, 'Frontend indisponível'
model = root / 'frontend/public/models/hand_landmarker.task'
assert hashlib.sha256(model.read_bytes()).hexdigest() == 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1', 'Modelo ausente ou inválido'
print('OK: frontend, backend, autenticação, consulta SQLite e checksum do modelo.')
print('IA:', 'chave configurada (validar provedor)' if status['ai_configured'] else 'aguardando chave')
print('Busca:', 'chave configurada (validar provedor)' if status['search_configured'] else 'aguardando chave')
