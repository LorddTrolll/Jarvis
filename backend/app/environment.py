"""Contexto local e clima real; nenhum histórico de coordenadas é persistido."""
import asyncio
import math
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class Place(Coordinates):
    name: str = Field(min_length=1, max_length=160)


class EnvironmentContext(BaseModel):
    timezone: str = Field(default="UTC", max_length=100)
    place: Place | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Fuso horário inválido.")
        return value


WEATHER_LABELS = {
    0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Garoa leve", 53: "Garoa", 55: "Garoa intensa",
    56: "Garoa congelante", 57: "Garoa congelante intensa", 61: "Chuva leve", 63: "Chuva", 65: "Chuva forte",
    66: "Chuva congelante", 67: "Chuva congelante forte", 71: "Neve leve", 73: "Neve", 75: "Neve forte",
    77: "Grãos de neve", 80: "Pancadas leves", 81: "Pancadas de chuva", 82: "Pancadas fortes",
    85: "Pancadas de neve", 86: "Pancadas fortes de neve", 95: "Trovoadas", 96: "Trovoadas com granizo", 99: "Trovoadas com granizo forte",
}


class EnvironmentService:
    def __init__(self, transport=None):
        self.transport = transport
        self.cache = {}
        self.reverse_lock = asyncio.Lock()
        self.last_reverse = 0.0

    async def request(self, url, params):
        # Hosts fixos, TLS verificado, sem redirecionamentos ou URLs fornecidas pelo cliente.
        try:
            async with httpx.AsyncClient(timeout=12, transport=self.transport, follow_redirects=False,
                                         headers={"User-Agent": "JarvisAI/0.3 (https://github.com/LorddTrolll/Jarvis)"}) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError()
                return data
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, "O serviço de localização ou clima está indisponível. Tente novamente em instantes.") from None

    async def cached(self, key, fetch, ttl=600):
        entry = self.cache.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]
        value = await fetch()
        if len(self.cache) >= 256:
            self.cache.clear()
        self.cache[key] = (time.monotonic() + ttl, value)
        return value

    async def cities(self, name):
        async def fetch():
            data = await self.request("https://geocoding-api.open-meteo.com/v1/search",
                                      {"name": name, "count": 6, "language": "pt", "format": "json"})
            try:
                results = []
                for r in data.get("results") or []:
                    label = ", ".join(dict.fromkeys(str(v) for v in [r.get("name"), r.get("admin1"), r.get("country")] if v))[:160]
                    place = Place(name=label, latitude=r["latitude"], longitude=r["longitude"])
                    zone = r.get("timezone", "UTC")
                    ZoneInfo(zone)
                    results.append({**place.model_dump(), "timezone": zone})
                return results
            except (KeyError, TypeError, AttributeError, ValueError, ZoneInfoNotFoundError):
                raise HTTPException(503, "O provedor não retornou cidades válidas.") from None
        return await self.cached(("cities", name.casefold()), fetch, 86400)

    async def reverse(self, latitude, longitude):
        lat, lon = round(latitude, 2), round(longitude, 2)
        async def fetch():
            async with self.reverse_lock:
                delay = 1.1 - (time.monotonic() - self.last_reverse)
                if delay > 0:
                    await asyncio.sleep(delay)
                self.last_reverse = time.monotonic()
                data = await self.request("https://nominatim.openstreetmap.org/reverse",
                                          {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 10, "accept-language": "pt-BR"})
            address = data.get("address") or {}
            if not isinstance(address, dict):
                raise HTTPException(503, "Não foi possível identificar a cidade.")
            city = next((address.get(k) for k in ["city", "town", "village", "municipality", "county"] if address.get(k)), "Localização atual")
            return {"name": ", ".join(dict.fromkeys(str(v) for v in [city, address.get("state"), address.get("country")] if v))[:160],
                    "latitude": lat, "longitude": lon}
        return await self.cached(("reverse", lat, lon), fetch, 86400)

    async def weather(self, latitude, longitude):
        lat, lon = round(latitude, 2), round(longitude, 2)
        async def fetch():
            data = await self.request("https://api.open-meteo.com/v1/forecast", {
                "latitude": lat, "longitude": lon, "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day",
                "daily": "temperature_2m_max,temperature_2m_min", "forecast_days": 1, "timezone": "auto",
            })
            try:
                current, daily = data["current"], data["daily"]
                values = [current[k] for k in ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "weather_code", "is_day"]]
                values += [daily["temperature_2m_max"][0], daily["temperature_2m_min"][0]]
                if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values):
                    raise ValueError()
                ZoneInfo(data["timezone"])
                datetime.fromisoformat(current["time"])
                return {"temperature": values[0], "humidity": values[1], "feels_like": values[2],
                        "code": int(values[3]), "is_day": bool(values[4]), "high": values[5], "low": values[6],
                        "description": WEATHER_LABELS.get(int(values[3]), "Condição não informada"),
                        "timezone": data["timezone"], "observed_at": current["time"],
                        "fetched_at": datetime.now(timezone.utc).isoformat(), "source": "Open-Meteo"}
            except (KeyError, IndexError, TypeError, ValueError, ZoneInfoNotFoundError):
                raise HTTPException(503, "O provedor não retornou condições meteorológicas válidas.") from None
        return await self.cached(("weather", lat, lon), fetch)


def router(service, authenticate):
    routes = APIRouter(prefix="/api/environment", dependencies=[Depends(authenticate)])

    @routes.get("/cities")
    async def cities(name: str = Query(min_length=2, max_length=100)):
        if len(name.strip()) < 2:
            raise HTTPException(422, "Informe pelo menos dois caracteres para buscar a cidade.")
        return await service.cities(name.strip())

    @routes.post("/reverse")
    async def reverse(body: Coordinates):
        return await service.reverse(body.latitude, body.longitude)

    @routes.post("/weather")
    async def weather(body: Coordinates):
        return await service.weather(body.latitude, body.longitude)

    return routes
