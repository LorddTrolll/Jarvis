import json
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from app.environment import EnvironmentService


def provider(request):
    if request.url.host == "geocoding-api.open-meteo.com":
        return httpx.Response(200, json={"results": [{"name": "Recife", "admin1": "Pernambuco", "country": "Brasil", "latitude": -8.05, "longitude": -34.88, "timezone": "America/Recife"}]})
    if request.url.host == "nominatim.openstreetmap.org":
        return httpx.Response(200, json={"address": {"city": "Recife", "state": "Pernambuco", "country": "Brasil"}})
    return httpx.Response(200, json={"timezone": "America/Recife", "current": {"temperature_2m": 28.4, "apparent_temperature": 31, "relative_humidity_2m": 71, "weather_code": 2, "is_day": 1, "time": "2026-10-24T10:00"}, "daily": {"temperature_2m_max": [30], "temperature_2m_min": [24]}})


def test_environment_auth_validation_and_no_gps_in_request_url(app, client):
    app.state.environment.transport = httpx.MockTransport(provider)
    with TestClient(app) as anonymous:
        assert anonymous.post('/api/environment/weather', json={"latitude": 0, "longitude": 0}).status_code == 401
    assert client.post('/api/environment/weather', json={"latitude": 91, "longitude": 0}).status_code == 422
    assert client.post('/api/environment/weather', json={"latitude": "nan", "longitude": 0}).status_code == 422
    cities = client.get('/api/environment/cities', params={"name": "Recife"}).json()
    assert cities[0]['timezone'] == 'America/Recife'
    result = client.post('/api/environment/weather', json={"latitude": -8.05193, "longitude": -34.88191})
    assert result.status_code == 200 and result.json()['temperature'] == 28.4
    assert result.json()['description'] == 'Parcialmente nublado'
    assert 'latitude' not in str(result.request.url)
    assert client.get('/api/environment/weather', params={"latitude": 0, "longitude": 0}).status_code in (404, 405)


@pytest.mark.asyncio
async def test_weather_cache_rounds_coordinates_and_keeps_provider_data():
    requests = []
    def capture(request):
        requests.append(request)
        return provider(request)
    service = EnvironmentService(httpx.MockTransport(capture))
    first = await service.weather(-8.05193, -34.88191)
    second = await service.weather(-8.05201, -34.882)
    assert first == second and len(requests) == 1
    assert requests[0].url.params['latitude'] == '-8.05'
    reverse = await service.reverse(-8.05193, -34.88191)
    assert reverse['name'] == 'Recife, Pernambuco, Brasil'
    assert reverse['latitude'] == -8.05
    assert 'JarvisAI' in requests[-1].headers['user-agent']


@pytest.mark.parametrize('payload', [{}, {"current": {"temperature_2m": None}}])
def test_weather_outage_is_explicit(app, client, payload):
    app.state.environment.transport = httpx.MockTransport(lambda _: httpx.Response(200, json=payload))
    result = client.post('/api/environment/weather', json={"latitude": 0, "longitude": 0})
    assert result.status_code == 503
    assert 'temperature' not in result.json()


def stream_answer(client, text, context=None):
    body = {"text": text, "temporary": True, "environment": context}
    response = client.post('/api/chat', json=body)
    assert response.status_code == 200
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]


def test_spoken_local_context_without_llm_and_temporary_privacy(app, client):
    app.state.environment.transport = httpx.MockTransport(provider)
    context = {"timezone": "America/Recife", "place": {"name": "Recife", "latitude": -8.05, "longitude": -34.88}}
    events = stream_answer(client, 'Jarvis, que horas são?', context)
    assert any('horas e' in e.get('text', '') and 'America/Recife' in e['text'] for e in events)
    events = stream_answer(client, 'que dia é hoje?', context)
    assert any(str(datetime.now(ZoneInfo('America/Recife')).year) in e.get('text', '') for e in events)
    events = stream_answer(client, 'como está o tempo?', context)
    assert any('28.4 graus Celsius' in e.get('text', '') and 'Open-Meteo' in e['text'] for e in events)
    assert client.get('/api/messages').json() == []
    assert client.get('/api/neural/graph').json()['total'] == 0
    events = stream_answer(client, 'onde estou?', {"timezone": "UTC"})
    assert any(e.get('result', {}).get('action') == 'open_location' for e in events)
    assert client.post('/api/chat', json={"text": "horas", "environment": {"timezone": "bad/timezone"}}).status_code == 422


def test_unavailable_weather_does_not_claim_success(app, client):
    app.state.environment.transport = httpx.MockTransport(lambda _: httpx.Response(503))
    events = stream_answer(client, 'clima', {"timezone": "UTC", "place": {"name": "Recife", "latitude": -8.05, "longitude": -34.88}})
    assert any('Não consegui consultar' in e.get('text', '') for e in events)
