import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(Settings(_env_file=None, data_dir=tmp_path, password="teste-seguro", openai_key="", search_key="", youtube_api_key="", telegram_token=""))


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        assert client.post('/api/session', json={'password': 'teste-seguro'}).status_code == 200
        yield client
